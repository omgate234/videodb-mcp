/**
 * End-to-end test: full OAuth 2.1 flow + MCP handshake + tool calls,
 * exactly the way Claude.ai connects.
 *
 * Prereqs (three terminals, or run scripts/run-e2e-local.sh):
 *   1. node scripts/mock-videodb.mjs
 *   2. AUTH_SECRET=test-secret-0123456789 VIDEODB_API_BASE=http://127.0.0.1:4519 npm run dev   (or start)
 *   3. node scripts/e2e.mjs
 */
import { createHash, randomBytes } from "node:crypto";

const APP = process.env.APP_URL || "http://127.0.0.1:3000";
const API_KEY = "sk-e2e-test-key";
const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

let passed = 0;
let failed = 0;
function check(cond, name, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

async function parseMcpResponse(res) {
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (ct.includes("text/event-stream")) {
    const events = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return events[events.length - 1] ?? null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\nE2E against ${APP}\n`);

  // ---- discovery ----
  console.log("Discovery:");
  const prmPath = await fetch(`${APP}/.well-known/oauth-protected-resource/mcp`).then((r) => r.json());
  check(prmPath.resource === `${APP}/mcp`, "path-suffixed PRM resource is the /mcp URL", JSON.stringify(prmPath));
  check(Array.isArray(prmPath.authorization_servers) && prmPath.authorization_servers[0] === APP, "PRM points at this origin as AS");

  const prmRoot = await fetch(`${APP}/.well-known/oauth-protected-resource`).then((r) => r.json());
  check(prmRoot.resource === `${APP}/mcp`, "root PRM resource is the /mcp URL");

  const asMeta = await fetch(`${APP}/.well-known/oauth-authorization-server`).then((r) => r.json());
  check(asMeta.issuer === APP, "AS metadata issuer matches origin");
  check(asMeta.code_challenge_methods_supported?.includes("S256"), "S256 advertised");
  check(!!asMeta.registration_endpoint, "DCR endpoint advertised");
  check(asMeta.grant_types_supported?.includes("refresh_token"), "refresh_token grant advertised");

  // ---- 401 challenge ----
  console.log("Unauthenticated MCP request:");
  const unauth = await fetch(`${APP}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: {} }),
  });
  check(unauth.status === 401, "returns 401", `got ${unauth.status}`);
  const www = unauth.headers.get("www-authenticate") ?? "";
  check(www.includes("resource_metadata="), "WWW-Authenticate carries resource_metadata", www);

  // ---- DCR ----
  console.log("Dynamic client registration:");
  const reg = await fetch(`${APP}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Claude", redirect_uris: [REDIRECT_URI] }),
  });
  const client = await reg.json();
  check(reg.status === 201 && !!client.client_id, "registers and returns client_id");
  check(client.token_endpoint_auth_method === "none", "public client (auth method none)");

  // ---- authorize (consent page) ----
  console.log("Authorization + consent:");
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(12));
  const authUrl = new URL(`${APP}/oauth/authorize`);
  authUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: "videodb offline_access",
    resource: `${APP}/mcp`,
  }).toString();

  const consentRes = await fetch(authUrl);
  const consentHtml = await consentRes.text();
  check(consentRes.status === 200 && consentHtml.includes("VideoDB API key"), "consent page renders");
  const reqToken = consentHtml.match(/name="req_token" value="([^"]+)"/)?.[1];
  check(!!reqToken, "consent page embeds sealed req_token");

  // wrong key first
  const badSubmit = await fetch(`${APP}/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ req_token: reqToken, api_key: "sk-wrong", action: "approve" }),
  });
  const badHtml = await badSubmit.text();
  check(badSubmit.status === 200 && badHtml.includes("rejected"), "invalid API key is rejected with an error message");

  // correct key
  const submit = await fetch(`${APP}/oauth/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ req_token: reqToken, api_key: API_KEY, action: "approve" }),
    redirect: "manual",
  });
  check(submit.status === 302, "valid key → 302 back to Claude", `got ${submit.status}`);
  const location = new URL(submit.headers.get("location"));
  check(location.origin + location.pathname === REDIRECT_URI, "redirects to registered redirect_uri");
  check(location.searchParams.get("state") === state, "state round-trips");
  const code = location.searchParams.get("code");
  check(!!code, "authorization code issued");

  // ---- token exchange ----
  console.log("Token endpoint:");
  const badToken = await fetch(`${APP}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: client.client_id,
      code_verifier: "wrong-verifier-wrong-verifier-wrong-verifier",
    }),
  });
  const badTokenJson = await badToken.json();
  check(badToken.status === 400 && badTokenJson.error === "invalid_grant", "wrong PKCE verifier → invalid_grant");

  const tokenRes = await fetch(`${APP}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: client.client_id,
      code_verifier: verifier,
    }),
  });
  const tokens = await tokenRes.json();
  check(tokenRes.status === 200 && !!tokens.access_token, "code + verifier → access token");
  check(!!tokens.refresh_token, "refresh token issued");

  const reused = await fetch(`${APP}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
    }),
  });
  const refreshed = await reused.json();
  check(reused.status === 200 && !!refreshed.access_token && refreshed.refresh_token !== tokens.refresh_token, "refresh grant rotates tokens");

  // ---- MCP handshake ----
  console.log("MCP protocol:");
  const mcpHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${tokens.access_token}`,
  };

  const initRes = await fetch(`${APP}/mcp`, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "e2e", version: "1.0.0" },
      },
    }),
  });
  const init = await parseMcpResponse(initRes);
  check(initRes.status === 200 && init?.result?.serverInfo?.name === "videodb", "initialize succeeds", JSON.stringify(init)?.slice(0, 200));
  const sessionId = initRes.headers.get("mcp-session-id");
  if (sessionId) mcpHeaders["mcp-session-id"] = sessionId;
  const negotiated = init?.result?.protocolVersion;
  if (negotiated) mcpHeaders["mcp-protocol-version"] = negotiated;

  await fetch(`${APP}/mcp`, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  const listRes = await fetch(`${APP}/mcp`, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });
  const list = await parseMcpResponse(listRes);
  const tools = list?.result?.tools ?? [];
  check(tools.length === 16, "tools/list returns 16 tools", `got ${tools.length}`);
  const missingAnnotations = tools.filter((t) => !t.annotations || typeof t.annotations.readOnlyHint !== "boolean" || !(t.title || t.annotations.title));
  check(missingAnnotations.length === 0, "every tool has title + readOnlyHint annotation", missingAnnotations.map((t) => t.name).join(","));
  const del = tools.find((t) => t.name === "delete_video");
  check(del?.annotations?.destructiveHint === true, "delete_video is flagged destructive");

  async function callTool(id, name, args) {
    const res = await fetch(`${APP}/mcp`, {
      method: "POST",
      headers: mcpHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }),
    });
    return parseMcpResponse(res);
  }

  const collections = await callTool(3, "list_collections", {});
  const collText = collections?.result?.content?.[0]?.text ?? "";
  check(collText.includes("Default") && !collections?.result?.isError, "tools/call list_collections returns data from VideoDB API");

  const search = await callTool(4, "search_video", { video_id: "m-1", query: "rabbit" });
  check((search?.result?.content?.[0]?.text ?? "").includes("giant rabbit"), "tools/call search_video returns matches");

  const clip = await callTool(5, "generate_clip", { video_id: "m-1", timeline: [[10, 20]] });
  const clipText = clip?.result?.content?.[0]?.text ?? "";
  check(clipText.includes("clip.m3u8") && clipText.includes("player.videodb.io"), "tools/call generate_clip completes the async poll flow", clipText.slice(0, 200));

  const deleted = await callTool(6, "delete_video", { video_id: "m-1" });
  check((deleted?.result?.content?.[0]?.text ?? "").includes('"deleted": true'), "tools/call delete_video works");

  // expired/garbage token rejected
  const badAuth = await fetch(`${APP}/mcp`, {
    method: "POST",
    headers: { ...mcpHeaders, Authorization: "Bearer garbage" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list", params: {} }),
  });
  check(badAuth.status === 401, "garbage bearer token → 401");

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
