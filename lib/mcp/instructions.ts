import { enabledToolsets } from "./registry";
import { director } from "@/lib/toolsets/director";

/** Server-level guidance sent to the client on initialize. Keep it short; tools carry the detail. */
const BASE = `VideoDB turns video/audio into a searchable, editable database.
IDs: videos m-…, audio a-…, images img-…, real-time streams rts-…, collections c-… ("default" always exists).
Typical flow: upload_media → understand_video → create_index → search_* / ask_* → generate_clip / compile_clips.
Existing v1 spoken-word/scene indexes are searched by the legacy_search_* tools. New indexes use understand_video → create_index; legacy index creation is not exposed by this connector.
Long jobs (upload_media, render_timeline, download_timeline_render, download_stream, generate_clip, compile_clips, create_highlight_clip, reframe_video, generate_transcript, translate_transcript) return {status:"processing", output_url} immediately; poll get_job_result(output_url) every ~30 s until it returns the result. Never re-run the job while it is processing.
{status:"insufficient_credit"} means the account is out of credit: report the balance to the user, point them at the VideoDB console, and do not retry until they say they have added credits.
Every stream_url has a matching player_url that opens in a browser.`;

// Routing for dataset_search lives here, where the client weighs it against search_* before picking a tool.
const DATASET_SEARCH = `

Robot-learning datasets: dataset_search searches a hosted corpus of public robot-learning and human-activity datasets (currently RoboDojo robot manipulation episodes, real and sim, and Ego-Exo4D egocentric/exocentric human skilled-activity video). Use it whenever the user wants data for robotics, embodied AI, imitation learning, VLA or policy training, or wants to find, count, curate, verify or export episodes, demonstrations or clips from such datasets, even without naming one. It never touches the user's own videos; search_* and semantic_search cover those.
Flow: dataset_search(message) → poll get_search_status(msg_id) every ~10 s → result_sets[].content_id → get_result_set (totals, breakdowns) / list_result_shots (rows, watch_url links) / stream_result_shot (clip when watch_url is null) → export_result_set(content_id) → poll get_export_status(export_id) → hand download.url to the user.
Send the user's ask as a plain search; the agent plans the search itself. Ask it to judge or verify hits only when the user asks for that.
Keep the session_id from dataset_search and pass it on every follow-up ("only the sim ones", "verify each", "export the confirmed tier") so the agent refines its earlier sets instead of starting over.`;

export const INSTRUCTIONS = BASE + (enabledToolsets().includes(director) ? DATASET_SEARCH : "");
