import { afterEach, expect, it, vi } from "vitest";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { registerPlayerApp } from "@/lib/apps/player";

async function connect() {
  const server = new McpServer({ name: "player-test", version: "1.0.0" });
  registerPlayerApp(server);
  const [client, transport] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (m: any) => void>();
  let id = 0;
  client.onmessage = (m: any) => pending.get(m.id)?.(m);
  const request = async (method: string, params: Record<string, unknown> = {}): Promise<any> => {
    const requestId = ++id;
    const reply = new Promise((resolve) => pending.set(requestId, resolve));
    await client.send({ jsonrpc: "2.0", id: requestId, method, params }, {
      authInfo: { token: "t", clientId: "c", scopes: [], extra: { videodbApiKey: "sk-user" } },
    } as any);
    return reply;
  };
  await server.connect(transport);
  await client.start();
  await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return request;
}

const STREAM = "https://play.videodb.io/v1/abc.m3u8";

afterEach(() => vi.unstubAllGlobals());

it("points show_video at a content-versioned player resource that may reach VideoDB streams", async () => {
  const request = await connect();
  const tool = (await request("tools/list")).result.tools.find((t: any) => t.name === "show_video");
  const uri = tool._meta.ui.resourceUri;
  expect(uri).toMatch(/^ui:\/\/videodb\/player\/[0-9a-f]{12}$/);
  const [content] = (await request("resources/read", { uri })).result.contents;
  expect(content.text).toContain("<video");
  expect(content._meta.ui.csp.connectDomains).toEqual(["https://*.videodb.io"]);
});

it("returns the items with player links for the view and the text fallback", async () => {
  const request = await connect();
  const res = (await request("tools/call", { name: "show_video", arguments: { items: [{ stream_url: STREAM, title: "Goal", start: 3, end: 9 }] } })).result;
  const [item] = res.structuredContent.items;
  expect(item).toMatchObject({ stream_url: STREAM, title: "Goal", start: 3, end: 9 });
  expect(item.player_url).toContain(encodeURIComponent(STREAM));
  expect(res.content[0].text).toContain(item.player_url);
});

it("refuses streams outside videodb.io, which the player's CSP cannot load", async () => {
  const request = await connect();
  const res = (await request("tools/call", { name: "show_video", arguments: { items: [{ stream_url: "https://evil.test/x.m3u8" }] } })).result;
  expect(res.isError).toBe(true);
});

it("plays a player link that carries the stream URL itself", async () => {
  const request = await connect();
  const player_url = `https://player.videodb.io/watch?v=${STREAM}`;
  const res = (await request("tools/call", { name: "show_video", arguments: { items: [{ player_url }] } })).result;
  expect(res.structuredContent.items[0]).toMatchObject({ stream_url: STREAM, player_url });
});

it("resolves a slug player link through GET /player/<slug> with the caller's key", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { url: STREAM, title: "Launch" } })));
  vi.stubGlobal("fetch", fetchMock);
  const request = await connect();
  const player_url = "https://player.videodb.io/watch?v=h_zuvfHSbg4";
  const res = (await request("tools/call", { name: "show_video", arguments: { items: [{ player_url }] } })).result;
  expect(res.structuredContent.items[0]).toMatchObject({ stream_url: STREAM, player_url, title: "Launch" });
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toMatch(/\/player\/h_zuvfHSbg4$/);
  expect((init.headers as Record<string, string>)["x-access-token"]).toBe("sk-user");
});

it("asks for the stream_url when a slug can't be resolved", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, message: "Access denied" }), { status: 403 })));
  const request = await connect();
  const res = (await request("tools/call", { name: "show_video", arguments: { items: [{ player_url: "https://player.videodb.io/watch?v=private1" }] } })).result;
  expect(res.isError).toBe(true);
  expect(res.content[0].text).toContain("Access denied");
  expect(res.content[0].text).toContain("stream_url");
});
