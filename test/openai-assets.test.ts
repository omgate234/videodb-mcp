import { describe, expect, it } from "vitest";
import { z } from "zod";
import { annotationsFor, type ToolDef } from "@/lib/mcp/tool";
import { deleteAsset, getAsset, listAssets } from "@/lib/toolsets/openai/assets";
import { call, fakeConnection } from "./harness";

const COLL = { id: "c-1", name: "Demos", description: "Demo videos", isPublic: false, userId: "u" };
const COLL_OUT = { id: "c-1", name: "Demos", description: "Demo videos", is_public: false };
const VIDEO = { id: "m-1", collectionId: "c-1", name: "Keynote", length: 120, size: "1", streamUrl: "https://stream/x.m3u8", playerUrl: "https://player/x", userId: "u", thumbnail: "https://img/t.png" };
const VIDEO_OUT = { id: "m-1", collection_id: "c-1", name: "Keynote", length: 120, size: "1", stream_url: VIDEO.streamUrl, player_url: VIDEO.playerUrl, thumbnail: VIDEO.thumbnail };
const AUDIO = { id: "a-1", collectionId: "c-1", name: "Podcast", length: 60, size: "2", userId: "u" };
const AUDIO_OUT = { id: "a-1", collection_id: "c-1", name: "Podcast", length: 60, size: "2" };
const IMAGE = { id: "img-1", collectionId: "c-1", name: "Cover", url: "https://img/cover.png" };
const IMAGE_OUT = { id: "img-1", collection_id: "c-1", name: "Cover", url: IMAGE.url };
const RT = { id: "rts-1", name: "Gate cam", collectionId: "c-1", status: "connected", sampleRate: 30, mediaTypes: ["video"], createdAt: "2026-01-01T00:00:00Z" };
const RT_OUT = { id: "rts-1", name: "Gate cam", collection_id: "c-1", status: "connected", sample_rate: 30, media_types: ["video"], created_at: RT.createdAt };
const PARAMS = { params: { collection_id: "c-1" } };
const ONE_PAGE = { page: 1, page_size: 100, total_count: 1, total_pages: 1 };

// What the MCP listing serializes per tool — the OpenAI directory budget is measured on this.
const specBytes = (def: ToolDef<any>) =>
  JSON.stringify({
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: z.toJSONSchema(def.input, { io: "input", unrepresentable: "any" }),
    annotations: { title: def.title, ...annotationsFor(def) },
  }).length;

describe("openai assets: spec", () => {
  it("stays within the size budget and uses one annotation kind per tool", () => {
    expect(specBytes(listAssets)).toBeLessThanOrEqual(2000);
    expect(specBytes(getAsset)).toBeLessThanOrEqual(1000);
    expect(specBytes(deleteAsset)).toBeLessThanOrEqual(1000);
    expect([listAssets.kind, getAsset.kind, deleteAsset.kind]).toEqual(["read", "read", "destructive"]);
  });

  it("describes every asset_type in each description", () => {
    for (const def of [listAssets, getAsset, deleteAsset]) {
      for (const kind of ["collection", "video", "audio", "image", "rtstream"]) expect(def.description).toContain(`${kind}:`);
    }
  });
});

describe("openai assets: list_assets", () => {
  it("collection lists every collection", async () => {
    const vdb = fakeConnection({ "GET collection": { collections: [COLL] } });
    const { data, isError } = await call(listAssets, { asset_type: "collection" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ asset_type: "collection", items: [COLL_OUT], pagination: ONE_PAGE });
    expect(vdb.http.get).toHaveBeenCalledWith(["collection"]);
  });

  it("video lists the collection's videos", async () => {
    const vdb = fakeConnection({ "GET video": { videos: [VIDEO] } });
    const { data } = await call(listAssets, { asset_type: "video", collection_id: "c-1" }, vdb);
    expect(data).toEqual({ asset_type: "video", items: [VIDEO_OUT], pagination: ONE_PAGE });
    expect(vdb.http.get).toHaveBeenCalledWith(["video"], PARAMS);
  });

  it("audio lists the collection's audio files", async () => {
    const vdb = fakeConnection({ "GET audio": { audios: [AUDIO] } });
    const { data } = await call(listAssets, { asset_type: "audio", collection_id: "c-1" }, vdb);
    expect(data).toEqual({ asset_type: "audio", items: [AUDIO_OUT], pagination: ONE_PAGE });
    expect(vdb.http.get).toHaveBeenCalledWith(["audio"], PARAMS);
  });

  it("image lists the collection's images and pages client-side", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...IMAGE, id: `img-${i}` }));
    const vdb = fakeConnection({ "GET image": { images: many } });
    const { data } = await call(listAssets, { asset_type: "image", collection_id: "c-1", page: 2, page_size: 2 }, vdb);
    const out = data as { items: { id: string }[]; pagination: unknown };
    expect(out.items.map((i) => i.id)).toEqual(["img-2", "img-3"]);
    expect(out.pagination).toEqual({ page: 2, page_size: 2, total_count: 5, total_pages: 3 });
    expect(vdb.http.get).toHaveBeenCalledWith(["image"], PARAMS);
  });

  it("rtstream pages the account-scoped API with limit/offset", async () => {
    const vdb = fakeConnection({ "GET rtstream": { results: [RT] } });
    const { data } = await call(listAssets, { asset_type: "rtstream", collection_id: "c-1", page: 2, page_size: 10 }, vdb);
    expect(data).toEqual({ asset_type: "rtstream", items: [RT_OUT], pagination: { page: 2, page_size: 10 } });
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream"], { params: { limit: 10, offset: 10 } });
  });
});

describe("openai assets: get_asset", () => {
  it("collection", async () => {
    const vdb = fakeConnection({ "GET collection/c-1": COLL });
    const { data } = await call(getAsset, { asset_type: "collection", asset_id: "c-1" }, vdb);
    expect(data).toEqual(COLL_OUT);
    expect(vdb.http.get).toHaveBeenCalledWith(["collection", "c-1"]);
  });

  it("video", async () => {
    const vdb = fakeConnection({ "GET video/m-1": VIDEO });
    const { data } = await call(getAsset, { asset_type: "video", asset_id: "m-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual(VIDEO_OUT);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1"], PARAMS);
  });

  it("audio defaults collection_id to default", async () => {
    const vdb = fakeConnection({ "GET audio/a-1": AUDIO });
    const { data } = await call(getAsset, { asset_type: "audio", asset_id: "a-1" }, vdb);
    expect(data).toEqual(AUDIO_OUT);
    expect(vdb.http.get).toHaveBeenCalledWith(["audio", "a-1"], { params: { collection_id: "default" } });
  });

  it("image", async () => {
    const vdb = fakeConnection({ "GET image/img-1": IMAGE });
    const { data } = await call(getAsset, { asset_type: "image", asset_id: "img-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual(IMAGE_OUT);
    expect(vdb.http.get).toHaveBeenCalledWith(["image", "img-1"], PARAMS);
  });

  it("rtstream", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1": RT });
    const { data } = await call(getAsset, { asset_type: "rtstream", asset_id: "rts-1" }, vdb);
    expect(data).toEqual(RT_OUT);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1"]);
  });
});

describe("openai assets: delete_asset", () => {
  it("collection deletes and refuses default", async () => {
    const vdb = fakeConnection({ "DELETE collection/c-1": {} });
    const { data } = await call(deleteAsset, { asset_type: "collection", asset_id: "c-1" }, vdb);
    expect(data).toEqual({ deleted: true, collection_id: "c-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["collection", "c-1"]);
    const refused = await call(deleteAsset, { asset_type: "collection", asset_id: "default" }, vdb);
    expect(refused.isError).toBe(true);
    expect(vdb.http.delete).toHaveBeenCalledTimes(1);
  });

  it("video", async () => {
    const vdb = fakeConnection({ "DELETE video/m-1": {} });
    const { data } = await call(deleteAsset, { asset_type: "video", asset_id: "m-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual({ deleted: true, video_id: "m-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["video", "m-1"], PARAMS);
  });

  it("audio", async () => {
    const vdb = fakeConnection({ "DELETE audio/a-1": {} });
    const { data } = await call(deleteAsset, { asset_type: "audio", asset_id: "a-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual({ deleted: true, audio_id: "a-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["audio", "a-1"], PARAMS);
  });

  it("image", async () => {
    const vdb = fakeConnection({ "DELETE image/img-1": {} });
    const { data } = await call(deleteAsset, { asset_type: "image", asset_id: "img-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual({ deleted: true, image_id: "img-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["image", "img-1"], PARAMS);
  });

  it("rtstream is refused with a pointer to set_rtstream_status and touches no endpoint", async () => {
    const vdb = fakeConnection();
    const { data, isError } = await call(deleteAsset, { asset_type: "rtstream", asset_id: "rts-1" }, vdb);
    expect(isError).toBe(true);
    expect(String(data)).toContain("set_rtstream_status");
    expect(vdb.http.delete).not.toHaveBeenCalled();
  });
});
