import { describe, expect, it } from "vitest";
import { indexing } from "@/lib/toolsets/indexing";
import { call, fakeConnection, toolNamed } from "./harness";

const VIDEO = { id: "m-1", collectionId: "c-1", name: "Keynote", length: 120, streamUrl: "https://stream/x.m3u8" };
const GET_VIDEO = { "GET video/m-1": VIDEO };
const COLL = { params: { collection_id: "c-1" } };

const ANALYZERS = [
  { id: "an-1", name: "transcript", type: "speech_transcription", status: "done" },
  { id: "an-2", name: "scene", type: "vlm", status: "done" },
];
const UNDERSTANDING = { understandingId: "u-1", videoId: "m-1", status: "done", analyzers: ANALYZERS };
const UNDERSTANDING_PLAIN = { id: "u-1", video_id: "m-1", status: "done", analyzers: ANALYZERS };

// Index endpoints skip camelCase conversion, so their stubs are raw snake_case.
const INDEX_RAW = {
  index_id: "idx-1",
  name: "scenes",
  status: "ready",
  use_for: ["semantic", "query"],
  record_count: 12,
  fields: { description: ["semantic"] },
  field_schema: { description: { type: "string", groups: [], operators: ["eq"] } },
  video_id: "m-1",
  collection_id: "c-1",
};
const INDEX_PLAIN = {
  index_id: "idx-1",
  name: "scenes",
  status: "ready",
  use_for: ["semantic", "query"],
  record_count: 12,
  fields: { description: ["semantic"] },
  field_schema: { description: { type: "string", groups: [], operators: ["eq"] } },
};

const tool = (name: string) => toolNamed(indexing, name);

describe("indexing (v1)", () => {
  it("index_spoken_words posts segmentation_type/callback_url and returns accepted", async () => {
    const vdb = fakeConnection({
      ...GET_VIDEO,
      "POST video/m-1/index": (body: any) => {
        expect(body).toEqual({ index_type: "spoken_word", language_code: "en", segmentation_type: "llm", force: false, callback_url: "https://cb.example/x" });
        return { success: true };
      },
    });
    const { data, isError } = await call(
      tool("index_spoken_words"),
      { video_id: "m-1", collection_id: "c-1", language_code: "en", segmentation_type: "llm", callback_url: "https://cb.example/x" },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ accepted: true, video_id: "m-1", index_type: "spoken_word" });
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1"], COLL);
  });

  it("index_spoken_words without callback keeps the legacy result", async () => {
    const vdb = fakeConnection({
      ...GET_VIDEO,
      "POST video/m-1/index": (body: any) => {
        expect(body).toEqual({ index_type: "spoken_word", force: true });
        return {};
      },
    });
    const { data } = await call(tool("index_spoken_words"), { video_id: "m-1", collection_id: "c-1", force: true }, vdb);
    expect(data).toEqual({ indexed: true, video_id: "m-1", index_type: "spoken_word" });
  });

  it("index_scenes posts model_name/callback_url and returns the scene index id", async () => {
    const vdb = fakeConnection({
      ...GET_VIDEO,
      "POST video/m-1/index/scene": (body: any) => {
        expect(body).toMatchObject({
          extraction_type: "shot",
          extraction_config: { threshold: 20, frame_count: 1 },
          prompt: "products",
          model_name: "pro",
          callback_url: "https://cb.example/x",
        });
        return { sceneIndexId: "si-1" };
      },
    });
    const { data, isError } = await call(
      tool("index_scenes"),
      { video_id: "m-1", collection_id: "c-1", prompt: "products", model_name: "pro", callback_url: "https://cb.example/x" },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ accepted: true, scene_index_id: "si-1", video_id: "m-1" });
  });

  it("list_scene_indexes reads GET /video/{id}/index/scene", async () => {
    const vdb = fakeConnection({ ...GET_VIDEO, "GET video/m-1/index/scene": { sceneIndexes: [{ sceneIndexId: "si-1", name: "shots", status: "done" }] } });
    const { data, isError } = await call(tool("list_scene_indexes"), { video_id: "m-1", collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual([{ scene_index_id: "si-1", name: "shots", status: "done" }]);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "index", "scene"]);
  });

  it("get_scene_index returns per-scene records", async () => {
    const records = [{ start: 0, end: 5, description: "intro" }, { start: 5, end: 9, description: "demo" }];
    const vdb = fakeConnection({ ...GET_VIDEO, "GET video/m-1/index/scene/si-1": { sceneIndexRecords: records } });
    const { data, isError } = await call(tool("get_scene_index"), { video_id: "m-1", collection_id: "c-1", scene_index_id: "si-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ scene_index_id: "si-1", video_id: "m-1", scenes: records });
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "index", "scene", "si-1"]);
  });

  it("delete_scene_index is destructive and hits DELETE", async () => {
    const vdb = fakeConnection({ ...GET_VIDEO, "DELETE video/m-1/index/scene/si-1": {} });
    const t = tool("delete_scene_index");
    expect(t.kind).toBe("destructive");
    const { data } = await call(t, { video_id: "m-1", collection_id: "c-1", scene_index_id: "si-1" }, vdb);
    expect(data).toEqual({ deleted: true, scene_index_id: "si-1", video_id: "m-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["video", "m-1", "index", "scene", "si-1"]);
  });
});

describe("indexing (v2 understand)", () => {
  it("understand_video normalises analyzers, passes config through and flattens the run", async () => {
    const vdb = fakeConnection({
      ...GET_VIDEO,
      "POST video/m-1/understand": (body: any) => {
        expect(body).toEqual({
          analyzers: [
            { type: "speech_transcription", name: "transcript" },
            { type: "vlm", name: "scene", prompt: "Describe the scene" },
          ],
          segmentation: { type: "time", seconds: 5 },
        });
        return { ...UNDERSTANDING, status: "pending" };
      },
    });
    const { data, isError } = await call(
      tool("understand_video"),
      {
        video_id: "m-1",
        collection_id: "c-1",
        analyzers: [{ type: "spoken_words" }, { type: "vlm", prompt: "Describe the scene" }],
        segmentation: { type: "time", seconds: 5 },
      },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ ...UNDERSTANDING_PLAIN, status: "pending" });
  });

  it("understand_video with callback_url returns accepted", async () => {
    const vdb = fakeConnection({
      ...GET_VIDEO,
      "POST video/m-1/understand": (body: any) => {
        expect(body).toMatchObject({ callback_url: "https://cb.example/x" });
        return { understandingId: "u-1", status: "pending" };
      },
    });
    const { data } = await call(
      tool("understand_video"),
      { video_id: "m-1", collection_id: "c-1", analyzers: [{ type: "ocr" }], callback_url: "https://cb.example/x" },
      vdb
    );
    expect(data).toEqual({
      accepted: true,
      understanding_id: "u-1",
      video_id: "m-1",
      analyzers: [{ name: "text", type: "ocr", status: "pending" }],
    });
  });

  it("get_understanding reads the run and its analyzers", async () => {
    const vdb = fakeConnection({ ...GET_VIDEO, "GET video/m-1/understand/u-1": UNDERSTANDING });
    const { data, isError } = await call(tool("get_understanding"), { video_id: "m-1", collection_id: "c-1", understanding_id: "u-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual(UNDERSTANDING_PLAIN);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "understand", "u-1"]);
  });

  it("list_understandings reads understanding_results", async () => {
    const vdb = fakeConnection({ ...GET_VIDEO, "GET video/m-1/understand": { understandingResults: [UNDERSTANDING] } });
    const { data, isError } = await call(tool("list_understandings"), { video_id: "m-1", collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual([UNDERSTANDING_PLAIN]);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "understand"]);
  });

  it("delete_understanding is destructive and hits DELETE", async () => {
    const vdb = fakeConnection({ ...GET_VIDEO, "DELETE video/m-1/understand/u-1": {} });
    const t = tool("delete_understanding");
    expect(t.kind).toBe("destructive");
    const { data } = await call(t, { video_id: "m-1", collection_id: "c-1", understanding_id: "u-1" }, vdb);
    expect(data).toEqual({ deleted: true, understanding_id: "u-1", video_id: "m-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["video", "m-1", "understand", "u-1"]);
  });

  it("get_analyzer_output reads raw output without fetching the video and caps lists", async () => {
    const scenes = Array.from({ length: 250 }, (_, i) => ({ scene_id: `s-${i}`, start: i, end: i + 1, data: { description: "x" } }));
    const vdb = fakeConnection({ "GET video/m-1/understand/u-1/analyzers/scene/output": { scenes, model: "vlm" } });
    const { data, isError } = await call(
      tool("get_analyzer_output"),
      { video_id: "m-1", collection_id: "c-1", understanding_id: "u-1", analyzer_name: "scene" },
      vdb
    );
    expect(isError).toBe(false);
    const out = data as any;
    expect(out.scenes).toHaveLength(200);
    expect(out.scenes[0]).toEqual(scenes[0]);
    expect(out).toMatchObject({ model: "vlm", scenes_total: 250, truncated: true });
    expect(vdb.http.get).toHaveBeenCalledTimes(1);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "understand", "u-1", "analyzers", "scene", "output"], undefined, { convert: false });
  });

  it("get_analyzer_output requires an analyzer reference", async () => {
    const { isError, data } = await call(tool("get_analyzer_output"), { video_id: "m-1", understanding_id: "u-1" }, fakeConnection());
    expect(isError).toBe(true);
    expect(String(data)).toMatch(/analyzer_name or analyzer_id/);
  });
});

describe("indexing (v2 index)", () => {
  it("create_index resolves the analyzer to an index source and returns the manifest", async () => {
    const vdb = fakeConnection({
      ...GET_VIDEO,
      "GET video/m-1/understand/u-1": UNDERSTANDING,
      "POST video/m-1/indexes": (body: any) => {
        expect(body).toEqual({
          source: { understanding_id: "u-1", analyzer_id: "an-2", analyzer_type: "vlm" },
          name: "scenes",
          use_for: ["semantic", "query"],
          fields: { description: ["semantic"] },
          callback_url: undefined,
        });
        return { ...INDEX_RAW, status: "building", record_count: 0 };
      },
    });
    const { data, isError } = await call(
      tool("create_index"),
      {
        video_id: "m-1",
        collection_id: "c-1",
        understanding_id: "u-1",
        analyzer_name: "scene",
        name: "scenes",
        use_for: ["semantic", "query"],
        fields: { description: ["semantic"] },
      },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ ...INDEX_PLAIN, status: "building", record_count: 0, video_id: "m-1" });
    expect(vdb.http.post).toHaveBeenCalledWith(["video", "m-1", "indexes"], expect.anything(), undefined, { convert: false });
  });

  it("create_index with analyzer_id + callback_url returns accepted", async () => {
    const vdb = fakeConnection({
      ...GET_VIDEO,
      "GET video/m-1/understand/u-1": UNDERSTANDING,
      "POST video/m-1/indexes": (body: any) => {
        expect(body).toMatchObject({ source: { understanding_id: "u-1", analyzer_id: "an-1" }, callback_url: "https://cb.example/x" });
        return { index_id: "idx-2", status: "building" };
      },
    });
    const { data } = await call(
      tool("create_index"),
      { video_id: "m-1", collection_id: "c-1", understanding_id: "u-1", analyzer_id: "an-1", callback_url: "https://cb.example/x" },
      vdb
    );
    expect(data).toEqual({ accepted: true, index_id: "idx-2", video_id: "m-1", understanding_id: "u-1" });
  });

  it("get_index by id reads GET /video/{id}/indexes/{index_id}", async () => {
    const vdb = fakeConnection({ ...GET_VIDEO, "GET video/m-1/indexes/idx-1": INDEX_RAW });
    const { data, isError } = await call(tool("get_index"), { video_id: "m-1", collection_id: "c-1", index_id: "idx-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ ...INDEX_PLAIN, video_id: "m-1" });
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "indexes", "idx-1"], COLL, { convert: false });
  });

  it("get_index by name passes name as a query param", async () => {
    const vdb = fakeConnection({ ...GET_VIDEO, "GET video/m-1/indexes": INDEX_RAW });
    const { data } = await call(tool("get_index"), { video_id: "m-1", collection_id: "c-1", name: "scenes" }, vdb);
    expect(data).toEqual({ ...INDEX_PLAIN, video_id: "m-1" });
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "indexes"], { params: { collection_id: "c-1", name: "scenes" } }, { convert: false });
  });

  it("list_indexes filters by use_for", async () => {
    const vdb = fakeConnection({ ...GET_VIDEO, "GET video/m-1/indexes": { indexes: [INDEX_RAW] } });
    const { data, isError } = await call(tool("list_indexes"), { video_id: "m-1", collection_id: "c-1", use_for: "semantic" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual([INDEX_PLAIN]);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "indexes"], { params: { collection_id: "c-1", use_for: "semantic" } }, { convert: false });
  });

  it("delete_index is destructive and hits DELETE with collection_id", async () => {
    const vdb = fakeConnection({ ...GET_VIDEO, "DELETE video/m-1/indexes/idx-1": {} });
    const t = tool("delete_index");
    expect(t.kind).toBe("destructive");
    const { data } = await call(t, { video_id: "m-1", collection_id: "c-1", index_id: "idx-1" }, vdb);
    expect(data).toEqual({ deleted: true, index_id: "idx-1", video_id: "m-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["video", "m-1", "indexes", "idx-1"], COLL);
  });

  it("get_index_records pages with limit/cursor without fetching the video", async () => {
    const vdb = fakeConnection({
      "GET video/m-1/indexes/idx-1/records": {
        records: [{ video_id: "m-1", understanding_id: "u-1", scene_id: "s-1", start: 0, end: 5, data: { description: "intro" } }],
        next_cursor: "c2",
      },
    });
    const { data, isError } = await call(
      tool("get_index_records"),
      { video_id: "m-1", collection_id: "c-1", index_id: "idx-1", limit: 1, cursor: "c1" },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({
      index_id: "idx-1",
      records: [{ video_id: "m-1", understanding_id: "u-1", scene_id: "s-1", start: 0, end: 5, data: { description: "intro" } }],
      next_cursor: "c2",
    });
    expect(vdb.http.get).toHaveBeenCalledTimes(1);
    expect(vdb.http.get).toHaveBeenCalledWith(
      ["video", "m-1", "indexes", "idx-1", "records"],
      { params: { limit: 1, collection_id: "c-1", cursor: "c1" } },
      { convert: false }
    );
  });
});
