import { createHash } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
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
        "Open the VideoDB video editor for the user. Pass timeline_id to open a specific timeline; omit it to show the user's timelines.",
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
}
