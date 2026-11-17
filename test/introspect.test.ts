import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mintAccessToken, mintClientId, resourceAllowed } from "@/lib/oauth";
import { POST as introspect } from "@/app/oauth/introspect/route";
import { GET as authorize } from "@/app/oauth/authorize/route";

const ORIGIN = "https://mcp.videodb.io";
const CREATORS = "https://creators.videodb.io/api/mcp";

const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;

function introspectReq(token: string, auth = basic("creators", "s3cret")) {
  return new Request(`${ORIGIN}/oauth/introspect`, {
    method: "POST",
    headers: { host: "mcp.videodb.io", authorization: auth, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

const token = (aud: string, user_id: string | undefined) =>
  mintAccessToken({ key: "vdb-key", user_id, user_name: "Ada", client_id: "c", scope: "videodb", aud });

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-secret-test-secret-test-secret");
  vi.stubEnv("EXTERNAL_MCP_RESOURCES", `${CREATORS}/`);
  vi.stubEnv("INTROSPECTION_CLIENT_ID", "creators");
  vi.stubEnv("INTROSPECTION_CLIENT_SECRET", "s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("resourceAllowed", () => {
  const req = new Request(`${ORIGIN}/oauth/authorize`, { headers: { host: "mcp.videodb.io" } });
  it("accepts own MCP paths and configured external resources", () => {
    expect(resourceAllowed(req, `${ORIGIN}/mcp`)).toBe(true);
    expect(resourceAllowed(req, `${ORIGIN}/openai-mcp`)).toBe(true);
    expect(resourceAllowed(req, CREATORS)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(resourceAllowed(req, "https://evil.example/mcp")).toBe(false);
  });
});

describe("authorize resource check", () => {
  it("redirects with invalid_target for an unknown resource", async () => {
    const client_id = mintClientId(["https://client.example/cb"]);
    const url = new URL(`${ORIGIN}/oauth/authorize`);
    for (const [k, v] of Object.entries({ client_id, redirect_uri: "https://client.example/cb", response_type: "code", code_challenge: "x", resource: "https://evil.example/mcp", state: "st" }))
      url.searchParams.set(k, v);
    const res = await authorize(new Request(url, { headers: { host: "mcp.videodb.io" } }));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.searchParams.get("error")).toBe("invalid_target");
    expect(loc.searchParams.get("state")).toBe("st");
  });
});

describe("/oauth/introspect", () => {
  it("returns identity and key for a token minted for the external resource", async () => {
    const body = await (await introspect(introspectReq(token(CREATORS, "u-1")))).json();
    expect(body).toMatchObject({ active: true, iss: ORIGIN, aud: CREATORS, sub: "u-1", name: "Ada", scope: "videodb", videodb_api_key: "vdb-key" });
  });

  it("reports our own /mcp tokens inactive", async () => {
    expect(await (await introspect(introspectReq(token(`${ORIGIN}/mcp`, "u-1")))).json()).toEqual({ active: false });
  });

  it("reports tokens without a user id or garbage inactive", async () => {
    expect(await (await introspect(introspectReq(token(CREATORS, undefined)))).json()).toEqual({ active: false });
    expect(await (await introspect(introspectReq("nope"))).json()).toEqual({ active: false });
  });

  it("rejects wrong client credentials", async () => {
    const res = await introspect(introspectReq(token(CREATORS, "u-1"), basic("creators", "wrong")));
    expect(res.status).toBe(401);
  });

  it("is off when credentials are not configured", async () => {
    vi.stubEnv("INTROSPECTION_CLIENT_SECRET", "");
    expect((await introspect(introspectReq(token(CREATORS, "u-1")))).status).toBe(503);
  });
});
