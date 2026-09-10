import { describe, expect, it } from "vitest";
import { media } from "@/lib/toolsets/media";
import { search } from "@/lib/toolsets/search";
import { streams } from "@/lib/toolsets/streams";
import { call, fakeConnection, toolNamed } from "./harness";

const VIDEO = { id: "m-1", collectionId: "c-1", name: "Keynote", length: 120, size: "1", streamUrl: "https://stream/x.m3u8", playerUrl: "https://player/x", userId: "u" };

describe("media", () => {
  it("list_videos returns trimmed videos", async () => {
    const vdb = fakeConnection({ "GET video": { videos: [VIDEO] } });
    const { data, isError } = await call(toolNamed(media, "list_videos"), { collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ videos: [{ id: "m-1", collection_id: "c-1", name: "Keynote", length: 120, size: "1", stream_url: VIDEO.streamUrl, player_url: VIDEO.playerUrl }] });
    expect(vdb.http.get).toHaveBeenCalledWith(["video"], { params: { collection_id: "c-1" } });
  });

  it("delete_video is destructive and hits DELETE /video/{id}", async () => {
    const vdb = fakeConnection({ "DELETE video/m-1": {} });
    const t = toolNamed(media, "delete_video");
    expect(t.kind).toBe("destructive");
    const { data } = await call(t, { video_id: "m-1" }, vdb);
    expect(data).toEqual({ deleted: true, video_id: "m-1" });
  });
});

describe("search", () => {
  it("legacy_search_video routes legacy params and flattens shots", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/search": (body: any) => {
        expect(body).toMatchObject({ query: "pricing", search_type: "semantic", index_type: "spoken_word", result_threshold: 5 });
        return { results: [{ videoId: "m-1", title: "Keynote", length: 120, docs: [{ start: 1, end: 5, text: "pricing", score: 0.9 }] }] };
      },
    });
    const { data, isError } = await call(toolNamed(search, "legacy_search_video"), { video_id: "m-1", query: "pricing" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ shots: [{ video_id: "m-1", video_title: "Keynote", start: 1, end: 5, text: "pricing", search_score: 0.9 }] });
  });
});

describe("streams", () => {
  it("generate_clip posts the timeline and returns stream + player urls", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/stream": (body: any) => {
        expect(body).toEqual({ length: 120, timeline: [[10, 20]] });
        return { stream_url: "https://stream/clip.m3u8", player_url: "https://player/clip" };
      },
    });
    const { data } = await call(toolNamed(streams, "generate_clip"), { video_id: "m-1", timeline: [[10, 20]] }, vdb);
    expect(data).toEqual({ stream_url: "https://stream/clip.m3u8", player_url: expect.stringContaining("clip") });
  });
});
