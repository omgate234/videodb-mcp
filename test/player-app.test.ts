import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { exportReel, registerPlayerApp } from "@/lib/apps/player";
import { fakeConnection, raw } from "./harness";

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

it("refuses a reel clip without a video_id and a range", async () => {
  const request = await connect();
  const res = (await request("tools/call", { name: "show_video", arguments: { layout: "reel", items: [{ stream_url: STREAM, start: 1, end: 4 }] } })).result;
  expect(res.isError).toBe(true);
});

it("shows a reel with each clip's place in it, and hides export_reel from the model", async () => {
  const request = await connect();
  const items = [
    { video_id: "m-1", stream_url: STREAM, title: "Intro", start: 10, end: 20 },
    { video_id: "m-1", stream_url: STREAM, title: "Demo", start: 60, end: 75 },
  ];
  const res = (await request("tools/call", { name: "show_video", arguments: { layout: "reel", title: "Best bits", items } })).result;
  expect(res.structuredContent).toMatchObject({ layout: "reel", title: "Best bits", items: [{ video_id: "m-1", collection_id: "default", start: 10 }, { start: 60 }] });
  expect(res.content[0].text).toContain("0:25 reel of 2 clips");
  expect(res.content[0].text).toContain("at 0:10–0:25 in the reel");
  const tools = (await request("tools/list")).result.tools;
  expect(tools.find((t: any) => t.name === "export_reel")._meta.ui.visibility).toEqual(["app"]);
});

describe("exportReel", () => {
  const clips = [{ video_id: "m-1", collection_id: "default", start: 10, end: 20 }, { video_id: "m-2", collection_id: "c-2", start: 0, end: 5 }];
  const JOB = "https://api.videodb.io/async-response/j-1";
  const DL = "https://api.videodb.io/download/d-1";

  it("joins the clips in order, then renders the joined stream to an MP4", async () => {
    const vdb = fakeConnection({
      "POST compile": (body: any) => {
        expect(body).toEqual([{ video_id: "m-1", collection_id: "default", shots: [[10, 20]] }, { video_id: "m-2", collection_id: "c-2", shots: [[0, 5]] }]);
        return { stream_url: "https://stream.videodb.io/reel.m3u8" };
      },
      "POST download": (body: any) => {
        expect(body).toEqual({ stream_link: "https://stream.videodb.io/reel.m3u8", name: "reel.mp4" });
        return raw({ status: "processing", data: { id: "d-1", output_url: DL } });
      },
    });
    expect(await exportReel(vdb, { name: "reel.mp4", clips })).toEqual({ stage: "rendering", output_url: DL });
  });

  it("moves from joining to rendering to done as the jobs finish", async () => {
    const vdb = fakeConnection({
      [`GET ${JOB}`]: raw({ status: "done", response: { success: true, data: { stream_url: "https://stream.videodb.io/reel.m3u8" } } }),
      "POST download": { download_url: "https://files/reel.mp4" },
      [`GET ${DL}`]: raw({ status: "processing" }),
    });
    expect(await exportReel(vdb, { name: "reel.mp4", stage: "joining", output_url: JOB })).toEqual({ stage: "done", download_url: "https://files/reel.mp4" });
    expect(await exportReel(vdb, { name: "reel.mp4", stage: "rendering", output_url: DL })).toEqual({ stage: "rendering", output_url: DL });
  });

  it("refuses to poll a URL outside VideoDB", async () => {
    await expect(exportReel(fakeConnection(), { name: "r.mp4", stage: "rendering", output_url: "https://evil.test/x" })).rejects.toThrow();
  });
});
