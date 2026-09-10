import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { cap } from "@/lib/videodb/serialize";
import { CALLBACK_URL, COLLECTION_ID, VIDEO_ID, mediaKind } from "@/lib/mcp/schemas";
import { fetchAudio, fetchVideo } from "@/lib/videodb/resolve";
import { isJobStarted, startJob } from "@/lib/videodb/jobs";

/** Transcripts for video and audio: fetch, (re)generate, translate. */

// A transcript can run to tens of thousands of words; cap the segment list so one call stays readable.
const MAX_SEGMENTS = 2000;

const SEGMENTER = z
  .enum(["word", "sentence", "time"])
  .optional()
  .describe("How to split timestamped segments: one per word (default), per sentence, or fixed time windows.");

const SEGMENT_LENGTH = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe("Units per segment: words/sentences per segment, or seconds per segment when segmenter is 'time'.");

// media_id is the canonical input; video_id is kept as an alias so pre-toolset callers keep working.
const MEDIA_TARGET = {
  media_id: z.string().optional().describe("VideoDB media ID: m- (video) or a- (audio)."),
  video_id: VIDEO_ID.optional().describe("Deprecated alias of media_id; accepts a video ID (m-)."),
  collection_id: COLLECTION_ID,
};

const requireMediaId = { message: "Provide media_id (m- or a-) — video_id is a deprecated alias.", path: ["media_id"] };

const targetId = (a: { media_id?: string; video_id?: string }): string => (a.media_id ?? a.video_id) as string;

function transcribableKind(id: string): "video" | "audio" {
  const kind = mediaKind(id);
  if (kind === "image") throw new Error(`${id} is an image; transcripts exist only for video (m-) and audio (a-).`);
  return kind;
}

const cappedSegments = (segments: readonly unknown[]) => cap(segments, "word_timestamps", MAX_SEGMENTS);

const getTranscript = defineTool({
  name: "get_transcript",
  title: "Get transcript",
  description:
    "Get the transcript of a video or audio file, either as plain text or with timestamped segments (per word, sentence, or time window). Reads an existing transcript only — media that has never been transcribed returns an error naming generate_transcript. Timestamped output is capped at 2000 segments; narrow with start/end or a coarser segmenter.",
  kind: "read",
  input: z
    .object({
      ...MEDIA_TARGET,
      timestamped: z.boolean().default(false).describe("true → timestamped segments plus text; false → plain text only."),
      start: z.number().min(0).optional().describe("Only include speech after this second."),
      end: z.number().min(0).optional().describe("Only include speech before this second."),
      segmenter: SEGMENTER,
      segment_length: SEGMENT_LENGTH,
    })
    .refine((a) => a.media_id || a.video_id, requireMediaId),
  retryWith: "get_transcript",
  handler: async (args, vdb) => {
    const { collection_id, timestamped, start, end, segmenter, segment_length } = args;
    const id = targetId(args);
    if (transcribableKind(id) === "audio") {
      const audio = await fetchAudio(vdb, collection_id, id);
      const segments = await audio.getTranscript(start, end, segmenter, segment_length);
      const text = audio.transcriptText ?? "";
      return timestamped ? { text, ...cappedSegments(segments) } : { text };
    }
    const t = await (await fetchVideo(vdb, collection_id, id)).getTranscript(start, end, segmenter, segment_length);
    return timestamped ? { text: t.text, ...cappedSegments(t.wordTimestamps ?? []) } : { text: t.text };
  },
});

const generateTranscript = defineTool({
  name: "generate_transcript",
  title: "Generate transcript",
  description:
    "Transcribe a video or audio file (speech to text), optionally forcing a fresh transcription or hinting the spoken language. Returns immediately with {status:'processing', output_url}; poll get_job_result with that output_url (~30 s apart) until status is done, then read the text with get_transcript. Media that already has a transcript answers done at once.",
  kind: "create",
  input: z
    .object({
      ...MEDIA_TARGET,
      force: z.boolean().default(false).describe("Re-transcribe even if a transcript already exists."),
      language_code: z.string().optional().describe("BCP-47/ISO language code of the speech, e.g. 'en', 'hi'. Auto-detected if omitted."),
    })
    .refine((a) => a.media_id || a.video_id, requireMediaId),
  retryWith: "get_transcript",
  handler: async (args, vdb) => {
    const { collection_id, force, language_code } = args;
    const id = targetId(args);
    const kind = transcribableKind(id);
    if (kind === "audio") await fetchAudio(vdb, collection_id, id);
    else await fetchVideo(vdb, collection_id, id); // access check under the caller's collection scope
    const out = await startJob(vdb, [kind, id, "transcription"], { force, language_code }, "Transcription");
    if (isJobStarted(out)) return { media_id: id, media_type: kind, ...out.job };
    // The transcript itself can run to tens of thousands of words; get_transcript pages it.
    return { media_id: id, media_type: kind, status: "done", message: "Transcript is ready — read it with get_transcript." };
  },
});

const translateTranscript = defineTool({
  name: "translate_transcript",
  title: "Translate transcript",
  description:
    "Translate a video's transcript into another language (requires a transcript — get_transcript or generate_transcript first). Video only; the translation is returned, not stored. Returns immediately with {status:'processing', output_url}; poll get_job_result with that output_url (~30 s apart) until it returns translated_transcript.",
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    language: z.string().min(1).describe("Target language, e.g. 'Spanish' or 'fr'."),
    additional_notes: z.string().optional().describe("Style guidance for the translation, e.g. 'formal register'."),
    callback_url: CALLBACK_URL,
  }),
  handler: async ({ video_id, collection_id, language, additional_notes, callback_url }, vdb) => {
    // The route is collection-scoped and does not resolve the "default" alias; use the video's canonical collection.
    const video = await fetchVideo(vdb, collection_id, video_id);
    const out = await startJob(
      vdb,
      ["collection", video.collectionId, "video", video_id, "translate"],
      { language, additional_notes: additional_notes ?? "", callback_url },
      "Translation"
    );
    if (callback_url) return { accepted: true, video_id, language };
    if (isJobStarted(out)) return { video_id, language, ...out.job };
    const segments = Array.isArray(out.data.translated_transcript) ? out.data.translated_transcript : [];
    return { video_id, language, ...cap(segments, "translated_transcript", MAX_SEGMENTS) };
  },
});

export const transcripts: Toolset = {
  name: "transcripts",
  description: "Transcripts: fetch, regenerate, translate.",
  defaultEnabled: true,
  tools: [getTranscript, generateTranscript, translateTranscript],
};
