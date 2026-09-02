import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID, VIDEO_ID } from "@/lib/mcp/schemas";
import { fetchVideo } from "@/lib/videodb/resolve";

/** Transcripts for video and audio: fetch, (re)generate, translate. */

const getTranscript = defineTool({
  name: "get_transcript",
  title: "Get transcript",
  description:
    "Get the transcript of a video, either as plain text or with word-level timestamps. Generates the transcript on first call if the video hasn't been transcribed yet (may take a minute).",
  kind: "read",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    timestamped: z.boolean().default(false).describe("true → word-level timestamps; false → plain text."),
    start: z.number().min(0).optional().describe("Only include words after this second."),
    end: z.number().min(0).optional().describe("Only include words before this second."),
  }),
  retryWith: "get_transcript",
  handler: async ({ video_id, collection_id, timestamped, start, end }, vdb) => {
    const t = await (await fetchVideo(vdb, collection_id, video_id)).getTranscript(start, end);
    return timestamped ? t : { text: t.text };
  },
});

export const transcripts: Toolset = {
  name: "transcripts",
  description: "Transcripts: fetch, regenerate, translate.",
  defaultEnabled: true,
  tools: [getTranscript],
};
