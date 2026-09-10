import { describe, expect, it } from "vitest";
import { streams } from "@/lib/toolsets/streams";
import { call, fakeConnection, raw, toolNamed } from "./harness";

const VIDEO = { id: "m-1", collectionId: "c-1", name: "Keynote", length: 120, size: "1", streamUrl: "https://stream/x.m3u8", playerUrl: "https://player/x", userId: "u" };

describe("streams", () => {
  it("generate_clip posts the timeline and returns stream + player urls", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/stream": (body: any) => {
        expect(body).toEqual({ length: 120, timeline: [[10, 20]] });
        return { stream_url: "https://stream/clip.m3u8" };
      },
    });
    const { data, isError } = await call(toolNamed(streams, "generate_clip"), { video_id: "m-1", collection_id: "c-1", timeline: [[10, 20]] }, vdb);
    expect(isError).toBe(false);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1"], { params: { collection_id: "c-1" } });
    expect(data).toEqual({ stream_url: "https://stream/clip.m3u8", player_url: expect.stringContaining("clip.m3u8") });
  });

  it("generate_clip prefers the clip's own player URL over the video's", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/stream": () => ({ stream_url: "https://stream/clip.m3u8", player_url: "https://player/clip" }),
    });
    const { data } = await call(toolNamed(streams, "generate_clip"), { video_id: "m-1", collection_id: "c-1", timeline: [[10, 20]] }, vdb);
    expect(data).toEqual({ stream_url: "https://stream/clip.m3u8", player_url: "https://player/clip" });
  });

  it("generate_clip hands back the job when the API answers processing", async () => {
    const vdb = fakeConnection({ "GET video/m-1": VIDEO, "POST video/m-1/stream": () => raw({ status: "processing", data: { id: "job-1", output_url: "https://api.test/async-response/job-1" } }) });
    const { data, isError } = await call(toolNamed(streams, "generate_clip"), { video_id: "m-1", collection_id: "c-1", timeline: [[10, 20]] }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ status: "processing", job_id: "job-1", output_url: "https://api.test/async-response/job-1", poll_with: "get_job_result", message: expect.stringContaining("get_job_result") });
  });

  it("compile_clips posts snake_case clips to /compile and prefers the server player url", async () => {
    const vdb = fakeConnection({
      "POST compile": (body: any) => {
        expect(body).toEqual([
          { video_id: "m-1", collection_id: "default", shots: [[0, 5]] },
          { video_id: "m-2", collection_id: "c-2", shots: [[10, 15], [20, 25]] },
        ]);
        return { stream_url: "https://stream/reel.m3u8", player_url: "https://player/reel" };
      },
    });
    const { data } = await call(
      toolNamed(streams, "compile_clips"),
      { clips: [{ video_id: "m-1", shots: [[0, 5]] }, { video_id: "m-2", collection_id: "c-2", shots: [[10, 15], [20, 25]] }] },
      vdb
    );
    expect(data).toEqual({ stream_url: "https://stream/reel.m3u8", player_url: "https://player/reel" });
  });

  it("add_subtitles maps style enums and only overrides the keys the caller set", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/workflow": (body: any) => {
        expect(body.type).toBe("add_subtitles");
        expect(body.subtitle_style).toEqual({
          font_name: "Arial",
          font_size: 24,
          primary_colour: "&H00FFFF00",
          secondary_colour: "&H000000FF",
          outline_colour: "&H00000000",
          back_colour: "&H00000000",
          bold: true,
          italic: false,
          underline: false,
          strike_out: false,
          scale_x: 1,
          scale_y: 1,
          spacing: 0,
          angle: 0,
          border_style: 3,
          outline: 1,
          shadow: 0,
          alignment: 8,
          margin_l: 10,
          margin_r: 10,
          margin_v: 40,
        });
        return { streamUrl: "https://stream/subs.m3u8" };
      },
    });
    const { data, isError } = await call(
      toolNamed(streams, "add_subtitles"),
      { video_id: "m-1", font_size: 24, primary_colour: "&H00FFFF00", bold: true, border_style: "opaque_box", alignment: "top_center", margin_v: 40 },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ stream_url: "https://stream/subs.m3u8", player_url: expect.stringContaining("subs.m3u8") });
  });

  it("create_highlight_clip posts the prompt and returns shots for compile_clips; processing hands back the job", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/clip": (body: any) => {
        expect(body).toEqual({ prompt: "product demos", content_type: "visual", model_name: "pro" });
        return { results: [{ video_id: "m-1", collection_id: "c-1", title: "Keynote", length: "120", docs: [{ start: 3, end: 9, text: "demo", score: 0.8 }] }] };
      },
    });
    const { data, isError } = await call(
      toolNamed(streams, "create_highlight_clip"),
      { video_id: "m-1", collection_id: "c-1", prompt: "product demos", content_type: "visual", model_name: "pro" },
      vdb
    );
    expect(isError).toBe(false);
    expect(vdb.http.post).toHaveBeenCalledTimes(1); // no compile: the model renders the shots with compile_clips
    expect(data).toEqual({
      shots: [{ video_id: "m-1", collection_id: "c-1", video_title: "Keynote", start: 3, end: 9, text: "demo", search_score: 0.8 }],
      next: "compile_clips",
    });

    const pending = fakeConnection({ "GET video/m-1": VIDEO, "POST video/m-1/clip": () => raw({ status: "processing", data: { id: "job-1", output_url: "https://api.test/async-response/job-1" } }) });
    const job = await call(toolNamed(streams, "create_highlight_clip"), { video_id: "m-1", collection_id: "c-1", prompt: "demos" }, pending);
    expect(job.data).toEqual({ status: "processing", job_id: "job-1", output_url: "https://api.test/async-response/job-1", poll_with: "get_job_result", message: expect.stringContaining("get_job_result") });
  });

  it("reframe_video posts target/mode and returns the new video; callback_url short-circuits", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/reframe": (body: any) => {
        expect(body).toEqual({ start: 5, end: 30, target: { width: 1080, height: 1350 }, mode: "simple", callback_url: undefined });
        return { id: "m-9", collection_id: "c-1", name: "Keynote (reframed)", length: 120, size: "1", stream_url: "https://stream/r.m3u8", player_url: "https://player/r", user_id: "u" };
      },
    });
    const t = toolNamed(streams, "reframe_video");
    expect(t.kind).toBe("create");
    const { data } = await call(t, { video_id: "m-1", collection_id: "c-1", start: 5, end: 30, target: { width: 1080, height: 1350 }, mode: "simple" }, vdb);
    expect(data).toEqual({ id: "m-9", collection_id: "c-1", name: "Keynote (reframed)", length: 120, size: "1", stream_url: "https://stream/r.m3u8", player_url: "https://player/r" });

    const cb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/reframe": (body: any) => {
        expect(body).toEqual({ start: undefined, end: undefined, target: "vertical", mode: "smart", callback_url: "https://hook.test/done" });
        return {};
      },
    });
    const accepted = await call(t, { video_id: "m-1", callback_url: "https://hook.test/done" }, cb);
    expect(accepted.data).toEqual({ accepted: true, video_id: "m-1", collection_id: "default", callback_url: "https://hook.test/done" });
  });

  it("download_stream posts stream_link + name to /download and flattens the job", async () => {
    const vdb = fakeConnection({
      "POST download": (body: any) => {
        expect(body).toEqual({ stream_link: "https://stream/x.m3u8", name: "clip.mp4" });
        return { download_url: "https://files/clip.mp4", status: "done", name: "clip.mp4" };
      },
    });
    const { data, isError } = await call(toolNamed(streams, "download_stream"), { stream_url: "https://stream/x.m3u8", name: "clip.mp4" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ download_url: "https://files/clip.mp4", status: "done", name: "clip.mp4" });

    const pending = fakeConnection({ "POST download": () => raw({ status: "processing", data: { id: "dl-1", output_url: "https://api.test/download/dl-1" } }) });
    const job = await call(toolNamed(streams, "download_stream"), { stream_url: "https://stream/x.m3u8", name: "clip.mp4" }, pending);
    expect(job.data).toMatchObject({ status: "processing", job_id: "dl-1", output_url: "https://api.test/download/dl-1", poll_with: "get_job_result" });
  });
});
