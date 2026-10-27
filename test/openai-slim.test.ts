import { describe, expect, it } from "vitest";
import { z } from "zod";
import { annotationsFor, type ToolDef } from "@/lib/mcp/tool";
import { createIndex, understandVideo } from "@/lib/toolsets/indexing";
import { addSubtitles, reframeVideo } from "@/lib/toolsets/streams";
import { renderTimeline } from "@/lib/toolsets/editor";
import { addSubtitlesSlim, createIndexSlim, reframeVideoSlim, renderTimelineSlim, understandVideoSlim } from "@/lib/toolsets/openai/slim";

/** Bytes of the spec as a client lists it; ChatGPT hides a tool whose spec is over its budget. */
const specBytes = (def: ToolDef<any>) =>
  JSON.stringify({
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: z.toJSONSchema(def.input, { io: "input", unrepresentable: "any" }),
    annotations: { title: def.title, ...annotationsFor(def) },
  }).length;

// Fixture inputs lifted from test/editor.test.ts.
const TWO_TRACKS = {
  background: "#2B2B2B",
  resolution: "1920x1080",
  tracks: [
    {
      clips: [
        {
          start: 0,
          duration: 10,
          asset: { type: "video", id: "m-1", start: 5, volume: 0.5, crop: { left: 0.1 } },
          transition: { in: "fade", out: "fade", duration: 1 },
          filter: "greyscale",
          fit: "none",
        },
      ],
    },
    {
      z_index: 1,
      clips: [
        {
          start: 1,
          duration: 4,
          asset: {
            type: "text",
            text: "Hello",
            font: { family: "Arial", size: 36, color: "#FF0000", weight: 700 },
            background: { color: "#1E88E5", opacity: 0.9, border_width: 8, text_alignment: "bottom_left" },
            border: { color: "#FFC107", width: 2 },
            shadow: { x: 3, y: 3 },
            alignment: { horizontal: "left", vertical: "bottom" },
            line_spacing: 2,
            width: 600,
          },
          position: "bottom_left",
          offset: { x: 0.03, y: -0.05 },
          scale: 0.5,
          opacity: 0.8,
          z_index: 2,
        },
        {
          start: 0,
          duration: 10,
          asset: {
            type: "caption",
            font: { name: "Roboto", size: 40, bold: true, scale_x: 90 },
            primary_color: "&H00FFFF00",
            border: { style: "opaque_box", outline: 2, outline_color: "&H00112233" },
            position: { alignment: "top_center", margin_v: 50 },
            animation: "karaoke",
          },
        },
      ],
    },
  ],
};
const ONE_IMAGE = { tracks: [{ clips: [{ start: 0, duration: 3, asset: { type: "image", id: "img-1" } }] }] };
const audioClip = (extra: Record<string, unknown>) => ({ tracks: [{ clips: [{ start: 0, duration: 5, asset: { type: "audio", id: "a-1" }, ...extra }] }] });

type Case = { original: ToolDef<any>; slim: ToolDef<any>; target: number; valid: unknown[]; invalid: unknown[] };

const CASES: Case[] = [
  {
    original: understandVideo,
    slim: understandVideoSlim,
    target: 4000,
    // From test/indexing.test.ts.
    valid: [
      {
        video_id: "m-1",
        collection_id: "c-1",
        analyzers: [{ type: "spoken_words" }, { type: "vlm", config: { prompt: "Describe the scene" } }],
        segmentation: { type: "time", seconds: 5 },
      },
      {
        video_id: "m-1",
        collection_id: "c-1",
        segmentation: { type: "shot", threshold: 30 },
        sampling: { strategy: "interval", every: 2 },
        transform: { resolution: "480p" },
        analyzers: [
          { type: "spoken_words", name: "transcript", config: { language: "en" } },
          { type: "vlm", name: "scene", inputs: ["transcript"], sampling: { strategy: "uniform", frame_count: 4 }, config: { model: "pro", prompt: "Describe. {{inputs.transcript}}" } },
        ],
      },
      { video_id: "m-1", analyzers: [{ type: "vlm", inputs: ["transcript"] }] },
      { video_id: "m-1", analyzers: [{ type: "vlm", sampling: { strategy: "interval", every: 2 } }] },
      { video_id: "m-1", analyzers: [{ type: "vlm" }], transform: { resolution: "480p" } },
      { video_id: "m-1", collection_id: "c-1", analyzers: [{ type: "ocr" }], callback_url: "https://cb.example/x" },
    ],
    invalid: [
      { video_id: "m-1", analyzers: [{ type: "vlm", inputs: { transcript: "..." } }] },
      { video_id: "m-1", analyzers: [{ type: "vlm", sampling: { strategy: "uniform" } }] },
      { video_id: "m-1", analyzers: [{ type: "vlm", sampling: { strategy: "every_frame" } }] },
      { video_id: "m-1", analyzers: [{ type: "vlm" }], transform: { size: "480p" } },
    ],
  },
  {
    original: createIndex,
    slim: createIndexSlim,
    target: 3000,
    // From test/indexing.test.ts.
    valid: [
      { video_id: "m-1", collection_id: "c-1", understanding_id: "u-1", analyzer_name: "scene", name: "scenes", use_for: ["semantic", "query"], fields: { semantic: ["description"] } },
      { video_id: "m-1", collection_id: "c-1", understanding_id: "u-1", analyzer_id: "an-1", callback_url: "https://cb.example/x" },
    ],
    invalid: [{ video_id: "m-1", understanding_id: "u-1", analyzer_name: "scene", use_for: ["fulltext"] }],
  },
  {
    original: addSubtitles,
    slim: addSubtitlesSlim,
    target: 2500,
    // From test/streams.test.ts.
    valid: [{ video_id: "m-1", font_size: 24, primary_colour: "&H00FFFF00", bold: true, border_style: "opaque_box", alignment: "top_center", margin_v: 40 }],
    invalid: [{ video_id: "m-1", font_size: 4 }],
  },
  {
    original: renderTimeline,
    slim: renderTimelineSlim,
    // Strict subset of the full schema: fine styling knobs, effect and offset are dropped.
    target: 4500,
    valid: [TWO_TRACKS, ONE_IMAGE, audioClip({})],
    invalid: [
      audioClip({ scale: 11 }),
      audioClip({ opacity: 1.5 }),
      audioClip({ fit: "stretch" }),
      audioClip({ asset: { type: "text", text: "x", font: { size: 0 } } }),
      audioClip({ asset: { type: "text", text: "x", font: { weight: 950 } } }),
      audioClip({ asset: { type: "caption", src: "manual" } }),
      audioClip({ asset: { type: "video", id: "m-1", crop: { left: 2 } } }),
      { ...audioClip({}), resolution: "1080p" },
      { tracks: [] },
    ],
  },
  {
    original: reframeVideo,
    slim: reframeVideoSlim,
    target: 1500,
    // From test/streams.test.ts.
    valid: [
      { video_id: "m-1", collection_id: "c-1", start: 5, end: 30, target: { width: 1080, height: 1350 }, mode: "simple" },
      { video_id: "m-1", callback_url: "https://hook.test/done" },
    ],
    invalid: [{ video_id: "m-1", mode: "auto" }],
  },
];

describe("openai slim tool variants", () => {
  for (const { original, slim, target, valid, invalid } of CASES) {
    describe(original.name, () => {
      it(`spec is under ${target} bytes`, () => {
        expect(specBytes(slim)).toBeLessThan(target);
        expect(specBytes(slim)).toBeLessThan(specBytes(original));
      });

      it("keeps the original name, kind and handler", () => {
        expect(slim.name).toBe(original.name);
        expect(slim.kind).toBe(original.kind);
        expect(slim.openWorld).toBe(original.openWorld);
        expect(slim.handler).toBe(original.handler);
      });

      it("parses the original fixtures to payloads the original handler accepts unchanged", () => {
        // Slim schemas are subsets: unknown styling keys are stripped, everything kept must round-trip.
        for (const x of valid) {
          const out = slim.input.parse(x);
          expect(original.input.parse(out)).toEqual(out);
        }
      });

      it("accepts nothing the original rejects (slim is a subset)", () => {
        for (const x of [...valid, ...invalid]) {
          if (slim.input.safeParse(x).success) expect(original.input.safeParse(x).success).toBe(true);
        }
      });

      it("rejects what the original rejects", () => {
        for (const x of invalid) {
          expect(original.input.safeParse(x).success).toBe(false);
          expect(slim.input.safeParse(x).success).toBe(false);
        }
      });
    });
  }
});
