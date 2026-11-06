import { TOOLSETS, allTools } from "./registry";
import type { ToolDef } from "./tool";
import type { z } from "zod";
import { listAssets, getAsset, deleteAsset } from "@/lib/toolsets/openai/assets";
import { generateMedia } from "@/lib/toolsets/openai/genai";
import { createRtstreamAlert } from "@/lib/toolsets/openai/live";
import { understandVideoSlim, createIndexSlim, addSubtitlesSlim, renderTimelineSlim, reframeVideoSlim } from "@/lib/toolsets/openai/slim";

const CATALOG = new Map(allTools(TOOLSETS).map((t) => [t.name, t]));

/**
 * Pick a catalog tool, optionally rewording its description and field docs so
 * they only name tools this profile exposes. The schema shape and handler stay.
 */
function pick(name: string, description?: string, fields: Record<string, string> = {}): ToolDef<any> {
  const t = CATALOG.get(name);
  if (!t) throw new Error(`Profile references unknown tool ${name}`);
  if (!description && !Object.keys(fields).length) return t;
  const shape = t.input.shape as Record<string, z.ZodType>;
  const extended = Object.fromEntries(Object.entries(fields).map(([k, doc]) => {
    if (!shape[k]) throw new Error(`${name} has no field ${k}`);
    return [k, shape[k].describe(doc)];
  }));
  return { ...t, description: description ?? t.description, input: Object.keys(extended).length ? t.input.extend(extended) : t.input };
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
  pick(
    "get_job_result",
    "Fetch the result of a background job started by upload_media, render_timeline, download_stream, generate_clip, compile_clips, reframe_video, generate_transcript or generate_media. Pass the output_url those tools returned. While the job is running the reply is {status:'processing'} with the same output_url — wait ~30 s and call again; when it finishes the reply is the job's result (media record, stream_url + player_url, download_url or shots). Failures are reported as errors. Only VideoDB job URLs are accepted."
  ),
  // transcripts
  pick("generate_transcript"),
  pick("get_transcript"),
  // understand + index
  understandVideoSlim,
  pick(
    "get_understanding",
    "Get the status of one understanding run and of each analyzer in it (pending, running, done, failed). Pipeline: understand_video (extract) → create_index (make retrievable) → search_video / search_collection.",
    { understanding_id: "Understanding run ID (from understand_video)." }
  ),
  createIndexSlim,
  pick(
    "list_indexes",
    "List the v2 indexes of a video (ID, name, status, capabilities, record count). Check this before understand_video: a ready index means the video is already searchable with search_video / search_collection."
  ),
  // search
  pick("search_video"),
  pick("search_collection"),
  // edit + deliver
  pick("generate_clip"),
  pick(
    "compile_clips",
    "Stitch moments from one or more videos into a single new stream — e.g. turn search_video results into a highlight reel. Returns immediately with {status:'processing', output_url}; poll get_job_result with that output_url (~30 s apart) until it returns stream_url and player_url."
  ),
  addSubtitlesSlim,
  reframeVideoSlim,
  renderTimelineSlim,
  pick(
    "download_stream",
    "Render any VideoDB stream URL (from generate_clip, compile_clips, add_subtitles, render_timeline or get_asset) into a downloadable MP4 file. Returns immediately with {status:'processing', output_url}; poll get_job_result with that output_url (~30 s apart) until it returns download_url. A stream that was already exported answers with download_url at once."
  ),
  // live
  pick(
    "connect_rtstream",
    "Register a live RTSP/RTMP/HLS stream with VideoDB and start ingesting it. Returns the rtstream ID used by every other rtstream tool. Set store=true to keep a recording."
  ),
  pick(
    "index_rtstream_scenes",
    "Start a continuous visual (scene) index on a real-time stream: every window_seconds, frame_count frames are described with the prompt. Returns the scene index; read results with get_rtstream_scenes, alert on them with create_rtstream_alert."
  ),
  createRtstreamAlert,
  pick("get_rtstream_scenes", undefined, { scene_index_id: "Scene index ID (rtstream_index_id from index_rtstream_scenes)." }),
  // genai (OpenAI route only; the Anthropic directory rejects generation tools)
  generateMedia,
];
