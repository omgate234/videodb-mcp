import { describe, expect, it } from "vitest";
import { media } from "@/lib/toolsets/media";
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
