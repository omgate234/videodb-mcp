import { describe, expect, it, vi } from "vitest";
import { editor } from "@/lib/toolsets/editor";
import { call, fakeConnection, toolNamed } from "./harness";

// CaptionAsset(src="auto") logs a console.warn in the SDK; keep test output clean.
vi.spyOn(console, "warn").mockImplementation(() => {});

const render = toolNamed(editor, "render_timeline");
const download = toolNamed(editor, "download_timeline_render");

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

const EXPECTED_BODY = {
  timeline: {
    background: "#2B2B2B",
    resolution: "1920x1080",
    tracks: [
      {
        z_index: 0,
        clips: [
          {
            start: 0,
            clip: {
              asset: { type: "video", id: "m-1", start: 5, volume: 0.5, crop: { top: 0, right: 0, bottom: 0, left: 0.1 } },
              duration: 10,
              scale: 1,
              opacity: 1,
              fit: null,
              position: "center",
              offset: { x: 0, y: 0 },
              z_index: 0,
              transition: { in: "fade", out: "fade", duration: 1 },
              filter: "greyscale",
            },
          },
        ],
      },
      {
        z_index: 1,
        clips: [
          {
            start: 1,
            clip: {
              asset: {
                type: "text",
                text: "Hello",
                font: { family: "Arial", size: 36, color: "#FF0000", opacity: 1, weight: 700 },
                alignment: { horizontal: "left", vertical: "bottom" },
                tabsize: 4,
                line_spacing: 2,
                border: { color: "#FFC107", width: 2 },
                shadow: { color: "#000000", x: 3, y: 3 },
                background: { width: 0, height: 0, color: "#1E88E5", border_width: 8, opacity: 0.9, text_alignment: "bottom_left" },
                width: 600,
              },
              duration: 4,
              scale: 0.5,
              opacity: 0.8,
              fit: "crop",
              position: "bottom_left",
              offset: { x: 0.03, y: -0.05 },
              z_index: 2,
            },
          },
          {
            start: 0,
            clip: {
              asset: {
                type: "caption",
                src: "auto",
                font: { font_name: "Roboto", font_size: 40, bold: true, italic: false, underline: false, strikeout: false, scale_x: 90, scale_y: 100, spacing: 0, angle: 0 },
                primary_color: "&H00FFFF00",
                secondary_color: "&H000000FF",
                back_color: "&H00000000",
                border: { style: "opaque_box", outline: 2, outline_color: "&H00112233", shadow: 0 },
                position: { alignment: "top_center", margin_l: 30, margin_r: 30, margin_v: 50 },
                animation: "karaoke",
              },
              duration: 10,
              scale: 1,
              opacity: 1,
              fit: "crop",
              position: "center",
              offset: { x: 0, y: 0 },
              z_index: 0,
            },
          },
        ],
      },
    ],
  },
};

describe("editor", () => {
  it("render_timeline posts the full timeline JSON to /editor and returns stream + player urls", async () => {
    let posted: unknown;
    const vdb = fakeConnection({
      "POST editor": (body: unknown) => {
        posted = JSON.parse(JSON.stringify(body)); // what goes on the wire
        return { streamUrl: "https://stream/edit.m3u8", playerUrl: "https://player/edit" };
      },
    });
    const { data, isError } = await call(render, TWO_TRACKS, vdb);
    expect(isError, String(data)).toBe(false);
    expect(vdb.http.post).toHaveBeenCalledTimes(1);
    expect(vdb.http.post.mock.calls[0][0]).toEqual(["editor"]);
    expect(posted).toEqual(EXPECTED_BODY);
    expect(data).toEqual({ stream_url: "https://stream/edit.m3u8", player_url: "https://player/edit" });
  });

  it("render_timeline defaults background/resolution and derives player_url when the API omits it", async () => {
    const vdb = fakeConnection({
      "POST editor": (body: any) => {
        expect(body.timeline).toMatchObject({ background: "#000000", resolution: "1280x720" });
        return { streamUrl: "https://stream/plain.m3u8" };
      },
    });
    const { data } = await call(render, { tracks: [{ clips: [{ start: 0, duration: 3, asset: { type: "image", id: "img-1" } }] }] }, vdb);
    expect(data).toEqual({ stream_url: "https://stream/plain.m3u8", player_url: expect.stringContaining("plain.m3u8") });
  });

  it("render_timeline rejects out-of-range values before any wire call", () => {
    const clip = (extra: Record<string, unknown>) => ({
      tracks: [{ clips: [{ start: 0, duration: 5, asset: { type: "audio", id: "a-1" }, ...extra }] }],
    });
    expect(() => render.input.parse(clip({ scale: 11 }))).toThrow();
    expect(() => render.input.parse(clip({ opacity: 1.5 }))).toThrow();
    expect(() => render.input.parse(clip({ fit: "stretch" }))).toThrow();
    expect(() => render.input.parse(clip({ asset: { type: "text", text: "x", font: { size: 0 } } }))).toThrow();
    expect(() => render.input.parse(clip({ asset: { type: "text", text: "x", font: { weight: 950 } } }))).toThrow();
    expect(() => render.input.parse(clip({ asset: { type: "caption", src: "manual" } }))).toThrow();
    expect(() => render.input.parse(clip({ asset: { type: "video", id: "m-1", crop: { left: 2 } } }))).toThrow();
    expect(() => render.input.parse({ ...clip({}), resolution: "1080p" })).toThrow();
    expect(() => render.input.parse({ tracks: [] })).toThrow();
  });

  it("download_timeline_render posts stream_url to /editor/download", async () => {
    const vdb = fakeConnection({
      "POST editor/download": (body: unknown) => {
        expect(body).toEqual({ stream_url: "https://stream/edit.m3u8" });
        return { downloadUrl: "https://dl/edit.mp4", status: "done" };
      },
    });
    const { data, isError } = await call(download, { stream_url: "https://stream/edit.m3u8" }, vdb);
    expect(isError).toBe(false);
    expect(vdb.http.post.mock.calls[0][0]).toEqual(["editor", "download"]);
    expect(data).toEqual({ download_url: "https://dl/edit.mp4", status: "done" });
  });
});
