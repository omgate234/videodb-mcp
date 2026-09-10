import { describe, expect, it } from "vitest";
import { indexing } from "@/lib/toolsets/indexing";
import { search } from "@/lib/toolsets/search";
import { media } from "@/lib/toolsets/media";
import { call, fakeConnection, toolNamed } from "./harness";

const VIDEO = { id: "m-1", collectionId: "c-1", length: 60 };
const ids = { collection_id: "c-1", video_id: "m-1", understanding_id: "u-1" };
const understanding = { understandingId: "u-1", status: "done", analyzers: [{ id: "an-1", name: "scene", type: "vlm", status: "done" }] };
const t = (name: string) => toolNamed(indexing, name);

describe("review: understanding and index inputs", () => {
  it.each(["", "  "])("uses analyzer_id when analyzer_name is %j", async (analyzer_name) => {
    const vdb = fakeConnection({ "GET video/m-1/understand/u-1/analyzers/an-1/output": { scenes: [] } });
    const result = await call(t("get_analyzer_output"), { ...ids, analyzer_name, analyzer_id: " an-1 " }, vdb);
    expect(result.isError).toBe(false);
    expect(result.data).toEqual({ scenes: [] });
  });

  it("creates an index with an ID, blank name, and the server's capability-to-fields map", async () => {
    const fields = { semantic: ["scene_description"], filter: ["brand_name"], hydrate: ["raw_label"], return: [] };
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "GET video/m-1/understand/u-1": understanding,
      "POST video/m-1/indexes": (body: any) => {
        expect(body.fields).toEqual(fields);
        expect(body.source.analyzer_id).toBe("an-1");
        return { index_id: "idx-1", status: "building", fields };
      },
    });
    const result = await call(t("create_index"), { ...ids, analyzer_name: "", analyzer_id: "an-1", fields }, vdb);
    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({ index_id: "idx-1", fields });
  });

  it("rejects backwards field maps before a request", () => {
    expect(t("create_index").input.safeParse({ ...ids, analyzer_id: "an-1", fields: { description: ["semantic"] } }).success).toBe(false);
  });

  it.each([
    { type: "vlm", config: { prompt: "Describe the scene" } },
  ])("sends VLM prompts under config: %j", async (analyzer) => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/understand": (body: any) => {
        expect(body.analyzers).toEqual([{ type: "vlm", name: "scene", config: { prompt: "Describe the scene" } }]);
        return understanding;
      },
    });
    expect((await call(t("understand_video"), { ...ids, analyzers: [analyzer] }, vdb)).isError).toBe(false);
  });

  it("rejects misplaced analyzer configuration", () => {
    for (const analyzer of [{ type: "vlm", prompt: "Describe the scene" }, { type: "vlm", model: "pro" }]) {
      expect(t("understand_video").input.safeParse({ ...ids, analyzers: [analyzer] }).success).toBe(false);
    }
  });

  it("accepts shot/time objects and rejects arrays and mismatched segmentation fields", () => {
    const input = { ...ids, analyzers: [{ type: "vlm" }] };
    for (const segmentation of [{ type: "shot", threshold: 40 }, { type: "time", seconds: 5 }]) {
      expect(t("understand_video").input.safeParse({ ...input, segmentation }).success).toBe(true);
    }
    for (const segmentation of [[{ type: "shot", threshold: 40 }], { type: "shot", seconds: 5 }, { type: "time", seconds: -1 }]) {
      expect(t("understand_video").input.safeParse({ ...input, segmentation }).success).toBe(false);
    }
  });

  it("accepts a corrected callback after invalid input and trims surrounding whitespace", () => {
    const input = { ...ids, analyzers: [{ type: "vlm" }] };
    expect(t("understand_video").input.safeParse({ ...input, callback_url: "bad url" }).success).toBe(false);
    expect(t("understand_video").input.parse({ ...input, callback_url: " https://example.com/callback " }).callback_url).toBe("https://example.com/callback");
  });
});

describe("review: backend responsibilities", () => {
  it.each(["search_video", "search_collection"])("%s preserves include_clip and backend-provided URLs", async (name) => {
    const path = name === "search_video" ? "video/m-1/search/v2" : "collection/c-1/search/v2";
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      [`POST ${path}`]: (body: any) => {
        expect(body).toEqual({ query: "six", top_k: 5, mode: "deepsearch", include_clip: true, session_id: "s-1" });
        return { responseType: "deepsearch", sessionId: "s-1", results: [{ videoId: "m-1", docs: [{ start: 1, end: 5, streamLink: "https://example.com/clip.m3u8" }] }] };
      },
    });
    const result = await call(toolNamed(search, name), { ...ids, query: "six", top_k: 5, mode: "deepsearch", include_clip: true, session_id: "s-1" }, vdb);
    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({ shots: [{ stream_url: "https://example.com/clip.m3u8", player_url: expect.any(String) }] });
    expect(vdb.http.post).toHaveBeenCalledTimes(1);
  });

  it("does not manufacture missing clips or hide a backend rejection", async () => {
    const path = "POST collection/c-1/search/v2";
    const args = { collection_id: "c-1", query: "q", mode: "deepsearch", include_clip: true };
    const vdb = fakeConnection({ [path]: { responseType: "deepsearch", results: [{ videoId: "m-1", docs: [{ start: 0, end: 2 }] }] } });
    const result = await call(toolNamed(search, "search_collection"), args, vdb);
    expect(result.data).toMatchObject({ shots: [{ video_id: "m-1", start: 0, end: 2 }] });
    expect((result.data as any).shots[0]).not.toHaveProperty("stream_url");
    expect(vdb.http.post).toHaveBeenCalledTimes(1);
    const failure = await call(toolNamed(search, "search_collection"), args, fakeConnection({ [path]: new Error("Unsupported DeepSearch option") }));
    expect(failure.isError).toBe(true);
    expect(failure.data).toBe("Error: Unsupported DeepSearch option");
  });

  it("forwards the source URL unchanged and leaves source support to the transcoder", async () => {
    const source = "https://www.youtube.com/watch?v=abc";
    const vdb = fakeConnection({ "POST transcode": (body: any) => {
      expect(body.source).toBe(source);
      return { jobId: "job-1" };
    } });
    const result = await call(toolNamed(media, "transcode_media"), { source, callback_url: "https://example.com/callback" }, vdb);
    expect(result.isError).toBe(false);
    expect(vdb.http.post).toHaveBeenCalledTimes(1);
  });

  it("constrains transcode options to the advertised server limits", () => {
    const tool = toolNamed(media, "transcode_media");
    const input = { source: "https://example.com/video.mp4", callback_url: "https://example.com/callback" };
    for (const extra of [{ resolution: 1081 }, { resolution: 239 }, { quality: 0 }, { framerate: 61 }]) {
      expect(tool.input.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    expect(tool.input.safeParse({ ...input, resolution: 1080, quality: 1, framerate: 60 }).success).toBe(true);
  });
});
