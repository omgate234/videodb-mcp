import { z } from "zod";
import { SubtitleAlignment, SubtitleBorderStyle, type Video } from "videodb";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID, VIDEO_ID, TIMELINE, CALLBACK_URL } from "@/lib/mcp/schemas";
import { fetchVideo } from "@/lib/videodb/resolve";
import { isJobStarted, shapeResult, shotsFromRaw, startJob, streamResult } from "@/lib/videodb/jobs";

/**
 * Stream generation & simple edits: clips, compilations, subtitles,
 * prompt-driven highlights, reframe, downloads. Renders are async-first:
 * the tool returns a job handle and get_job_result reads the stream.
 */

const POLL = "Returns immediately with {status:'processing', output_url}; poll get_job_result with that output_url (~30 s apart) until it returns";

const generateClip = defineTool({
  name: "generate_clip",
  title: "Generate clip",
  description:
    `Cut a clip (or a supercut of several segments) from a single video without re-encoding. ${POLL} stream_url and player_url (watchable in any browser).`,
  kind: "create",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID, timeline: TIMELINE }),
  handler: async ({ video_id, collection_id, timeline }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    const out = await startJob(vdb, ["video", video_id, "stream"], { length: video.length, timeline }, "Clip");
    return isJobStarted(out) ? out.job : streamResult(out.data, "clip");
  },
});

const compileClips = defineTool({
  name: "compile_clips",
  title: "Compile clips across videos",
  description:
    `Stitch moments from one or more videos into a single new stream — e.g. turn search results or create_highlight_clip shots into a highlight reel. ${POLL} stream_url and player_url.`,
  kind: "create",
  input: z.object({
    clips: z
      .array(z.object({ video_id: VIDEO_ID, collection_id: z.string().default("default"), shots: TIMELINE }))
      .min(1)
      .describe("Clips in playback order."),
  }),
  handler: async ({ clips }, vdb) => {
    // The SDK only compiles from a SearchResult; POST /compile is the same wire call.
    const body = clips.map((c) => ({ video_id: c.video_id, collection_id: c.collection_id, shots: c.shots }));
    const out = await startJob(vdb, ["compile"], body, "Compilation");
    return isJobStarted(out) ? out.job : streamResult(out.data, "compilation");
  },
});

// SubtitleStyleProps is not re-exported from the package root.
type SubtitleStyle = NonNullable<Parameters<Video["addSubtitle"]>[0]>;

const ASS_COLOUR = "ASS colour string &HAABBGGRR (alpha, blue, green, red hex), e.g. &H00FFFFFF is opaque white.";

const BORDER_STYLE = { no_border: SubtitleBorderStyle.noBorder, opaque_box: SubtitleBorderStyle.opaqueBox, outline: SubtitleBorderStyle.outline } as const;
const ALIGNMENT = {
  bottom_left: SubtitleAlignment.bottomLeft,
  bottom_center: SubtitleAlignment.bottomCenter,
  bottom_right: SubtitleAlignment.bottomRight,
  middle_left: SubtitleAlignment.middleLeft,
  middle_center: SubtitleAlignment.middleCenter,
  middle_right: SubtitleAlignment.middleRight,
  top_left: SubtitleAlignment.topLeft,
  top_center: SubtitleAlignment.topCenter,
  top_right: SubtitleAlignment.topRight,
} as const;

const SUBTITLE_STYLE = {
  font_name: z.string().optional().describe("Font family, default Arial."),
  font_size: z.number().int().min(8).max(72).optional().describe("Font size, default 18."),
  primary_colour: z.string().optional().describe(`Text colour. ${ASS_COLOUR} Default white.`),
  secondary_colour: z.string().optional().describe(`Secondary (karaoke) colour. ${ASS_COLOUR}`),
  outline_colour: z.string().optional().describe(`Outline colour. ${ASS_COLOUR} Default black.`),
  back_colour: z.string().optional().describe(`Background/shadow colour. ${ASS_COLOUR} Default black.`),
  bold: z.boolean().optional().describe("Bold text."),
  italic: z.boolean().optional().describe("Italic text."),
  underline: z.boolean().optional().describe("Underlined text."),
  strike_out: z.boolean().optional().describe("Strike-through text."),
  scale_x: z.number().positive().optional().describe("Horizontal scale factor, default 1.0."),
  scale_y: z.number().positive().optional().describe("Vertical scale factor, default 1.0."),
  spacing: z.number().optional().describe("Extra spacing between letters in pixels, default 0."),
  angle: z.number().optional().describe("Rotation angle in degrees, default 0."),
  border_style: z.enum(["no_border", "opaque_box", "outline"]).optional().describe("Border style, default outline."),
  outline: z.number().min(0).optional().describe("Outline thickness in pixels, default 1."),
  shadow: z.number().min(0).optional().describe("Shadow depth in pixels, default 0."),
  alignment: z
    .enum(["bottom_left", "bottom_center", "bottom_right", "middle_left", "middle_center", "middle_right", "top_left", "top_center", "top_right"])
    .optional()
    .describe("Position of the subtitles on the frame, default bottom_center."),
  margin_l: z.number().int().min(0).optional().describe("Left margin in pixels, default 10."),
  margin_r: z.number().int().min(0).optional().describe("Right margin in pixels, default 10."),
  margin_v: z.number().int().min(0).optional().describe("Vertical margin in pixels, default 10."),
};

const addSubtitles = defineTool({
  name: "add_subtitles",
  title: "Add subtitles",
  description:
    "Burn subtitles into a video from its transcript (requires an existing spoken-word index). Styling follows ASS subtitle conventions; unset fields keep VideoDB defaults. Returns a new stream + player URL with subtitles rendered.",
  kind: "create",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID, ...SUBTITLE_STYLE }),
  handler: async ({ video_id, collection_id, border_style, alignment, ...s }, vdb) => {
    // The SDK spreads this over its defaults, so an explicit undefined would erase a default.
    const style: SubtitleStyle = {
      fontName: s.font_name,
      fontSize: s.font_size,
      primaryColour: s.primary_colour,
      secondaryColour: s.secondary_colour,
      outlineColour: s.outline_colour,
      backColour: s.back_colour,
      bold: s.bold,
      italic: s.italic,
      underline: s.underline,
      strikeOut: s.strike_out,
      scaleX: s.scale_x,
      scaleY: s.scale_y,
      spacing: s.spacing,
      angle: s.angle,
      borderStyle: border_style && BORDER_STYLE[border_style],
      outline: s.outline,
      shadow: s.shadow,
      alignment: alignment && ALIGNMENT[alignment],
      marginL: s.margin_l,
      marginR: s.margin_r,
      marginV: s.margin_v,
    };
    for (const k of Object.keys(style) as (keyof SubtitleStyle)[]) if (style[k] === undefined) delete style[k];
    const video = await fetchVideo(vdb, collection_id, video_id);
    return streamResult({ stream_url: await video.addSubtitle(style) }, "subtitle render");
  },
});

const createHighlightClip = defineTool({
  name: "create_highlight_clip",
  title: "Create highlight clip from a prompt",
  description:
    `Pick the moments of a video that match a natural-language prompt. Works on spoken content (requires an existing spoken-word index), visual content (requires an existing legacy scene index), or both. ${POLL} the selected shots with timestamps; pass those shots to compile_clips to render them into one stream.`,
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    prompt: z.string().describe("What the highlight should contain, e.g. 'every product demo moment'."),
    content_type: z.enum(["spoken", "visual", "multimodal"]).default("spoken").describe("Which index to select moments from."),
    model_name: z.enum(["basic", "pro", "ultra"]).default("basic").describe("Selection model quality tier."),
  }),
  handler: async ({ video_id, collection_id, prompt, content_type, model_name }, vdb) => {
    await fetchVideo(vdb, collection_id, video_id); // access check under the caller's collection scope
    const out = await startJob(vdb, ["video", video_id, "clip"], { prompt, content_type, model_name }, "Highlight selection");
    if (isJobStarted(out)) return out.job;
    const shots = shotsFromRaw(out.data);
    return shots.length ? { shots, next: "compile_clips" } : { shots };
  },
});

const reframeVideo = defineTool({
  name: "reframe_video",
  title: "Reframe video",
  description:
    `Re-crop a video (or a segment of it) to a new aspect ratio — vertical, square, landscape or custom dimensions — and save it as a new video in the same collection. Smart mode tracks subjects; simple mode centre-crops. ${POLL} the new video record; {accepted: true} when callback_url is given.`,
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    start: z.number().min(0).optional().describe("Segment start in seconds; omit for the whole video."),
    end: z.number().min(0).optional().describe("Segment end in seconds."),
    target: z
      .union([z.enum(["vertical", "square", "landscape"]), z.object({ width: z.number().int().positive().describe("Width in pixels."), height: z.number().int().positive().describe("Height in pixels.") })])
      .default("vertical")
      .describe("Output frame: a preset (vertical 9:16, square 1:1, landscape 16:9) or explicit {width, height}."),
    mode: z.enum(["simple", "smart"]).default("smart").describe("simple = centre crop; smart = subject-aware crop."),
    callback_url: CALLBACK_URL,
  }),
  retryWith: "list_videos",
  handler: async ({ video_id, collection_id, start, end, target, mode, callback_url }, vdb) => {
    await fetchVideo(vdb, collection_id, video_id); // access check under the caller's collection scope
    const out = await startJob(vdb, ["video", video_id, "reframe"], { start, end, target, mode, callback_url }, "Reframe");
    if (callback_url) return { accepted: true, video_id, collection_id, callback_url };
    return isJobStarted(out) ? out.job : shapeResult(out.data);
  },
});

const downloadStream = defineTool({
  name: "download_stream",
  title: "Download stream as MP4",
  description:
    `Render any VideoDB stream URL (from generate_clip, compile_clips, add_subtitles or get_video) into a downloadable MP4 file. ${POLL} download_url. A stream that was already exported answers with download_url at once.`,
  kind: "create",
  input: z.object({
    stream_url: z.string().url().describe("A VideoDB stream URL (.m3u8)."),
    name: z.string().describe("File name for the download, e.g. 'highlights.mp4'."),
  }),
  handler: async ({ stream_url, name }, vdb) => {
    const out = await startJob(vdb, ["download"], { stream_link: stream_url, name }, "MP4 export");
    return isJobStarted(out) ? out.job : out.data;
  },
});

export const streams: Toolset = {
  name: "streams",
  description: "Clips, compilations, subtitles, highlights, reframing, downloads.",
  defaultEnabled: true,
  tools: [generateClip, compileClips, addSubtitles, createHighlightClip, reframeVideo, downloadStream],
};
