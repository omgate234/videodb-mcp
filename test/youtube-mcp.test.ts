import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mintAccessToken } from "@/lib/oauth";
import { POST } from "@/app/youtube-mcp/route";

const ORIGIN = "https://mcp.videodb.io";
const UPSTREAM = "https://creators.videodb.io/api/mcp";

const call = (auth?: string) =>
  POST(new Request(`${ORIGIN}/youtube-mcp`, {
    method: "POST",
    headers: { host: "mcp.videodb.io", "content-type": "application/json", accept: "application/json, text/event-stream", ...(auth && { authorization: auth }), cookie: "x=1" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }));

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-secret-test-secret-test-secret");
  vi.stubEnv("YOUTUBE_MCP_UPSTREAM", UPSTREAM);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/youtube-mcp", () => {
  it("challenges without a token and never calls upstream", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource/youtube-mcp");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relays the request with the same bearer and returns the upstream reply", async () => {
    const bearer = mintAccessToken({ key: "k", user_id: "u", client_id: "c", scope: "videodb", aud: `${ORIGIN}/youtube-mcp` });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ jsonrpc: "2.0", id: 1, result: { tools: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call(`Bearer ${bearer}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: { tools: [] } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(UPSTREAM);
    const sent = init.headers as Headers;
    expect(sent.get("authorization")).toBe(`Bearer ${bearer}`);
    expect(sent.get("cookie")).toBeNull();
    expect(new TextDecoder().decode(init.body)).toContain("tools/list");
  });
});
