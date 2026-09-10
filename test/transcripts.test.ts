import { describe, expect, it } from "vitest";
import { transcripts } from "@/lib/toolsets/transcripts";
import { call, fakeConnection, raw, toolNamed } from "./harness";

const VIDEO = { id: "m-1", collectionId: "c-1", name: "Keynote", length: 120, size: "1", streamUrl: "https://stream/x.m3u8", playerUrl: "https://player/x", userId: "u" };
const AUDIO = { id: "a-1", collectionId: "c-1", name: "Podcast", length: 60, size: "1", userId: "u" };
const VIDEO_TRANSCRIPT = { text: "hello world", wordTimestamps: [{ start: 0, end: 0.5, word: "hello" }, { start: 0.5, end: 1, word: "world" }] };
const AUDIO_TRANSCRIPT = { text: "hi there", wordTimestamps: [{ start: 0, end: 1, text: "hi there" }] };

describe("transcripts", () => {
  it("get_transcript on a video forwards segmenter params and returns timestamped segments", async () => {
    const vdb = fakeConnection({ "GET video/m-1": VIDEO, "GET video/m-1/transcription": VIDEO_TRANSCRIPT });
    const { data, isError } = await call(
      toolNamed(transcripts, "get_transcript"),
      { media_id: "m-1", collection_id: "c-1", timestamped: true, start: 5, end: 30, segmenter: "sentence", segment_length: 2 },
      vdb
    );
    expect(isError).toBe(false);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "transcription"], { params: { start: 5, end: 30, segmenter: "sentence", length: 2 } });
    expect(data).toEqual({ text: "hello world", word_timestamps: VIDEO_TRANSCRIPT.wordTimestamps });
  });

  it("get_transcript accepts the deprecated video_id alias and returns text only by default", async () => {
    const vdb = fakeConnection({ "GET video/m-1": VIDEO, "GET video/m-1/transcription": VIDEO_TRANSCRIPT });
    const { data } = await call(toolNamed(transcripts, "get_transcript"), { video_id: "m-1" }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1", "transcription"], { params: {} });
    expect(data).toEqual({ text: "hello world" });
  });

  it("get_transcript dispatches a- IDs to the audio endpoint", async () => {
    const vdb = fakeConnection({ "GET audio/a-1": AUDIO, "GET audio/a-1/transcription": AUDIO_TRANSCRIPT });
    const { data, isError } = await call(toolNamed(transcripts, "get_transcript"), { media_id: "a-1", collection_id: "c-1", timestamped: true }, vdb);
    expect(isError).toBe(false);
    expect(vdb.http.get).toHaveBeenCalledWith(["audio", "a-1"], { params: { collection_id: "c-1" } });
    expect(vdb.http.get).toHaveBeenCalledWith(["audio", "a-1", "transcription"], {
      params: { start: undefined, end: undefined, segmenter: "word", length: 1, force: "false" },
    });
    expect(data).toEqual({ text: "hi there", word_timestamps: AUDIO_TRANSCRIPT.wordTimestamps });
  });

  it("get_transcript rejects when neither media_id nor video_id is given, and refuses images", async () => {
    const t = toolNamed(transcripts, "get_transcript");
    await expect(call(t, { collection_id: "c-1" }, fakeConnection())).rejects.toThrow();
    const { isError, data } = await call(t, { media_id: "img-1" }, fakeConnection());
    expect(isError).toBe(true);
    expect(data).toMatch(/image/);
  });

  it("generate_transcript posts force + language_code to the video endpoint", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/transcription": (body: any) => {
        expect(body).toEqual({ force: true, language_code: "en" });
        return VIDEO_TRANSCRIPT;
      },
    });
    const t = toolNamed(transcripts, "generate_transcript");
    expect(t.kind).toBe("create");
    expect(t.retryWith).toBe("get_transcript");
    const { data, isError } = await call(t, { media_id: "m-1", force: true, language_code: "en" }, vdb);
    expect(isError).toBe(false);
    // An existing transcript answers inline; the text is never echoed — get_transcript pages it.
    expect(data).toEqual({ media_id: "m-1", media_type: "video", status: "done", message: expect.stringContaining("get_transcript") });
  });

  it("generate_transcript hands back the job when the API answers processing", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/transcription": () => raw({ status: "processing", data: { output_url: "https://api.test/video/m-1/transcription/?engine=x" } }),
    });
    const { data } = await call(toolNamed(transcripts, "generate_transcript"), { media_id: "m-1" }, vdb);
    expect(data).toEqual({ media_id: "m-1", media_type: "video", status: "processing", output_url: "https://api.test/video/m-1/transcription/?engine=x", poll_with: "get_job_result", message: expect.any(String) });
  });

  it("generate_transcript dispatches a- IDs to the audio endpoint", async () => {
    const vdb = fakeConnection({
      "GET audio/a-1": AUDIO,
      "POST audio/a-1/transcription": (body: any) => {
        expect(body).toEqual({ force: false, language_code: undefined });
        return AUDIO_TRANSCRIPT;
      },
    });
    const { data } = await call(toolNamed(transcripts, "generate_transcript"), { media_id: "a-1" }, vdb);
    expect(data).toEqual({ media_id: "a-1", media_type: "audio", status: "done", message: expect.stringContaining("get_transcript") });
  });

  it("translate_transcript posts to the collection-scoped translate path and returns segments", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST collection/c-1/video/m-1/translate": (body: any) => {
        expect(body).toEqual({ language: "Spanish", additional_notes: "formal", callback_url: undefined });
        return { translated_transcript: [{ start: 0, end: 1, text: "hola mundo" }] };
      },
    });
    const t = toolNamed(transcripts, "translate_transcript");
    expect(t.kind).toBe("create");
    const { data, isError } = await call(t, { video_id: "m-1", collection_id: "c-1", language: "Spanish", additional_notes: "formal" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ video_id: "m-1", language: "Spanish", translated_transcript: [{ start: 0, end: 1, text: "hola mundo" }] });

    const pending = fakeConnection({ "GET video/m-1": VIDEO, "POST collection/c-1/video/m-1/translate": () => raw({ status: "processing", data: { id: "job-1", output_url: "https://api.test/async-response/job-1" } }) });
    const job = await call(t, { video_id: "m-1", collection_id: "c-1", language: "Spanish" }, pending);
    expect(job.data).toEqual({ video_id: "m-1", language: "Spanish", ...{ status: "processing", job_id: "job-1", output_url: "https://api.test/async-response/job-1", poll_with: "get_job_result", message: expect.stringContaining("get_job_result") } });
  });

  it("translate_transcript with callback_url passes it through and returns accepted", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST collection/c-1/video/m-1/translate": (body: any) => {
        expect(body).toEqual({ language: "fr", additional_notes: "", callback_url: "https://hook.example/done" });
        return {};
      },
    });
    const { data } = await call(toolNamed(transcripts, "translate_transcript"), { video_id: "m-1", collection_id: "c-1", language: "fr", callback_url: "https://hook.example/done" }, vdb);
    expect(data).toEqual({ accepted: true, video_id: "m-1", language: "fr" });
  });
});
