/**
 * End-to-end test: the DirectorFE login bridge.
 *
 * scripts/e2e.mjs covers the flow with no bridge configured, where the user
 * pastes a key into the built-in consent page. This covers the other half: the
 * server redirects to DirectorFE for sign-in, and DirectorFE hands the minted
 * credential back over a server-to-server callback.
 *
 * The DirectorFE side is not run here — this stands in for it, making exactly
 * the calls it makes. What is being tested is videodb-mcp's half of the contract.
 *
 * Prereqs (three terminals):
 *   1. node scripts/mock-videodb.mjs
 *   2. AUTH_SECRET=test-secret-0123456789 \
 *      VIDEODB_API_BASE=http://127.0.0.1:4519 \
 *      DIRECTORFE_ORIGIN=http://127.0.0.1:4600 \
 *      DIRECTORFE_BRIDGE_SECRET=test-bridge-secret npm run dev
 *   3. node scripts/e2e-bridge.mjs
 */
import { createHash, randomBytes } from "node:crypto";

const APP = process.env.APP_URL || "http://127.0.0.1:3000";
const DIRECTORFE_ORIGIN = process.env.DIRECTORFE_ORIGIN || "http://127.0.0.1:4600";
const BRIDGE_SECRET = process.env.DIRECTORFE_BRIDGE_SECRET || "test-bridge-secret";
const MCP_TOKEN = "mcp-e2e-test-token";
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

const callback = (body, secret = BRIDGE_SECRET) =>
  fetch(`${APP}/oauth/authorize/callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret === null ? {} : { "x-bridge-secret": secret }),
    },
    body: JSON.stringify(body),
  });

async function main() {
  console.log(`\nE2E (DirectorFE bridge) against ${APP}\n`);

  // ---- register ----
  console.log("Setup:");
  const regRes = await fetch(`${APP}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: [REDIRECT_URI], client_name: "Claude" }),
  });
  const client = await regRes.json();
  check(regRes.status === 201 && !!client.client_id, "client registers");

  // ---- authorize redirects to DirectorFE instead of rendering consent ----
  console.log("Authorize → DirectorFE:");
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

  const authRes = await fetch(authUrl, { redirect: "manual" });
  check(authRes.status === 302, "authorize redirects rather than rendering a key form", `got ${authRes.status}`);

  const consentLocation = new URL(authRes.headers.get("location"));
  check(consentLocation.origin === DIRECTORFE_ORIGIN, "redirects to the configured DirectorFE origin", consentLocation.origin);
  check(consentLocation.pathname === "/connect/videodb-mcp", "lands on the consent route", consentLocation.pathname);

  const reqToken = consentLocation.searchParams.get("req_token");
  check(!!reqToken, "sealed req_token rides along in the query");
  check(!reqToken?.includes(client.client_id), "req_token is opaque, not the raw request");

  // ---- the callback is not open to the browser ----
  console.log("Callback authentication:");
  const noSecret = await callback({ req_token: reqToken, token: MCP_TOKEN }, null);
  check(noSecret.status === 401, "callback without the shared secret → 401", `got ${noSecret.status}`);

  const wrongSecret = await callback({ req_token: reqToken, token: MCP_TOKEN }, "not-the-secret");
  check(wrongSecret.status === 401, "callback with a wrong shared secret → 401", `got ${wrongSecret.status}`);

  const badReqToken = await callback({ req_token: "garbage", token: MCP_TOKEN });
  check(badReqToken.status === 400, "callback with a tampered req_token → 400", `got ${badReqToken.status}`);

  const noToken = await callback({ req_token: reqToken });
  check(noToken.status === 400, "callback with no credential → 400", `got ${noToken.status}`);

  const rejectedToken = await callback({ req_token: reqToken, token: "mcp-not-a-real-token" });
  const rejectedJson = await rejectedToken.json();
  check(
    rejectedToken.status === 400 && rejectedJson.error === "invalid_grant",
    "a credential VideoDB rejects never becomes a code",
    `got ${rejectedToken.status} ${rejectedJson.error}`
  );

  // ---- the happy path ----
  console.log("Callback → authorization code:");
  const okRes = await callback({ req_token: reqToken, token: MCP_TOKEN });
  const okJson = await okRes.json();
  check(okRes.status === 200 && !!okJson.redirect_to, "callback returns a redirect target", JSON.stringify(okJson).slice(0, 160));

  const back = new URL(okJson.redirect_to);
  check(back.origin + back.pathname === REDIRECT_URI, "redirect target is the registered redirect_uri");
  check(back.searchParams.get("state") === state, "state round-trips through the bridge");
  const code = back.searchParams.get("code");
  check(!!code, "authorization code issued");
  check(!code?.includes(MCP_TOKEN), "the credential is sealed, not readable in the code");

  // ---- PKCE still governs the exchange ----
  console.log("Token exchange:");
  const badPkce = await fetch(`${APP}/oauth/token`, {
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
  check(badPkce.status === 400, "bridge-issued code still requires the right PKCE verifier", `got ${badPkce.status}`);

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
  check(!tokens.access_token?.includes(MCP_TOKEN), "the credential is sealed inside the access token");

  // ---- the token actually works ----
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
        clientInfo: { name: "e2e-bridge", version: "1.0.0" },
      },
    }),
  });
  check(initRes.status === 200, "initialize succeeds with a bridge-issued token", `got ${initRes.status}`);

  const sessionId = initRes.headers.get("mcp-session-id");
  if (sessionId) mcpHeaders["mcp-session-id"] = sessionId;

  const callRes = await fetch(`${APP}/mcp`, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_collections", arguments: {} },
    }),
  });
  const callText = await callRes.text();
  check(
    callText.includes("Default"),
    "the mcp- credential reaches the VideoDB API on a real tool call",
    callText.slice(0, 200)
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
