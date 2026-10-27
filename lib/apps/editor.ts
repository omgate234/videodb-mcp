import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { apiKeyFrom } from "@/lib/mcp/tool";
import { BASE_URL } from "@/lib/videodb/client";

/**
 * Video editor MCP App. The UI bundle is built and hosted elsewhere and described by a
 * manifest at VIDEODB_EDITOR_APP_URL: {"html": "<url, relative to the manifest>", "csp": {...}, "permissions": {...}}.
 * The app reaches its backends only through `editor_api`, with the caller's own key.
 */

// Hosts cache UI resources by URI, so each build is served under its own content hash.
const RESOURCE_BASE = "ui://videodb/editor";
const MANIFEST_TTL_MS = 60_000;
const API_TIMEOUT_MS = 50_000;

interface Manifest {
  html: string;
  csp?: Record<string, string[]>;
  permissions?: Record<string, object>;
}

let cached: { at: number; uri: string; html: string; meta: Omit<Manifest, "html"> } | undefined;

async function loadApp(manifestUrl: string) {
  if (cached && Date.now() - cached.at < MANIFEST_TTL_MS) return cached;
  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Editor manifest fetch failed: ${res.status}`);
  const { html, csp, permissions } = (await res.json()) as Manifest;
  const page = await fetch(new URL(html, manifestUrl), { cache: "no-store" });
  if (!page.ok) throw new Error(`Editor bundle fetch failed: ${page.status}`);
  const text = await page.text();
  const version = createHash("sha256").update(text).digest("hex").slice(0, 12);
  cached = { at: Date.now(), uri: `${RESOURCE_BASE}/${version}`, html: text, meta: { csp, permissions } };
  return cached;
}

const API_INPUT = z.object({
  service: z.enum(["director", "videodb"]),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  path: z.string().describe("Path on the service, or an absolute URL on the same origin."),
  body: z.unknown().optional(),
  organization_id: z.string().optional(),
});

/** Resolve against the service base and refuse anything that leaves its origin. */
function resolve(base: string, path: string): URL {
  const baseUrl = new URL(base);
  const url = new URL(path, baseUrl.href.endsWith("/") ? baseUrl : `${baseUrl.href}/`);
  if (url.origin !== baseUrl.origin) throw new Error(`Refusing request outside ${baseUrl.origin}`);
  return url;
}

async function callApi(args: z.infer<typeof API_INPUT>, apiKey: string, directorBase: string) {
  const url = resolve(args.service === "director" ? directorBase : BASE_URL(), args.path);
  const headers: Record<string, string> = { "x-access-token": apiKey };
  if (args.organization_id) headers["x-organization-id"] = args.organization_id;
  if (args.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(url, {
    method: args.method,
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  const raw = await res.text();
  let body: unknown = raw;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {}
  return { status: res.status, ok: res.ok, body };
}

const TRACKS_GUIDE =
  "Shape (camelCase): config {background: '#000000', resolution: 'WIDTHxHEIGHT', even dims, height ≤ 2160}; " +
  "tracks[0] renders on top. track {id, clips: [{id, start, duration, asset}]}. clip.start is the position on the timeline (s); " +
  "asset.start is the in-point inside the source; asset.start + duration ≤ asset.length. No overlapping clips within a track; " +
  "durations ≥ 0.1s; all caption clips alone on one track. asset.type: video {id, streamUrl, length, name, collectionId} | " +
  "audio {id, length, name, collectionId} | image {id, name, collectionId} | text | caption. Omit fields you don't have (never null). " +
  "Keep existing ids; new clips and tracks may omit id.";

const TRACKS = z.array(z.object({ id: z.string().optional(), clips: z.array(z.record(z.string(), z.unknown())) }).passthrough());

type Api = (method: "GET" | "POST" | "PUT", path: string, body?: unknown) => Promise<{ status: number; ok: boolean; body: any }>;

/** Model-facing timeline tools: plain results, no UI of their own. */
function registerTimelineTools(server: McpServer, directorBase: string) {
  const handle =
    (run: (args: any, api: Api) => Promise<unknown>) =>
    async (args: any, ctx: unknown): Promise<CallToolResult> => {
      const key = apiKeyFrom(ctx);
      const api: Api = (method, path, body) => callApi({ service: "director", method, path, body }, key, directorBase);
      try {
        return { content: [{ type: "text", text: JSON.stringify(await run(args, api), null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    };
  const tool = (name: string, title: string, description: string, inputSchema: z.ZodObject<z.ZodRawShape>, readOnly: boolean, run: (args: any, api: Api) => Promise<unknown>) =>
    server.registerTool(
      name,
      { title, description, inputSchema, annotations: { title, readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false } },
      handle(run)
    );

  const failed = (res: { status: number; body: any }) => new Error(res.body?.message ?? `HTTP ${res.status}`);

  tool(
    "create_editor_timeline",
    "Create editor timeline",
    "Create an empty timeline in the user's video editor. Fill it with update_editor_timeline (revision from the result), then show it with open_video_editor.",
    z.object({ name: z.string().optional().describe("Timeline name.") }),
    false,
    async ({ name }: { name?: string }, api: Api) => {
      const id = randomUUID();
      const res = await api("POST", `/editor/${id}`, name ? { name } : {});
      if (!res.ok) throw failed(res);
      return { timeline_id: id, revision: res.body?.revision ?? 0 };
    }
  );

  tool(
    "get_editor_timeline",
    "Get editor timeline",
    "Read an editor timeline: {name, config, tracks, active_assets, revision}. Call it right before every update — the user may be editing the same timeline.",
    z.object({ timeline_id: z.string() }),
    true,
    async ({ timeline_id }: { timeline_id: string }, api: Api) => {
      const res = await api("GET", `/editor/${timeline_id}`);
      if (!res.ok) throw failed(res);
      const { name, config, tracks, active_assets, revision } = res.body ?? {};
      return { name, config, tracks, active_assets, revision };
    }
  );

  tool(
    "update_editor_timeline",
    "Update editor timeline",
    "Replace an editor timeline's tracks (and optionally background/resolution). Pass the revision from get_editor_timeline and send the COMPLETE tracks array — " +
      "clips left out are deleted, so never drop the user's clips unasked. A revision conflict means the user edited meanwhile: re-read and re-apply. " +
      "The user's open editor shows the change within seconds; describe what changed in editing terms. " +
      TRACKS_GUIDE,
    z.object({
      timeline_id: z.string(),
      revision: z.number().int(),
      tracks: TRACKS,
      config: z.object({ background: z.string().optional(), resolution: z.string().optional() }).optional(),
    }),
    false,
    async ({ timeline_id, revision, tracks, config }: any, api: Api) => {
      const res = await api("PUT", `/editor/${timeline_id}/tracks`, { revision, tracks, config });
      if (!res.ok) throw failed(res);
      return res.body;
    }
  );
}

export async function registerEditorApp(server: McpServer, env = process.env): Promise<void> {
  const manifestUrl = env.VIDEODB_EDITOR_APP_URL;
  const directorBase = env.VIDEODB_EDITOR_API_URL;
  if (!manifestUrl || !directorBase) return;

  let app: Awaited<ReturnType<typeof loadApp>>;
  try {
    app = await loadApp(manifestUrl);
  } catch (e) {
    console.error("[editor-app] not registered:", (e as Error).message);
    return;
  }
  const { uri: RESOURCE_URI } = app;

  registerAppResource(server, "VideoDB editor", RESOURCE_URI, { description: "Multi-track video editor." }, async () => {
    const { html, meta } = app;
    return { contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: { ui: meta } }] };
  });

  registerAppTool(
    server,
    "open_video_editor",
    {
      title: "Open video editor",
      description:
        "Open the interactive VideoDB video editor for the user. Pass timeline_id to open a timeline — including one you just built with " +
        "create_editor_timeline + update_editor_timeline; omit it to show the user's timelines.",
      inputSchema: z.object({ timeline_id: z.string().optional().describe("Timeline to open.") }),
      annotations: { title: "Open video editor", readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async (args) => {
      const timelineId = args.timeline_id ?? null;
      return {
        content: [{ type: "text", text: timelineId ? `Opened timeline ${timelineId} in the editor.` : "Opened the editor." }],
        structuredContent: { timeline_id: timelineId },
      };
    }
  );

  registerAppTool(
    server,
    "editor_api",
    {
      title: "Editor API",
      description: "Backend calls made by the video editor app. Not for direct use.",
      inputSchema: API_INPUT,
      annotations: { title: "Editor API", openWorldHint: false },
      _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ["app"] } },
    },
    async (args, ctx) => {
      try {
        const result = await callApi(args, apiKeyFrom(ctx), directorBase);
        return { content: [{ type: "text", text: `${args.method} ${args.path} → ${result.status}` }], structuredContent: result };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
      }
    }
  );

  registerTimelineTools(server, directorBase);
}
