import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { apiKeyFrom } from "@/lib/mcp/tool";
import { BASE_URL } from "@/lib/videodb/client";

/**
 * Inline video player MCP App. Plays VideoDB streams (HLS or MP4) in the chat;
 * hosts without MCP Apps still get the player_url links in the text result.
 */

const EXT_APPS = "https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps@2.0.3/dist/src/app-with-deps.js";
const HLS = "https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js";

const HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  /* Follow the host's theme (data-theme); the system setting is only a fallback. A scheme that differs from the host's makes Chrome paint the frame opaque. */
  :root { color-scheme: light; --fg: #1a1a1a; --muted: #6b6b6b; --line: #e4e4e4; --active: #f0f0f0; }
  :root[data-theme="dark"] { color-scheme: dark; --fg: #ececec; --muted: #9a9a9a; --line: #333; --active: #2b2b2a; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme]) { color-scheme: dark; --fg: #ececec; --muted: #9a9a9a; --line: #333; --active: #2b2b2a; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: transparent; color: var(--fg); font: 13px/1.4 system-ui, -apple-system, sans-serif; }
  /* Fixed 16:9 box: the host sizes the iframe from our content, so vh units or a size that waits on metadata would collapse it. */
  video { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: contain; background: #000; border-radius: 8px; }
  .bar { display: flex; justify-content: space-between; gap: 12px; padding: 8px 2px; }
  .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  a { color: var(--muted); white-space: nowrap; }
  ol { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); max-height: 220px; overflow-y: auto; }
  li { display: flex; gap: 10px; padding: 7px 4px; border-bottom: 1px solid var(--line); cursor: pointer; }
  li.on { background: var(--active); }
  li .t { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .err { padding: 12px 2px; color: var(--muted); }
</style>
</head>
<body>
<video id="v" controls playsinline></video>
<div class="bar"><span class="title" id="title"></span><a id="open" href="#">Open in browser</a></div>
<ol id="list"></ol>
<script src="${HLS}"></script>
<script type="module">
import { App, applyDocumentTheme } from "${EXT_APPS}";

const video = document.getElementById("v");
const list = document.getElementById("list");
const app = new App({ name: "VideoDB player", version: "1.0.0" });
let items = [], current = -1, hls = null;

const fmt = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

function play(i) {
  const item = items[i];
  current = i;
  [...list.children].forEach((li, j) => li.classList.toggle("on", j === i));
  document.getElementById("title").textContent = item.title || "";
  hls?.destroy(); hls = null;
  const isHls = item.stream_url.includes(".m3u8");
  if (isHls && !video.canPlayType("application/vnd.apple.mpegurl") && window.Hls?.isSupported()) {
    hls = new Hls(); hls.loadSource(item.stream_url); hls.attachMedia(video);
  } else video.src = item.stream_url;
  video.addEventListener("loadedmetadata", () => { if (item.start) video.currentTime = item.start; video.play().catch(() => {}); }, { once: true });
}

// Stop at a range's end; move on to the next item when one finishes.
video.addEventListener("timeupdate", () => {
  const item = items[current];
  if (item?.end != null && video.currentTime >= item.end) { video.pause(); next(); }
});
video.addEventListener("ended", () => next());
const next = () => { if (current + 1 < items.length) play(current + 1); };

document.getElementById("open").addEventListener("click", (e) => {
  e.preventDefault();
  const item = items[current];
  if (item) app.openLink({ url: item.player_url });
});

function render(data) {
  items = data?.items ?? [];
  if (!items.length) { document.body.innerHTML = '<div class="err">Nothing to play.</div>'; return; }
  list.innerHTML = "";
  if (items.length > 1) items.forEach((item, i) => {
    const li = document.createElement("li");
    const range = item.start != null ? fmt(item.start) + (item.end != null ? "–" + fmt(item.end) : "") : "";
    li.innerHTML = '<span class="t"></span><span></span>';
    li.children[0].textContent = range || String(i + 1);
    li.children[1].textContent = item.title || "Clip " + (i + 1);
    li.onclick = () => play(i);
    list.appendChild(li);
  });
  play(0);
}

app.ontoolresult = (res) => render(res.structuredContent);
app.onhostcontextchanged = (ctx) => ctx.theme && applyDocumentTheme(ctx.theme);
await app.connect();
const theme = app.getHostContext()?.theme;
if (theme) applyDocumentTheme(theme);
</script>
</body>
</html>`;

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
        _meta: { ui: { csp: { connectDomains: ["https://*.videodb.io"], resourceDomains: ["https://cdn.jsdelivr.net", "https://*.videodb.io"] } } },
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
