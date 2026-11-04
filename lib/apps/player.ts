import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { apiKeyFrom } from "@/lib/mcp/tool";
import { BASE_URL } from "@/lib/videodb/client";
import { playerHtml } from "./player-view";

/**
 * Inline video player MCP App. Plays VideoDB streams (HLS or MP4) in the chat;
 * hosts without MCP Apps still get the player_url links in the text result.
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
  stream_url: VIDEODB_URL.optional().describe("A VideoDB stream_url (.m3u8 or .mp4). Preferred when you have it."),
  player_url: VIDEODB_URL.optional().describe("A player.videodb.io/watch?v=… link, used when there is no stream_url."),
  title: z.string().optional().describe("Label shown under the player, e.g. the video name or what the moment shows."),
  start: z.number().min(0).optional().describe("Seconds into this stream to start playing."),
  end: z.number().min(0).optional().describe("Seconds into this stream to stop."),
}).refine((i) => i.stream_url || i.player_url, "Pass stream_url or player_url.");

type Item = z.infer<typeof ITEM>;

/** A player link carries either the stream URL itself or a slug that GET /player/<slug> resolves. */
async function resolveItem(item: Item, apiKey: string) {
  if (item.stream_url) return { ...item, stream_url: item.stream_url, player_url: item.player_url ?? `${WATCH}?v=${encodeURIComponent(item.stream_url)}` };
  const playerUrl = item.player_url!;
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
        "Play one or more VideoDB streams for the user in an inline player, instead of only pasting links. Use it whenever the user wants to watch, " +
        "preview or review something: a video, a generated clip or compiled reel, a render, or search results. Pass each stream_url as an item; " +
        "several items become a playlist (e.g. one per search hit, titled with what the moment shows). start/end play just that range of the stream. " +
        "If you only have a player.videodb.io link, pass it as player_url.",
      inputSchema: z.object({ items: z.array(ITEM).min(1).max(50) }),
      annotations: { title: "Show video", readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ items }, ctx) => {
      let withLinks;
      try {
        const apiKey = apiKeyFrom(ctx);
        withLinks = await Promise.all(items.map((i) => resolveItem(i, apiKey)));
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
      const lines = withLinks.map((i, n) => `${n + 1}. ${i.title ?? "Video"}: ${i.player_url}`);
      return {
        content: [{ type: "text", text: `Showing ${items.length} video${items.length > 1 ? "s" : ""} in the player.\n${lines.join("\n")}` }],
        structuredContent: { items: withLinks },
      };
    }
  );
}
