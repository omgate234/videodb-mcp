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
import { meetings } from "@/lib/toolsets/meetings";

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

export const TOOLSETS: Toolset[] = [collections, media, transcripts, indexing, search, streams, editor, rtstream, meetings];

export function enabledToolsets(env = process.env.VIDEODB_MCP_TOOLSETS): Toolset[] {
  const raw = env?.trim();
  if (!raw) return TOOLSETS.filter((t) => t.defaultEnabled);
  if (raw === "all") return TOOLSETS;
  const wanted = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  const unknown = [...wanted].filter((w) => !TOOLSETS.some((t) => t.name === w));
  if (unknown.length) throw new Error(`Unknown toolset(s) in VIDEODB_MCP_TOOLSETS: ${unknown.join(", ")}`);
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

export function registerAll(server: McpServer, toolsets = enabledToolsets()): void {
  for (const tool of allTools(toolsets)) register(server, tool);
}
