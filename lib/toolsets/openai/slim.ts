import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import { ANALYZER_TYPES, FIELD_CAP, USE_FOR, createIndex, understandVideo } from "@/lib/toolsets/indexing";
import { addSubtitles, reframeVideo } from "@/lib/toolsets/streams";
import { renderTimeline } from "@/lib/toolsets/editor";

/**
 * ChatGPT hides a plugin tool whose spec exceeds its size budget. These variants keep
 * each original's name, handler and accepted payloads; only prose shrinks.
 * Shared atoms are copied, not imported: the originals' descriptions are the fat.
 */

const COLLECTION_ID = z.string().default("default").describe("Default 'default'.");
const VIDEO_ID = z.string().describe("Video ID (m-…).");
const CALLBACK_URL = z.string().url().optional().describe("Webhook on completion; returns at once.");

// ---- understand_video ----

const SAMPLING = z.union([
  z.strictObject({ strategy: z.literal("uniform"), frame_count: z.number().int().min(1) }),
  z.strictObject({ strategy: z.literal("interval"), every: z.number().positive() }),
]);

const ANALYZER = z.strictObject({
  type: z.enum(ANALYZER_TYPES),
  name: z.string().optional().describe("Needed to run two of one type."),
  config: z.record(z.string(), z.unknown()).optional().describe("Options by type; see description."),
  inputs: z.array(z.string().min(1)).optional().describe("Earlier analyzer names to read."),
  sampling: SAMPLING.optional(),
});

const SEGMENTATION = z.union([
  z.strictObject({ type: z.literal("shot").default("shot"), threshold: z.number().positive().optional(), min_scene_len: z.number().int().min(1).optional() }),
  z.strictObject({ type: z.literal("time"), seconds: z.number().positive().optional() }),
]);

export const understandVideoSlim = defineTool({
  ...understandVideo,
  description: `Run analyzers over a video to extract timed artifacts. Artifacts are not searchable until create_index runs on them (then semantic_search/query_index/aggregate_index). Poll get_understanding; read with get_analyzer_output.
Default names: spoken_words→transcript, vlm→scene, ocr→text, object_detection→objects, brand_detection→brands, activity_recognition→activity, location_detection→location.
config by type: spoken_words: language, speaker_labels. vlm: model, prompt, schema (JSON output), sandbox_id. object_detection: sandbox_id (required), labels (COCO 80), confidence_threshold, include_bounding_boxes. Rest: model. model = hosted tier mini|basic|pro|ultra or a provider id. object_detection and open-weight VLMs need a sandbox: create_sandbox → get_sandbox until active → config.sandbox_id; stop_sandbox after (bills while running).
inputs: use {{inputs.transcript}} in a prompt, else appended.
segmentation (run-wide): shot threshold 30 (default) for edited video, time seconds N for unedited footage. sampling (run or analyzer level): uniform frame_count 4-8 for scenes, interval every N s for brief text/motion; spoken_words ignores it. transform resolution '480p' cuts cost.`,
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    analyzers: z.array(ANALYZER).min(1),
    segmentation: SEGMENTATION.optional(),
    sampling: SAMPLING.optional(),
    transform: z.strictObject({ resolution: z.string() }).optional(),
    callback_url: CALLBACK_URL,
  }),
});

// ---- create_index ----

export const createIndexSlim = defineTool({
  ...createIndex,
  description: `Build a retrieval-ready index from one analyzer's artifact of an understanding run; the analyzer must be done (get_understanding). Pipeline: understand_video → create_index → semantic_search / query_index / aggregate_index.
use_for: semantic → semantic_search (embeddings); query → query_index (exact filters, ranges); aggregate → aggregate_index (counts, group_by). Omit for all three; ['query'] skips embeddings (cheaper, ready instantly). get_index reports the effective capability, which can be narrower.
fields maps group → field names: {semantic:['description'], filter:['label'], aggregate:['label']}. Groups: semantic, fts, filter, aggregate, sort, hydrate, return. Names may be dotted paths (frames.detections.label). A declared group is used verbatim, an omitted one is derived from the data (text/scene_description → semantic; language/brand_names → filter+aggregate; activity/location → all three; numbers also → sort); an empty array opts out. Unknown names fail with a 400 listing real fields.
Records are stored before this returns, so query_index and aggregate_index work while status is 'building'; semantic_search waits for 'ready'. Reuse one name across videos to form a group collection-scoped search can target; same name requires the same field structure.`,
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    understanding_id: z.string().describe("From understand_video."),
    analyzer_name: z.string().optional().describe("Give this or analyzer_id."),
    analyzer_id: z.string().optional(),
    name: z.string().optional().describe("Index name, used by semantic_search index_names and get_index."),
    use_for: z.array(USE_FOR).optional(),
    fields: z.partialRecord(FIELD_CAP, z.array(z.string().min(1))).optional().describe("Group → field names; see description."),
    callback_url: CALLBACK_URL,
  }),
});

// ---- add_subtitles ----

const SUBTITLE_STYLE = {
  font_name: z.string().optional(),
  font_size: z.number().int().min(8).max(72).optional(),
  primary_colour: z.string().optional(),
  secondary_colour: z.string().optional().describe("Karaoke."),
  outline_colour: z.string().optional(),
  back_colour: z.string().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  strike_out: z.boolean().optional(),
  scale_x: z.number().positive().optional(),
  scale_y: z.number().positive().optional(),
  spacing: z.number().optional(),
  angle: z.number().optional(),
  border_style: z.enum(["no_border", "opaque_box", "outline"]).optional(),
  outline: z.number().min(0).optional(),
  shadow: z.number().min(0).optional(),
  alignment: z.enum(["bottom_left", "bottom_center", "bottom_right", "middle_left", "middle_center", "middle_right", "top_left", "top_center", "top_right"]).optional(),
  margin_l: z.number().int().min(0).optional(),
  margin_r: z.number().int().min(0).optional(),
  margin_v: z.number().int().min(0).optional(),
};

export const addSubtitlesSlim = defineTool({
  ...addSubtitles,
  description:
    "Burn subtitles into a video from its transcript (needs a spoken-word index). ASS styling: colours &HAABBGGRR (&H00FFFFFF opaque white); outline, shadow, spacing, margins in px; scale_x/y factors; angle in degrees. Unset fields keep defaults (Arial 18, white, outline, bottom_center). Returns a new stream + player URL.",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID, ...SUBTITLE_STYLE }),
});

// ---- reframe_video ----

export const reframeVideoSlim = defineTool({
  ...reframeVideo,
  description:
    "Re-crop a video, or start..end seconds of it, to a new aspect ratio as a new video in the same collection; smart tracks subjects, simple centre-crops. Returns {status:'processing', output_url}; poll get_job_result (~30 s apart) for the new video, or {accepted:true} with callback_url.",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    start: z.number().min(0).optional(),
    end: z.number().min(0).optional(),
    target: z
      .union([z.enum(["vertical", "square", "landscape"]), z.object({ width: z.number().int().positive(), height: z.number().int().positive() })])
      .default("vertical"),
    mode: z.enum(["simple", "smart"]).default("smart"),
    callback_url: CALLBACK_URL,
  }),
});

// ---- render_timeline ----
// A strict subset of the full schema: fine styling knobs (text border/shadow, caption
// border/margins, effect/offset) are dropped so the spec fits the plugin's per-tool cap.

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, "hex colour like #FFFFFF");
const ASS = z.string().regex(/^&H[0-9a-fA-F]{8}$/, "ASS colour like &H00FFFFFF");
const SECONDS = z.number().min(0);
const FRACTION = z.number().min(0).max(1);
const CROP = z.object({ top: FRACTION.optional(), right: FRACTION.optional(), bottom: FRACTION.optional(), left: FRACTION.optional() }).optional();

const VIDEO_ASSET = z.object({ type: z.literal("video"), id: z.string(), start: SECONDS.optional().describe("Source offset."), volume: z.number().min(0).optional(), crop: CROP });
const IMAGE_ASSET = z.object({ type: z.literal("image"), id: z.string(), crop: CROP });
const AUDIO_ASSET = z.object({ type: z.literal("audio"), id: z.string(), start: SECONDS.optional().describe("Source offset."), volume: z.number().min(0).optional() });

const TEXT_ASSET = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
  font: z.object({ family: z.string().optional(), size: z.number().min(1).optional(), color: HEX.optional(), opacity: z.number().min(0).max(1).optional(), weight: z.number().int().min(100).max(900).optional() }).optional(),
  background: z.object({ color: HEX.optional(), opacity: z.number().min(0).max(1).optional() }).optional(),
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
});

const CAPTION_ASSET = z.object({
  type: z.literal("caption"),
  src: z.literal("auto").default("auto"),
  font: z.object({ name: z.string().optional(), size: z.number().min(1).optional(), bold: z.boolean().optional() }).optional(),
  primary_color: ASS.optional(),
  back_color: ASS.optional(),
  animation: z.enum(["box_highlight", "color_highlight", "reveal", "karaoke", "impact", "supersize"]).optional(),
});

const CLIP = z.object({
  start: SECONDS.describe("Timeline position."),
  duration: z.number().positive(),
  asset: z.discriminatedUnion("type", [VIDEO_ASSET, IMAGE_ASSET, AUDIO_ASSET, TEXT_ASSET, CAPTION_ASSET]),
  transition: z
    .object({ in: z.string().optional(), out: z.string().optional(), duration: z.number().positive().optional() })
    .optional()
    .describe("in/out: fade, reveal, wipe_left, wipe_right."),
  filter: z.enum(["blur", "boost", "contrast", "darken", "greyscale", "lighten", "muted", "negative"]).optional(),
  scale: z.number().min(0).max(10).optional(),
  opacity: z.number().min(0).max(1).optional(),
  fit: z.enum(["crop", "cover", "contain", "none"]).optional(),
  position: z.enum(["top", "bottom", "left", "right", "center", "top_left", "top_right", "bottom_left", "bottom_right"]).optional(),
  z_index: z.number().int().optional(),
});

const TRACK = z.object({ z_index: z.number().int().optional(), clips: z.array(CLIP).min(1) });

export const renderTimelineSlim = defineTool({
  ...renderTimeline,
  description:
    "Render a multi-track timeline into a new stream. Tracks stack by z_index; each clip places an asset (video/image/audio by existing VideoDB id, styled text, or caption) at a start time for a duration. Caption 'auto' needs a spoken-word index on the video, else the render yields zero captions without error. Text width/height are honoured only under fit 'contain' (default 'crop' scales the box to the frame). Returns {status:'processing', output_url}; poll get_job_result (~30 s apart) for stream_url and player_url; download_timeline_render makes an MP4.",
  input: z.object({
    tracks: z.array(TRACK).min(1),
    background: HEX.optional(),
    resolution: z.string().regex(/^\d+x\d+$/, "WIDTHxHEIGHT").optional().describe("WIDTHxHEIGHT, default 1280x720."),
  }),
});
