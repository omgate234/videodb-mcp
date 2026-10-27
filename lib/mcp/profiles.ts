import { TOOLSETS, allTools } from "./registry";
import type { ToolDef } from "./tool";
import { listAssets, getAsset, deleteAsset } from "@/lib/toolsets/openai/assets";
import { generateMedia } from "@/lib/toolsets/openai/genai";
import { createRtstreamAlert } from "@/lib/toolsets/openai/live";
import { understandVideoSlim, createIndexSlim, addSubtitlesSlim, renderTimelineSlim, reframeVideoSlim } from "@/lib/toolsets/openai/slim";

const CATALOG = new Map(allTools(TOOLSETS).map((t) => [t.name, t]));
function pick(name: string): ToolDef<any> {
  const t = CATALOG.get(name);
  if (!t) throw new Error(`Profile references unknown tool ${name}`);
  return t;
}

/**
 * Compact catalog for the ChatGPT plugin (/openai-mcp). Picked so every tool the
 * review test cases name survives and the advertised capabilities stay reachable
 * inside the plugin byte budget. scripts/tool-sizes.ts --profile openai gates it.
 */
export const OPENAI_PROFILE: ToolDef<any>[] = [
  // browse (enum tools replace the per-type list/get/delete families)
  listAssets,
  getAsset,
  deleteAsset,
  pick("get_account_usage"),
  // ingest + jobs
  pick("upload_media"),
  pick("get_job_result"),
  // transcripts
  pick("generate_transcript"),
  pick("get_transcript"),
  // understand + index
  understandVideoSlim,
  pick("get_understanding"),
  createIndexSlim,
  pick("list_indexes"),
  // search
  pick("search_video"),
  pick("search_collection"),
  // edit + deliver
  pick("generate_clip"),
  pick("compile_clips"),
  addSubtitlesSlim,
  reframeVideoSlim,
  renderTimelineSlim,
  pick("download_stream"),
  // live
  pick("connect_rtstream"),
  pick("index_rtstream_scenes"),
  createRtstreamAlert,
  pick("get_rtstream_scenes"),
  // genai (OpenAI route only; the Anthropic directory rejects generation tools)
  generateMedia,
];
