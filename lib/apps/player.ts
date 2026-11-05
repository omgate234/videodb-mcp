import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { apiKeyFrom } from "@/lib/mcp/tool";
import { VIDEO_ID } from "@/lib/mcp/schemas";
import { BASE_URL, client, type Connection } from "@/lib/videodb/client";
import { asAccountBlocked, describeError } from "@/lib/videodb/errors";
import { fetchJob, isJobStarted, isVideodbUrl, startJob, streamResult, type JobOutcome } from "@/lib/videodb/jobs";
import { fetchVideo } from "@/lib/videodb/resolve";
import { playerHtml } from "./player-view";

/**
 * Inline video player MCP App. Plays VideoDB streams (HLS or MP4) in the chat;
 * hosts without MCP Apps still get the player_url links in the text result.
 * The reel layout plays clips back to back and exports them as one MP4 through export_reel.
 */

const EXT_APPS = "https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps@2.0.3/dist/src/app-with-deps.js";
const HLS = "https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js";

const HTML = playerHtml(EXT_APPS, HLS);

const RESOURCE_URI = `ui://videodb/player/${createHash("sha256").update(HTML).digest("hex").slice(0, 12)}`;

const WATCH = "https://player.videodb.io/watch";

const isVideoDbUrl = (u: string) => {
  const host = new URL(u).hostname;
  return host === "videodb.io" || host.endsWith(".videodb.io");
};
const VIDEODB_URL = z.string().url().refine(isVideoDbUrl, "Only VideoDB URLs (*.videodb.io) can be played.");

const ITEM = z.object({
  video_id: VIDEO_ID.optional().describe("A VideoDB video ID (m-…). Its stream is looked up, so no get_video/list call is needed first. Required for every reel clip."),
  collection_id: z.string().default("default").describe("Collection of video_id."),
  stream_url: VIDEODB_URL.optional().describe("A VideoDB stream_url (.m3u8 or .mp4)."),
  player_url: VIDEODB_URL.optional().describe("A player.videodb.io/watch?v=… link, used when there is no stream_url."),
  title: z.string().optional().describe("Label shown with the player, e.g. the video name or what the moment shows."),
  start: z.number().min(0).optional().describe("Seconds into this video to start playing."),
  end: z.number().min(0).optional().describe("Seconds into this video to stop."),
}).refine((i) => i.video_id || i.stream_url || i.player_url, "Pass video_id, stream_url or player_url.");

type Item = z.infer<typeof ITEM>;

const INPUT = z
  .object({
    items: z.array(ITEM).min(1).max(50),
    layout: z
      .enum(["player", "reel"])
      .default("player")
      .describe("player: one video, or a playlist of moments. reel: clips cut from videos and played back to back as one highlight reel the user can download as an MP4; every item needs video_id, start and end."),
    title: z.string().optional().describe("Reel title, e.g. '60-second highlights'. Also names the MP4."),
  })
  .refine(
    (a) => a.layout !== "reel" || a.items.every((i) => i.video_id && i.start != null && i.end != null && i.end > i.start),
    "Every reel clip needs video_id, start and end (end after start)."
  );

/** A player link carries either the stream URL itself or a slug that GET /player/<slug> resolves. */
async function resolveItem(item: Item, apiKey: string, vdb: () => Connection) {
  if (item.stream_url) return { ...item, stream_url: item.stream_url, player_url: item.player_url ?? `${WATCH}?v=${encodeURIComponent(item.stream_url)}` };
  if (!item.player_url) {
    const video = await fetchVideo(vdb(), item.collection_id, item.video_id!);
    if (!video.streamUrl) throw new Error(`${item.video_id} has no stream to play yet.`);
    return { ...item, title: item.title ?? video.name, stream_url: video.streamUrl, player_url: `${WATCH}?v=${encodeURIComponent(video.streamUrl)}` };
  }
  const playerUrl = item.player_url;
  const v = new URL(playerUrl).searchParams.get("v");
  if (!v) throw new Error(`${playerUrl} has no ?v= to play.`);
  if (/^https?:\/\//.test(v)) return { ...item, stream_url: v, player_url: playerUrl };
  const res = await fetch(`${BASE_URL()}/player/${encodeURIComponent(v)}`, { headers: { "x-access-token": apiKey } });
  const body = (await res.json().catch(() => null)) as { message?: string; data?: { url?: string; title?: string } } | null;
  const stream = body?.data?.url;
  if (!res.ok || !stream) throw new Error(`Couldn't open ${playerUrl}: ${body?.message ?? `HTTP ${res.status}`}. Pass its stream_url instead.`);
  if (!isVideoDbUrl(stream)) throw new Error(`${playerUrl} points outside VideoDB and can't play here.`);
  return { ...item, title: item.title ?? body?.data?.title ?? undefined, stream_url: stream, player_url: playerUrl };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Reel MP4 export runs in two VideoDB jobs: join the clips into one stream, then render that stream to a file. */
const EXPORT_INPUT = z.object({
  name: z.string().describe("File name of the MP4."),
  clips: z
    .array(z.object({ video_id: VIDEO_ID, collection_id: z.string().default("default"), start: z.number().min(0), end: z.number().min(0) }))
    .min(1)
    .optional()
    .describe("Clips in reel order; starts the export."),
  stage: z.enum(["joining", "rendering"]).optional().describe("Stage of a running export."),
  output_url: z.string().url().optional().describe("Job URL of a running export."),
});

type Export = { stage: "joining" | "rendering"; output_url: string } | { stage: "done"; download_url: string };

async function render(vdb: Connection, joined: JobOutcome, name: string): Promise<Export> {
  if (isJobStarted(joined)) return { stage: "joining", output_url: joined.job.output_url };
  const { stream_url } = streamResult(joined.data, "reel");
  return downloaded(await startJob(vdb, ["download"], { stream_link: stream_url, name }, "MP4 export"));
}

function downloaded(out: JobOutcome): Export {
  if (isJobStarted(out)) return { stage: "rendering", output_url: out.job.output_url };
  const url = out.data.download_url;
  if (typeof url !== "string" || !url) throw new Error("VideoDB returned no MP4 for this reel.");
  return { stage: "done", download_url: url };
}

export async function exportReel(vdb: Connection, args: z.infer<typeof EXPORT_INPUT>): Promise<Export> {
  if (args.clips) {
    const body = args.clips.map((c) => ({ video_id: c.video_id, collection_id: c.collection_id, shots: [[c.start, c.end]] }));
    return render(vdb, await startJob(vdb, ["compile"], body, "Reel"), args.name);
  }
  if (!args.stage || !args.output_url || !isVideodbUrl(args.output_url)) throw new Error("Pass clips, or the stage and output_url of a running export.");
  const out = await fetchJob(vdb, args.output_url);
  if (isJobStarted(out)) return { stage: args.stage, output_url: args.output_url };
  return args.stage === "joining" ? render(vdb, out, args.name) : downloaded(out);
}

export function registerPlayerApp(server: McpServer): void {
  registerAppResource(server, "VideoDB player", RESOURCE_URI, { description: "Inline video player." }, async () => ({
    contents: [
      {
        uri: RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: HTML,
        _meta: { ui: { csp: { connectDomains: ["https://*.videodb.io"], resourceDomains: ["https://cdn.jsdelivr.net", "https://*.videodb.io", "https://fonts.googleapis.com", "https://fonts.gstatic.com"] } } },
      },
    ],
  }));

  registerAppTool(
    server,
    "show_video",
    {
      title: "Show video",
      description:
        "Play one or more VideoDB videos for the user in an inline player, instead of only pasting links. Use it whenever the user wants to watch, " +
        "preview or review something: a video, a generated clip, a render, or search results. Pass each video as an item by video_id (or stream_url); " +
        "several items become a playlist (e.g. one per search hit, titled with what the moment shows). start/end play just that range. " +
        "For a highlight reel, supercut or 'best moments' video, use layout 'reel' with the clips in order: it plays them back to back at once " +
        "and the user can download the reel as an MP4 from the player, so don't call compile_clips or download_stream yourself for it.",
      inputSchema: INPUT,
      annotations: { title: "Show video", readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ items, layout, title }, ctx) => {
      let resolved;
      try {
        const apiKey = apiKeyFrom(ctx);
        let vdb: Connection | undefined;
        resolved = await Promise.all(items.map((i) => resolveItem(i, apiKey, () => (vdb ??= client(apiKey)))));
      } catch (e) {
        const blocked = asAccountBlocked(e);
        return { content: [{ type: "text", text: blocked ? JSON.stringify(blocked) : `Error: ${describeError(e)}` }], isError: !blocked };
      }
      if (layout === "reel") {
        let at = 0;
        const lines = resolved.map((i, n) => {
          const len = i.end! - i.start!;
          const line = `${n + 1}. ${i.title ?? i.video_id}: ${fmt(i.start!)}–${fmt(i.end!)} of ${i.video_id}, at ${fmt(at)}–${fmt(at + len)} in the reel`;
          at += len;
          return line;
        });
        return {
          content: [{ type: "text", text: `Showing a ${fmt(at)} reel of ${items.length} clip${items.length > 1 ? "s" : ""} in the player; the user can download it as an MP4 there.\n${lines.join("\n")}` }],
          structuredContent: { layout, title: title ?? "Highlight reel", items: resolved },
        };
      }
      const lines = resolved.map((i, n) => `${n + 1}. ${i.title ?? "Video"}${i.start != null || i.end != null ? ` (${fmt(i.start ?? 0)}–${i.end != null ? fmt(i.end) : "end"})` : ""}: ${i.player_url}`);
      return {
        content: [{ type: "text", text: `Showing ${items.length} video${items.length > 1 ? "s" : ""} in the player.\n${lines.join("\n")}` }],
        structuredContent: { layout, title, items: resolved },
      };
    }
  );

  registerAppTool(
    server,
    "export_reel",
    {
      title: "Export reel",
      description: "MP4 export run by the player's reel view. Not for direct use.",
      inputSchema: EXPORT_INPUT,
      annotations: { title: "Export reel", openWorldHint: false },
      _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ["app"] } },
    },
    async (args, ctx) => {
      try {
        const result = await exportReel(client(apiKeyFrom(ctx)), args);
        return { content: [{ type: "text", text: `Reel export: ${result.stage}` }], structuredContent: result };
      } catch (e) {
        const blocked = asAccountBlocked(e);
        if (blocked) return { content: [{ type: "text", text: blocked.message }], structuredContent: { stage: "blocked", console_url: blocked.console_url } };
        return { content: [{ type: "text", text: `Error: ${describeError(e)}` }], isError: true };
      }
    }
  );
}
