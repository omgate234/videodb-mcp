import { describe, expect, it } from "vitest";
import { media } from "@/lib/toolsets/media";
import { call, fakeConnection, toolNamed } from "./harness";

const VIDEO = { id: "m-1", collectionId: "c-1", name: "Keynote", length: 120, size: "1", streamUrl: "https://stream/x.m3u8", playerUrl: "https://player/x", userId: "u", thumbnail: "https://img/t.png" };
const VIDEO_OUT = { id: "m-1", collection_id: "c-1", name: "Keynote", length: 120, size: "1", stream_url: VIDEO.streamUrl, player_url: VIDEO.playerUrl, thumbnail: VIDEO.thumbnail };
const AUDIO = { id: "a-1", collectionId: "c-1", name: "Podcast", length: 60, size: "2", userId: "u" };
const AUDIO_OUT = { id: "a-1", collection_id: "c-1", name: "Podcast", length: 60, size: "2" };
const IMAGE = { id: "img-1", collectionId: "c-1", name: "Cover", url: "https://img/cover.png" };
const IMAGE_OUT = { id: "img-1", collection_id: "c-1", name: "Cover", url: IMAGE.url };
const PARAMS = { params: { collection_id: "c-1" } };

const t = (name: string) => toolNamed(media, name);

describe("media", () => {
  it("list_videos returns trimmed videos", async () => {
    const vdb = fakeConnection({ "GET video": { videos: [VIDEO] } });
    const { data, isError } = await call(t("list_videos"), { collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual([VIDEO_OUT]);
    expect(vdb.http.get).toHaveBeenCalledWith(["video"], PARAMS);
  });

  it("list_audios returns trimmed audios", async () => {
    const vdb = fakeConnection({ "GET audio": { audios: [AUDIO] } });
    const { data, isError } = await call(t("list_audios"), { collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual([AUDIO_OUT]);
    expect(vdb.http.get).toHaveBeenCalledWith(["audio"], PARAMS);
  });

  it("list_images returns trimmed images", async () => {
    const vdb = fakeConnection({ "GET image": { images: [IMAGE] } });
    const { data, isError } = await call(t("list_images"), { collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual([IMAGE_OUT]);
    expect(vdb.http.get).toHaveBeenCalledWith(["image"], PARAMS);
  });

  it("get_video fetches one video", async () => {
    const vdb = fakeConnection({ "GET video/m-1": VIDEO });
    const { data } = await call(t("get_video"), { video_id: "m-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual(VIDEO_OUT);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1"], PARAMS);
  });

  it("get_audio fetches one audio", async () => {
    const vdb = fakeConnection({ "GET audio/a-1": AUDIO });
    const { data } = await call(t("get_audio"), { audio_id: "a-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual(AUDIO_OUT);
    expect(vdb.http.get).toHaveBeenCalledWith(["audio", "a-1"], PARAMS);
  });

  it("get_image fetches one image", async () => {
    const vdb = fakeConnection({ "GET image/img-1": IMAGE });
    const { data } = await call(t("get_image"), { image_id: "img-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual(IMAGE_OUT);
    expect(vdb.http.get).toHaveBeenCalledWith(["image", "img-1"], PARAMS);
  });

  it("upload_media posts the upload body and returns the media; callback_url short-circuits", async () => {
    const vdb = fakeConnection({
      "POST collection/c-1/upload": (body: any) => {
        expect(body).toEqual({ url: "https://x/y.mp4", name: "Y", description: undefined, callback_url: undefined, media_type: "video" });
        return VIDEO;
      },
    });
    const { data, isError } = await call(t("upload_media"), { url: "https://x/y.mp4", collection_id: "c-1", name: "Y", media_type: "video" }, vdb);
    expect(isError).toBe(false);
    expect(data).toMatchObject({ id: "m-1", stream_url: VIDEO.streamUrl });

    const async = fakeConnection({
      "POST collection/c-1/upload": (body: any) => {
        expect(body.callback_url).toBe("https://hook/done");
        return {};
      },
    });
    const res = await call(t("upload_media"), { url: "https://x/y.mp4", collection_id: "c-1", callback_url: "https://hook/done" }, async);
    expect(res.data).toEqual({ accepted: true, collection_id: "c-1", url: "https://x/y.mp4", callback_url: "https://hook/done" });
  });

  it("search_youtube posts to the default collection web search", async () => {
    const vdb = fakeConnection({
      "POST collection/default/search/web": (body: any) => {
        expect(body).toEqual({ query: "cats", result_threshold: 3, platform: "youtube", duration: "short" });
        return { results: [{ title: "Cat", url: "https://youtu.be/1" }] };
      },
    });
    const { data, isError } = await call(t("search_youtube"), { query: "cats", result_threshold: 3, duration: "short" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ results: [{ title: "Cat", url: "https://youtu.be/1" }] });
  });

  it("search_videos_by_title flattens matching videos", async () => {
    const vdb = fakeConnection({
      "POST collection/c-1/search/title": (body: any) => {
        expect(body).toEqual({ query: "keynote", search_type: "llm" });
        return [{ video: VIDEO }];
      },
    });
    const { data } = await call(t("search_videos_by_title"), { collection_id: "c-1", query: "keynote" }, vdb);
    expect(data).toEqual([VIDEO_OUT]);
  });

  it("update_video patches the name and is idempotent", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "PATCH video/m-1": (body: any) => {
        expect(body).toEqual({ name: "Renamed" });
        return { id: "m-1", name: "Renamed" };
      },
    });
    const tool = t("update_video");
    expect(tool.kind).toBe("update");
    const { data } = await call(tool, { video_id: "m-1", collection_id: "c-1", name: "Renamed" }, vdb);
    expect(data).toEqual({ ...VIDEO_OUT, name: "Renamed" });
  });

  it("generate_thumbnail posts the timestamp and returns the image", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/thumbnail": (body: any) => {
        expect(body).toEqual({ time: 5 });
        return { id: "img-9", url: "https://img/9.png" };
      },
    });
    const { data } = await call(t("generate_thumbnail"), { video_id: "m-1", collection_id: "c-1", time_seconds: 5 }, vdb);
    expect(data).toEqual({ id: "img-9", url: "https://img/9.png" });
  });

  it("list_thumbnails returns trimmed images", async () => {
    const vdb = fakeConnection({ "GET video/m-1": VIDEO, "GET video/m-1/thumbnails": [IMAGE] });
    const { data } = await call(t("list_thumbnails"), { video_id: "m-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual([IMAGE_OUT]);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "thumbnails"]);
  });

  it("get_media_download_url signs audio/image and refuses videos", async () => {
    const vdb = fakeConnection({ "GET audio/a-1": AUDIO, "POST audio/a-1/generate_url": { signedUrl: "https://signed/a" } });
    const { data } = await call(t("get_media_download_url"), { media_id: "a-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual({ media_id: "a-1", media_type: "audio", download_url: "https://signed/a" });
    expect(vdb.http.post).toHaveBeenCalledWith(["audio", "a-1", "generate_url"], {}, PARAMS);

    const img = fakeConnection({ "GET image/img-1": IMAGE, "POST image/img-1/generate_url": { signedUrl: "https://signed/i" } });
    const imgRes = await call(t("get_media_download_url"), { media_id: "img-1", collection_id: "c-1" }, img);
    expect(imgRes.data).toEqual({ media_id: "img-1", media_type: "image", download_url: "https://signed/i" });

    const vid = await call(t("get_media_download_url"), { media_id: "m-1" }, fakeConnection());
    expect(vid.isError).toBe(true);
    expect(vid.data).toContain("download_stream");
  });

  it("transcode_media posts snake_case config and returns the job id", async () => {
    const vdb = fakeConnection({
      "POST transcode": (body: any) => {
        expect(body).toEqual({
          source: "https://x/y.mp4",
          callback_url: "https://hook/done",
          mode: "lightning",
          video_config: { resolution: 720, aspect_ratio: "9:16", resize_mode: "crop" },
          audio_config: { mute: true },
        });
        return { jobId: "job-1" };
      },
    });
    const tool = t("transcode_media");
    expect(tool.retryWith).toBe("get_transcode_status");
    const { data, isError } = await call(
      tool,
      { source: "https://x/y.mp4", callback_url: "https://hook/done", mode: "lightning", resolution: 720, aspect_ratio: "9:16", resize_mode: "crop", mute: true },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ accepted: true, job_id: "job-1", callback_url: "https://hook/done" });
  });

  it("get_transcode_status reads the job", async () => {
    const vdb = fakeConnection({ "GET transcode/job-1": { status: "done", outputUrl: "https://out/y.mp4" } });
    const { data } = await call(t("get_transcode_status"), { job_id: "job-1" }, vdb);
    expect(data).toEqual({ job_id: "job-1", status: "done", output_url: "https://out/y.mp4" });
    expect(vdb.http.get).toHaveBeenCalledWith(["transcode", "job-1"]);
  });

  it("delete_video is destructive and hits DELETE /video/{id}", async () => {
    const vdb = fakeConnection({ "DELETE video/m-1": {} });
    const tool = t("delete_video");
    expect(tool.kind).toBe("destructive");
    const { data } = await call(tool, { video_id: "m-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual({ deleted: true, video_id: "m-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["video", "m-1"], PARAMS);
  });

  it("delete_audio is destructive and hits DELETE /audio/{id}", async () => {
    const vdb = fakeConnection({ "DELETE audio/a-1": {} });
    const tool = t("delete_audio");
    expect(tool.kind).toBe("destructive");
    const { data } = await call(tool, { audio_id: "a-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual({ deleted: true, audio_id: "a-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["audio", "a-1"], PARAMS);
  });

  it("delete_image is destructive and hits DELETE /image/{id}", async () => {
    const vdb = fakeConnection({ "DELETE image/img-1": {} });
    const tool = t("delete_image");
    expect(tool.kind).toBe("destructive");
    const { data } = await call(tool, { image_id: "img-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual({ deleted: true, image_id: "img-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["image", "img-1"], PARAMS);
  });

  it("remove_video_storage is destructive and hits DELETE /video/{id}/storage", async () => {
    const vdb = fakeConnection({ "GET video/m-1": VIDEO, "DELETE video/m-1/storage": {} });
    const tool = t("remove_video_storage");
    expect(tool.kind).toBe("destructive");
    const { data } = await call(tool, { video_id: "m-1", collection_id: "c-1" }, vdb);
    expect(data).toEqual({ storage_removed: true, video_id: "m-1" });
    expect(vdb.http.delete).toHaveBeenCalledWith(["video", "m-1", "storage"]);
  });
});
