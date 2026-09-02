import { z } from "zod";
import {
  Alignment,
  Background,
  Border,
  BorderAndShadow,
  CaptionAsset,
  Clip,
  Crop,
  EditorAudioAsset,
  EditorImageAsset,
  EditorTextAsset,
  EditorTimeline,
  EditorVideoAsset,
  Fit,
  Font,
  FontStyling,
  Offset,
  Positioning,
  Shadow,
  Track,
  Transition,
  type AnyEditorAsset,
} from "videodb";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { AUDIO_ID, IMAGE_ID, VIDEO_ID } from "@/lib/mcp/schemas";
import { playerUrlFor } from "@/lib/videodb/serialize";

/** Multi-track editor timeline (SDK EditorTimeline) → rendered stream. */

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, "hex colour like #FFFFFF");
// Caption colours use libass ASS format: &HAABBGGRR (alpha, blue, green, red).
const ASS = z.string().regex(/^&H[0-9a-fA-F]{8}$/, "ASS colour like &H00FFFFFF");
const SECONDS = z.number().min(0);
const FRACTION = z.number().min(0).max(1);

const CROP = z
  .object({
    top: FRACTION.optional().describe("Fraction (0–1) cropped from the top."),
    right: FRACTION.optional().describe("Fraction (0–1) cropped from the right."),
    bottom: FRACTION.optional().describe("Fraction (0–1) cropped from the bottom."),
    left: FRACTION.optional().describe("Fraction (0–1) cropped from the left."),
  })
  .optional()
  .describe("Crop applied before fitting; omit for no crop.");

const VIDEO_ASSET = z.object({
  type: z.literal("video"),
  id: VIDEO_ID.describe("Existing VideoDB video ID (m-…) from list_videos/upload_media."),
  start: SECONDS.optional().describe("Offset in seconds into the source video where playback begins. Default 0."),
  volume: z.number().min(0).optional().describe("Audio volume multiplier, 1 = original. Default 1."),
  crop: CROP,
});

const IMAGE_ASSET = z.object({
  type: z.literal("image"),
  id: IMAGE_ID.describe("Existing VideoDB image ID (img-…) from list_images/upload_media."),
  crop: CROP,
});

const AUDIO_ASSET = z.object({
  type: z.literal("audio"),
  id: AUDIO_ID.describe("Existing VideoDB audio ID (a-…) from list_audios/upload_media."),
  start: SECONDS.optional().describe("Offset in seconds into the source audio where playback begins. Default 0."),
  volume: z.number().min(0).optional().describe("Volume multiplier, 1 = original. Default 1."),
});

const TEXT_ALIGNMENT = z.enum(["top", "top_right", "right", "bottom_right", "bottom", "bottom_left", "left", "top_left", "center"]);

const TEXT_ASSET = z.object({
  type: z.literal("text"),
  text: z.string().min(1).describe("Text to render."),
  font: z
    .object({
      family: z.string().optional().describe("Font family. Default 'Clear Sans'."),
      size: z.number().min(1).optional().describe("Font size in px (≥ 1). Default 48."),
      color: HEX.optional().describe("Text colour, hex. Default #FFFFFF."),
      opacity: z.number().min(0).max(1).optional().describe("Text opacity 0–1. Default 1."),
      weight: z.number().int().min(100).max(900).optional().describe("Font weight 100–900."),
    })
    .optional()
    .describe("Font styling."),
  border: z
    .object({
      color: HEX.optional().describe("Border colour, hex. Default #000000."),
      width: z.number().min(0).optional().describe("Border width in px. Default 0."),
    })
    .optional()
    .describe("Text outline."),
  shadow: z
    .object({
      color: HEX.optional().describe("Shadow colour, hex. Default #000000."),
      x: z.number().min(0).optional().describe("Horizontal shadow offset in px."),
      y: z.number().min(0).optional().describe("Vertical shadow offset in px."),
    })
    .optional()
    .describe("Drop shadow."),
  background: z
    .object({
      width: z.number().min(0).optional().describe("Box width in px; 0 = fit text."),
      height: z.number().min(0).optional().describe("Box height in px; 0 = fit text."),
      color: HEX.optional().describe("Box colour, hex. Default #000000."),
      border_width: z.number().min(0).optional().describe("Padding around the text in px."),
      opacity: z.number().min(0).max(1).optional().describe("Box opacity 0–1. Default 1."),
      text_alignment: TEXT_ALIGNMENT.optional().describe("Where the text sits inside the box. Default center."),
    })
    .optional()
    .describe("Background box behind the text."),
  alignment: z
    .object({
      horizontal: z.enum(["left", "center", "right"]).optional().describe("Default center."),
      vertical: z.enum(["top", "center", "bottom"]).optional().describe("Default center."),
    })
    .optional()
    .describe("Text alignment within its width/height box."),
  tabsize: z.number().int().min(1).optional().describe("Spaces per tab (≥ 1). Default 4."),
  line_spacing: z.number().min(0).optional().describe("Extra spacing between lines in px. Default 0."),
  width: z.number().min(1).optional().describe("Text box width in px; omit to size automatically."),
  height: z.number().min(1).optional().describe("Text box height in px; omit to size automatically."),
});

const CAPTION_ASSET = z.object({
  type: z.literal("caption"),
  src: z
    .literal("auto")
    .default("auto")
    .describe("Caption source. 'auto' generates captions from the video's spoken-word index (requires index_spoken_words on that video)."),
  font: z
    .object({
      name: z.string().optional().describe("Font name. Default 'Clear Sans'."),
      size: z.number().min(1).optional().describe("Font size. Default 30."),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      underline: z.boolean().optional(),
      strikeout: z.boolean().optional(),
      scale_x: z.number().min(0).optional().describe("Horizontal scale in percent. Default 100."),
      scale_y: z.number().min(0).optional().describe("Vertical scale in percent. Default 100."),
      spacing: z.number().optional().describe("Extra letter spacing in px. Default 0."),
      angle: z.number().optional().describe("Rotation in degrees. Default 0."),
    })
    .optional()
    .describe("Caption font styling."),
  primary_color: ASS.optional().describe("Text colour in ASS &HAABBGGRR format. Default &H00FFFFFF (white)."),
  secondary_color: ASS.optional().describe("Karaoke/highlight colour, ASS format. Default &H000000FF (red)."),
  back_color: ASS.optional().describe("Background/box colour, ASS format. Default &H00000000."),
  border: z
    .object({
      style: z.enum(["outline_and_shadow", "opaque_box"]).optional().describe("Default outline_and_shadow."),
      outline: z.number().min(0).optional().describe("Outline thickness in px. Default 1."),
      outline_color: ASS.optional().describe("Outline colour, ASS format. Default &H00000000 (black)."),
      shadow: z.number().min(0).optional().describe("Shadow depth in px. Default 0."),
    })
    .optional()
    .describe("Caption outline and shadow."),
  position: z
    .object({
      alignment: z
        .enum(["bottom_left", "bottom_center", "bottom_right", "middle_left", "middle_center", "middle_right", "top_left", "top_center", "top_right"])
        .optional()
        .describe("Default bottom_center."),
      margin_l: z.number().min(0).optional().describe("Left margin in px. Default 30."),
      margin_r: z.number().min(0).optional().describe("Right margin in px. Default 30."),
      margin_v: z.number().min(0).optional().describe("Vertical margin in px. Default 30."),
    })
    .optional()
    .describe("Caption placement."),
  animation: z
    .enum(["box_highlight", "color_highlight", "reveal", "karaoke", "impact", "supersize"])
    .optional()
    .describe("Word-level caption animation; omit for static captions."),
});

const ASSET = z.discriminatedUnion("type", [VIDEO_ASSET, IMAGE_ASSET, AUDIO_ASSET, TEXT_ASSET, CAPTION_ASSET]);

const CLIP = z.object({
  start: SECONDS.describe("Seconds from the timeline start at which this clip begins."),
  duration: z.number().positive().describe("How long the clip plays, in seconds."),
  asset: ASSET.describe("What to show or play. `type` selects the asset kind."),
  transition: z
    .object({
      in: z
        .string()
        .optional()
        .describe("Entry transition: fade, reveal, wipe_left, wipe_right, shuffle, shuffle_top_left, shuffle_top_right, shuffle_bottom_left, shuffle_bottom_right."),
      out: z.string().optional().describe("Exit transition; same names as `in`."),
      duration: z.number().positive().optional().describe("Transition length in seconds. Default 0.5."),
    })
    .optional()
    .describe("Entry/exit transitions."),
  effect: z.string().optional().describe("Optional server-side motion effect name; omit unless one is known to be supported."),
  filter: z.enum(["blur", "boost", "contrast", "darken", "greyscale", "lighten", "muted", "negative"]).optional().describe("Visual filter."),
  scale: z.number().min(0).max(10).optional().describe("Size multiplier 0–10, 1 = natural size. Default 1."),
  opacity: z.number().min(0).max(1).optional().describe("Opacity 0–1. Default 1."),
  fit: z.enum(["crop", "cover", "contain", "none"]).optional().describe("How the asset fills the frame. Default crop."),
  position: z
    .enum(["top", "bottom", "left", "right", "center", "top_left", "top_right", "bottom_left", "bottom_right"])
    .optional()
    .describe("Anchor within the frame. Default center."),
  offset: z
    .object({
      x: z.number().optional().describe("Horizontal shift as a fraction of frame width (-1..1)."),
      y: z.number().optional().describe("Vertical shift as a fraction of frame height (-1..1)."),
    })
    .optional()
    .describe("Shift from the anchor position."),
  z_index: z.number().int().optional().describe("Stacking order within the track; higher draws on top. Default 0."),
});

const TRACK = z.object({
  z_index: z.number().int().optional().describe("Stacking order of the track; higher draws on top. Default 0."),
  clips: z.array(CLIP).min(1).describe("Clips on this track, each with its own start time."),
});

type ClipInput = z.infer<typeof CLIP>;
type AssetInput = z.infer<typeof ASSET>;

function buildAsset(a: AssetInput): AnyEditorAsset {
  switch (a.type) {
    case "video":
      return new EditorVideoAsset({ id: a.id, start: a.start, volume: a.volume, crop: a.crop && new Crop(a.crop) });
    case "image":
      return new EditorImageAsset({ id: a.id, crop: a.crop && new Crop(a.crop) });
    case "audio":
      return new EditorAudioAsset({ id: a.id, start: a.start, volume: a.volume });
    case "text":
      return new EditorTextAsset({
        text: a.text,
        font: a.font && new Font(a.font),
        border: a.border && new Border(a.border),
        shadow: a.shadow && new Shadow(a.shadow),
        background: a.background && new Background({ ...a.background, borderWidth: a.background.border_width, textAlignment: a.background.text_alignment }),
        alignment: a.alignment && new Alignment(a.alignment),
        tabsize: a.tabsize,
        lineSpacing: a.line_spacing,
        width: a.width,
        height: a.height,
      });
    case "caption":
      return new CaptionAsset({
        src: a.src,
        font: a.font && new FontStyling({ ...a.font, scaleX: a.font.scale_x, scaleY: a.font.scale_y }),
        primaryColor: a.primary_color,
        secondaryColor: a.secondary_color,
        backColor: a.back_color,
        border: a.border && new BorderAndShadow({ ...a.border, outlineColor: a.border.outline_color }),
        position: a.position && new Positioning({ alignment: a.position.alignment, marginL: a.position.margin_l, marginR: a.position.margin_r, marginV: a.position.margin_v }),
        animation: a.animation,
      });
  }
}

function buildClip(c: ClipInput): Clip {
  const clip = new Clip({
    asset: buildAsset(c.asset),
    duration: c.duration,
    transition: c.transition && new Transition(c.transition),
    effect: c.effect,
    filter: c.filter,
    scale: c.scale,
    opacity: c.opacity,
    position: c.position,
    offset: c.offset && new Offset(c.offset),
    zIndex: c.z_index,
  });
  // Fit.none is null, which the Clip constructor's `?? Fit.crop` swallows; assign after.
  if (c.fit) clip.fit = Fit[c.fit];
  return clip;
}

const renderTimeline = defineTool({
  name: "render_timeline",
  title: "Render editor timeline",
  description:
    "Render a multi-track editor timeline into a new stream in one call. Tracks stack by z_index; each clip places an asset at a start time for a duration with optional transitions, effects, filters, scale, opacity, fit and position. Asset kinds: video, image, audio (ids must be existing VideoDB media ids from this account), text (styled overlay text) and caption (src 'auto' generates captions from the video's spoken-word index, so that video requires index_spoken_words first). Returns stream_url and player_url; use download_timeline_render for an MP4.",
  kind: "create",
  input: z.object({
    tracks: z.array(TRACK).min(1).describe("Tracks in the timeline; the whole edit is described here."),
    background: HEX.optional().describe("Canvas background colour, hex. Default #000000."),
    resolution: z
      .string()
      .regex(/^\d+x\d+$/, "WIDTHxHEIGHT")
      .optional()
      .describe("Output resolution as WIDTHxHEIGHT, e.g. 1920x1080 or 1080x1920. Default 1280x720."),
  }),
  handler: async ({ tracks, background, resolution }, vdb) => {
    const timeline = new EditorTimeline(vdb);
    if (background) timeline.background = background;
    if (resolution) timeline.resolution = resolution;
    for (const t of tracks) {
      const track = new Track(t.z_index);
      for (const c of t.clips) track.addClip(c.start, buildClip(c));
      timeline.addTrack(track);
    }
    const streamUrl = await timeline.generateStream();
    if (!streamUrl) throw new Error("VideoDB returned no stream for this timeline.");
    return { stream_url: streamUrl, player_url: timeline.playerUrl ?? playerUrlFor(streamUrl) };
  },
});

const downloadTimelineRender = defineTool({
  name: "download_timeline_render",
  title: "Download timeline render",
  description: "Request an MP4 download of a stream produced by render_timeline. Returns the download details VideoDB reports for that stream.",
  kind: "create",
  input: z.object({ stream_url: z.string().url().describe("stream_url returned by render_timeline.") }),
  handler: async ({ stream_url }, vdb) => new EditorTimeline(vdb).downloadStream(stream_url),
});

export const editor: Toolset = {
  name: "editor",
  description: "Multi-track timeline editing (video/image/audio/text/caption clips).",
  defaultEnabled: true,
  tools: [renderTimeline, downloadTimelineRender],
};
