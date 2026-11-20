import { enabledToolsets } from "./registry";
import { director } from "@/lib/toolsets/director";

/** Server-level guidance sent to the client on initialize. Keep it short; tools carry the detail. */
const BASE = `VideoDB turns video/audio into a searchable, editable database.
IDs: videos m-…, audio a-…, images img-…, real-time streams rts-…, collections c-… ("default" always exists).
Typical flow: upload_media → understand_video → create_index → search_* / ask_* → generate_clip / compile_clips.
Existing v1 spoken-word/scene indexes are searched by the legacy_search_* tools. New indexes use understand_video → create_index; legacy index creation is not exposed by this connector.
Long jobs (upload_media, render_timeline, download_timeline_render, download_stream, generate_clip, compile_clips, create_highlight_clip, reframe_video, generate_transcript, translate_transcript) return {status:"processing", output_url} immediately; poll output_url every ~30 s with an HTTP GET or with get_job_result(output_url) until it returns the result. Never re-run the job while it is processing.
{status:"insufficient_credit"}: tell the user there aren't enough VideoDB credits to continue. Show the exact console_url as an "Add credits" link and state that no subscription is required. Don't mention Pro, upgrades, or promotions. Only report a balance if one is provided. Wait until the user confirms they've added credits before retrying.
{status:"plan_limit"}: the account hit a usage limit. Follow action_required: add_credits → show the exact console_url as an "Add credits" link, say adding credits lifts the limit and no subscription is required; contact_support → tell the user to email the contact address to have it raised and that adding credits will not lift it. Don't mention Pro, upgrades, or promotions. Wait until the user confirms before retrying.
Every stream_url has a matching player_url that opens in a browser. To let the user watch a stream, clip or search result, call show_video with its stream_url(s); it plays inline.
Show, don't list: when the user wants to see or review something, open it in the chat. Assets in a collection → show_assets. A video, clip or search hits → show_video (hits inside one video go in as its moments). What understand_video found, or how a run is going → show_understanding; call it right after starting understand_video so the user watches the run finish. What an index or a transcript holds → show_index. These views load the data themselves, so don't fetch it first.
When no tool can do what the user asked, a result looks wrong, or the user is unhappy with VideoDB, call submit_feedback once per issue, then keep helping.`;

// Routing for dataset_search lives here, where the client weighs it against search_* before picking a tool.
const DATASET_SEARCH = `

Robot-learning datasets: dataset_search searches a hosted corpus of 30+ public robot-learning and human-activity datasets (robot and humanoid manipulation, real and simulated, drone flights, egocentric and exocentric human video). Use it whenever the user wants data for robotics, embodied AI, imitation learning, VLA or policy training, or wants to find, count, curate, verify or export episodes, demonstrations or clips from such datasets, even without naming one. Questions about the corpus itself (which datasets, what each records, their fields, what exports) go to list_datasets, which answers at once. Neither touches the user's own videos; search_* and semantic_search cover those.
Flow: dataset_search(message) → poll get_search_status(msg_id) every ~10 s → result_sets[].content_id → get_result_set (totals, field counts) / list_result_shots (rows, watch_url links) → export_result_set(content_id, formats) → poll get_export_status(export_id) → hand download.url to the user.
The search agent reads annotation sentences and fields, not frames: it cannot watch clips or judge what the footage looks like. Send one goal per message, with every restriction stated and datasets named as list_datasets spells them. Ask it to judge hits only when the user wants them verified.
Keep the session_id from dataset_search and pass it on every follow-up ("only the sim ones", "verify each", "export the confirmed tier") so the agent refines its earlier sets instead of starting over.
Result sets (srs-…) and their rows work only with the dataset tools above. Rows are not VideoDB media: present their watch_url as a link instead of calling show_video or the clip tools.`;

export const INSTRUCTIONS = BASE + (enabledToolsets().includes(director) ? DATASET_SEARCH : "");

/** /openai-mcp ships a compact profile with enum tools; name them so the model does not look for the per-type ones. */
export const OPENAI_INSTRUCTIONS = `VideoDB turns video/audio into a searchable, editable database.
IDs: videos m-…, audio a-…, images img-…, real-time streams rts-…, collections c-… ("default" always exists).
Browse with list_assets / get_asset / delete_asset and pick asset_type (collection, video, audio, image, rtstream); there are no per-type list or delete tools.
Typical flow: upload_media → understand_video → create_index → search_video / search_collection → generate_clip / compile_clips / add_subtitles.
Long jobs (upload_media, render_timeline, download_stream, generate_clip, compile_clips, reframe_video, generate_transcript, generate_media) return {status:"processing", output_url} immediately; poll output_url every ~30 s with an HTTP GET or with get_job_result(output_url) until it returns the result. Never re-run a job while it is processing.
{status:"insufficient_credit"}: tell the user there aren't enough VideoDB credits to continue. Show the exact console_url as an "Add credits" link and state that no subscription is required. Only report a balance if one is provided. Wait until the user confirms they've added credits before retrying.
{status:"plan_limit"}: the account hit a usage limit. Follow action_required: add_credits → show the exact console_url as an "Add credits" link, say adding credits lifts the limit and no subscription is required; contact_support → tell the user to email the contact address to have it raised and that adding credits will not lift it. Don't mention Pro, upgrades, or promotions. Wait until the user confirms before retrying.
Every stream_url has a matching player_url that opens in a browser.`;
