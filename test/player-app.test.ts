import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { exportReel, loadAssets, registerPlayerApp } from "@/lib/apps/player";
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
  expect(content._meta.ui.csp.connectDomains).toEqual(["https://*.videodb.io", "https://*.cloudfront.net"]);
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

it("plays CloudFront streams, which VideoDB serves where no custom domain is set", async () => {
  const request = await connect();
  const stream = "https://d1zudc7ewmc6ey.cloudfront.net/v1/abc.m3u8";
  const direct = (await request("tools/call", { name: "show_video", arguments: { items: [{ stream_url: stream }] } })).result;
  expect(direct.structuredContent.items[0].stream_url).toBe(stream);
  const viaLink = (await request("tools/call", { name: "show_video", arguments: { items: [{ player_url: `https://player.dev.videodb.io/watch?v=${stream}` }] } })).result;
  expect(viaLink.structuredContent.items[0].stream_url).toBe(stream);
});

it("refuses a player link whose ?v= stream lives outside VideoDB", async () => {
  const request = await connect();
  const res = (await request("tools/call", { name: "show_video", arguments: { items: [{ player_url: "https://player.videodb.io/watch?v=https://evil.test/x.m3u8" }] } })).result;
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

describe("loadAssets", () => {
  it("lists one page without reading each image, so the grid returns at once", async () => {
    const vdb = fakeConnection({
      "GET assets": {
        assets: [
          { id: "m-1", type: "video", name: "Keynote", length: "61.5", stream_url: "https://stream.videodb.io/v/1.m3u8", thumbnail_url: "https://assets.videodb.io/thumb/1.jpg" },
          { id: "img-1", type: "image", name: "Logo", collection_id: "c-1" },
          { id: "a-1", type: "audio", name: "Intro" },
        ],
        pagination: { page: 1, page_size: 24, total_count: 3, total_pages: 1 },
      },
    });
    const page = await loadAssets(vdb, { collection_id: "c-1", page: 1 });
    expect(vdb.http.get).toHaveBeenCalledWith(["assets"], { params: { collection_id: "c-1", page: 1, page_size: 24 } }, { convert: false });
    expect(vdb.http.get).toHaveBeenCalledTimes(1);
    expect(page.assets).toEqual([
      expect.objectContaining({ id: "m-1", type: "video", length: 61.5, stream_url: "https://stream.videodb.io/v/1.m3u8", thumbnail_url: "https://assets.videodb.io/thumb/1.jpg", player_url: expect.stringContaining("player.videodb.io") }),
      expect.objectContaining({ id: "img-1", type: "image", url: undefined }),
      expect.objectContaining({ id: "a-1", type: "audio", url: undefined }),
    ]);
    expect(page.pagination?.total_count).toBe(3);
  });

  it("reads an image's file link by its ID, as the view does after the grid draws", async () => {
    const vdb = fakeConnection({ "GET image/img-1": { id: "img-1", name: "Logo", url: "https://api.videodb.io/a/tok.png" } });
    const page = await loadAssets(vdb, { ids: ["img-1"], collection_id: "c-1", page: 1 });
    expect(vdb.http.get).toHaveBeenCalledWith(["image", "img-1"], { params: { collection_id: "c-1" } }, { convert: false });
    expect(page.assets).toEqual([expect.objectContaining({ id: "img-1", type: "image", url: "https://api.videodb.io/a/tok.png" })]);
  });

  it("reads the given IDs, with an audio file's link from its single read", async () => {
    const vdb = fakeConnection({ "GET audio/a-1": { id: "a-1", name: "Intro", length: 30, url: "https://api.videodb.io/a/tok.mp3" } });
    const page = await loadAssets(vdb, { ids: ["a-1"], collection_id: "c-1", page: 1 });
    expect(page.assets).toEqual([expect.objectContaining({ id: "a-1", type: "audio", length: 30, url: "https://api.videodb.io/a/tok.mp3" })]);
  });

  it("refuses an ID that is not a video, audio or image", async () => {
    await expect(loadAssets(fakeConnection(), { ids: ["c-1"], page: 1 })).rejects.toThrow(/not a video, audio or image/);
  });
});

it("offers show_assets to the model on the player resource and keeps load_assets for the view", async () => {
  const request = await connect();
  const tools = (await request("tools/list")).result.tools;
  const show = tools.find((t: any) => t.name === "show_assets"), load = tools.find((t: any) => t.name === "load_assets");
  expect(show._meta.ui.resourceUri).toBe(tools.find((t: any) => t.name === "show_video")._meta.ui.resourceUri);
  expect(show._meta.ui.visibility).toBeUndefined();
  expect(load._meta.ui.visibility).toEqual(["app"]);
});
