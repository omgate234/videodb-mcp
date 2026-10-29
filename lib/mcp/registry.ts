import type { McpServer } from "@modelcontextprotocol/server";
import { register, type ToolDef } from "./tool";
import { collections } from "@/lib/toolsets/collections";
import { media } from "@/lib/toolsets/media";
import { transcripts } from "@/lib/toolsets/transcripts";
import { indexing } from "@/lib/toolsets/indexing";
import { search } from "@/lib/toolsets/search";
import { streams } from "@/lib/toolsets/streams";
import { editor } from "@/lib/toolsets/editor";
import { rtstream } from "@/lib/toolsets/rtstream";
import { sandbox } from "@/lib/toolsets/sandbox";
import { jobs } from "@/lib/toolsets/jobs";
import { director } from "@/lib/toolsets/director";
import { feedback } from "@/lib/toolsets/feedback";
import { registerEditorApp } from "@/lib/apps/editor";

/**
 * A toolset is one file in lib/toolsets owning a coherent slice of the SDK.
 * Deployments choose exposure with VIDEODB_MCP_TOOLSETS (comma list, or "all");
 * unset → every toolset with defaultEnabled.
 */
export interface Toolset {
  name: string;
  description: string;
  defaultEnabled: boolean;
  tools: ToolDef<any>[];
}

export const TOOLSETS: Toolset[] = [collections, media, transcripts, indexing, search, streams, editor, rtstream, sandbox, director, jobs, feedback];

export function enabledToolsets(env = process.env.VIDEODB_MCP_TOOLSETS): Toolset[] {
  const raw = env?.trim();
  if (!raw) return TOOLSETS.filter((t) => t.defaultEnabled);
  if (raw === "all") return TOOLSETS;
  const wanted = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  const unknown = [...wanted].filter((w) => !TOOLSETS.some((t) => t.name === w));
  if (unknown.length) throw new Error(`Unknown toolset(s) in VIDEODB_MCP_TOOLSETS: ${unknown.join(", ")}`);
  // Every job-starting tool hands back an output_url that only get_job_result can read.
  wanted.add(jobs.name);
  wanted.add(feedback.name);
  return TOOLSETS.filter((t) => wanted.has(t.name));
}

export function allTools(toolsets = TOOLSETS): ToolDef<any>[] {
  const tools = toolsets.flatMap((t) => t.tools);
  const seen = new Set<string>();
  for (const t of tools) {
    if (seen.has(t.name)) throw new Error(`Duplicate tool name: ${t.name}`);
    seen.add(t.name);
  }
  return tools;
}

export async function registerAll(server: McpServer, toolsets = enabledToolsets()): Promise<void> {
  allTools(toolsets); // rejects duplicate names across toolsets
  for (const ts of toolsets) for (const tool of ts.tools) register(server, tool, ts.name);
  await registerEditorApp(server);
}

/** Register a hand-picked tool list (a profile); `label` is the toolset name telemetry records. */
export function registerTools(server: McpServer, tools: ToolDef<any>[], label: string): void {
  const seen = new Set<string>();
  for (const t of tools) {
    if (seen.has(t.name)) throw new Error(`Duplicate tool name in profile ${label}: ${t.name}`);
    seen.add(t.name);
    register(server, t, label);
  }
}
