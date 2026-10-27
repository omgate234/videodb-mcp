import { describe, expect, it } from "vitest";
import { z } from "zod";
import { annotationsFor } from "@/lib/mcp/tool";
import { generateMedia } from "@/lib/toolsets/openai/genai";
import { call, fakeConnection, raw } from "./harness";

const NO_POLL = { wait: false, convert: false };
const specBytes = (def: typeof generateMedia) =>
  JSON.stringify({
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: z.toJSONSchema(def.input, { io: "input", unrepresentable: "any" }),
    annotations: { title: def.title, ...annotationsFor(def) },
  }).length;

describe("openai: generate_media", () => {
  it("fits the spec budget and is a closed-world create tool", () => {
    expect(specBytes(generateMedia)).toBeLessThanOrEqual(1800);
    expect(generateMedia.kind).toBe("create");
    expect(annotationsFor(generateMedia).openWorldHint).toBe(false);
  });

  it("image posts prompt + aspect_ratio to generate/image and returns the trimmed image", async () => {
    const vdb = fakeConnection({
      "POST collection/c-1/generate/image": (body: any) => {
        expect(body).toEqual({ prompt: "a red fox", aspect_ratio: "16:9" });
        return { id: "img-1", collection_id: "c-1", name: "fox", url: "https://img/fox.png", user_id: "u" };
      },
    });
    const { data, isError } = await call(generateMedia, { kind: "image", prompt: "a red fox", aspect_ratio: "16:9", collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(vdb.http.post.mock.calls[0][3]).toEqual(NO_POLL);
    expect(data).toEqual({ id: "img-1", collection_id: "c-1", name: "fox", url: "https://img/fox.png" });
  });

  it("video posts prompt + duration to generate/video and hands back the job while processing", async () => {
    const vdb = fakeConnection({
      "POST collection/default/generate/video": (body: any) => {
        expect(body).toEqual({ prompt: "waves at dusk", duration: 8 });
        return raw({ status: "processing", data: { id: "job-1", output_url: "https://api.test/async-response/job-1" } });
      },
    });
    const { data } = await call(generateMedia, { kind: "video", prompt: "waves at dusk", duration: 8 }, vdb);
    expect(data).toEqual({ status: "processing", job_id: "job-1", output_url: "https://api.test/async-response/job-1", poll_with: "get_job_result", message: expect.stringContaining("get_job_result") });

    // Finished inline → trimmed video record, SDK default duration applied.
    const done = fakeConnection({
      "POST collection/default/generate/video": (body: any) => {
        expect(body).toEqual({ prompt: "waves at dusk", duration: 5 });
        return { id: "m-1", collection_id: "default", name: "waves", length: 5, stream_url: "https://stream/w.m3u8", user_id: "u" };
      },
    });
    const res = await call(generateMedia, { kind: "video", prompt: "waves at dusk" }, done);
    expect(res.data).toEqual({ id: "m-1", collection_id: "default", name: "waves", length: 5, stream_url: "https://stream/w.m3u8", player_url: expect.stringContaining("w.m3u8") });
  });

  it("music posts audio_type=music to generate/audio and returns the trimmed audio", async () => {
    const vdb = fakeConnection({
      "POST collection/default/generate/audio": (body: any) => {
        expect(body).toEqual({ prompt: "lofi beat", duration: 12, audio_type: "music" });
        return { id: "a-1", collection_id: "default", name: "lofi", length: 12, size: 1, user_id: "u" };
      },
    });
    const { data } = await call(generateMedia, { kind: "music", prompt: "lofi beat", duration: 12 }, vdb);
    expect(data).toEqual({ id: "a-1", collection_id: "default", name: "lofi", length: 12, size: 1 });
  });

  it("sound_effect posts audio_type=sound_effect with the SDK's 2 s default", async () => {
    const vdb = fakeConnection({
      "POST collection/default/generate/audio": (body: any) => {
        expect(body).toEqual({ prompt: "door slam", duration: 2, audio_type: "sound_effect", config: {} });
        return { id: "a-2", collection_id: "default", name: "slam", length: 2 };
      },
    });
    const { data } = await call(generateMedia, { kind: "sound_effect", prompt: "door slam", aspect_ratio: null, duration: null }, vdb);
    expect(data).toEqual({ id: "a-2", collection_id: "default", name: "slam", length: 2 });
  });

  it("voice posts the prompt as text with voice_name to generate/audio", async () => {
    const vdb = fakeConnection({
      "POST collection/default/generate/audio": (body: any) => {
        expect(body).toEqual({ text: "Welcome aboard", audio_type: "voice", voice_name: "Rachel", model_name: "elevenlabs", config: {} });
        return { id: "a-3", collection_id: "default", name: "welcome", length: 3 };
      },
    });
    const { data } = await call(generateMedia, { kind: "voice", prompt: "Welcome aboard", voice_name: "Rachel" }, vdb);
    expect(data).toEqual({ id: "a-3", collection_id: "default", name: "welcome", length: 3 });

    const dflt = fakeConnection({ "POST collection/default/generate/audio": (body: any) => ({ id: "a-4", voice: body.voice_name }) });
    const res = await call(generateMedia, { kind: "voice", prompt: "Hi" }, dflt);
    expect(res.data).toEqual({ id: "a-4" }); // AUDIO_KEYS trims the echo; default voice reached the wire
    expect(dflt.http.post.mock.calls[0][1]).toMatchObject({ voice_name: "Default" });
  });
});
