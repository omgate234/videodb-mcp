import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID, VIDEO_ID, TIMELINE } from "@/lib/mcp/schemas";
import { fetchVideo } from "@/lib/videodb/resolve";
import { playerUrlFor } from "@/lib/videodb/serialize";

/**
 * Stream generation & simple edits: clips, compilations, subtitles,
 * prompt-driven highlights, reframe, downloads.
 */

const stream = (stream_url: string) => ({ stream_url, player_url: playerUrlFor(stream_url) });

const generateClip = defineTool({
  name: "generate_clip",
  title: "Generate clip",
  description:
    "Cut a clip (or a supercut of several segments) from a single video without re-encoding. Returns a streamable URL and a player URL that can be watched in any browser.",
  kind: "create",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID, timeline: TIMELINE }),
  handler: async ({ video_id, collection_id, timeline }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    return stream(await video.generateStream(timeline as [number, number][]));
  },
});

const compileClips = defineTool({
  name: "compile_clips",
  title: "Compile clips across videos",
  description:
    "Stitch moments from one or more videos into a single new stream — e.g. turn search results into a highlight reel. Returns stream and player URLs.",
  kind: "create",
  input: z.object({
    clips: z
      .array(z.object({ video_id: VIDEO_ID, collection_id: z.string().default("default"), shots: TIMELINE }))
      .min(1)
      .describe("Clips in playback order."),
  }),
  handler: async ({ clips }, vdb) => {
    // The SDK only compiles from a SearchResult; POST /compile is the same wire call.
    const res = await vdb.vhttp.post<{ streamUrl: string; playerUrl?: string }, unknown[]>(
      ["compile"],
      clips.map((c) => ({ video_id: c.video_id, collection_id: c.collection_id, shots: c.shots }))
    );
    return res.data?.streamUrl ? { ...stream(res.data.streamUrl), ...(res.data.playerUrl ? { player_url: res.data.playerUrl } : {}) } : res.data;
  },
});

const addSubtitles = defineTool({
  name: "add_subtitles",
  title: "Add subtitles",
  description:
    "Burn subtitles into a video from its transcript (requires index_spoken_words first). Returns a new stream + player URL with subtitles rendered.",
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    font_name: z.string().optional().describe("Font family, default Arial."),
    font_size: z.number().int().min(8).max(72).optional().describe("Font size, default 18."),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
  }),
  handler: async ({ video_id, collection_id, font_name, font_size, bold, italic }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    return stream(await video.addSubtitle({ fontName: font_name, fontSize: font_size, bold, italic }));
  },
});

export const streams: Toolset = {
  name: "streams",
  description: "Clips, compilations, subtitles, highlights, reframing, downloads.",
  defaultEnabled: true,
  tools: [generateClip, compileClips, addSubtitles],
};
