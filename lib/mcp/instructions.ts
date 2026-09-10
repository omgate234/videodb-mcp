/** Server-level guidance sent to the client on initialize. Keep it short; tools carry the detail. */
export const INSTRUCTIONS = `VideoDB turns video/audio into a searchable, editable database.
IDs: videos m-…, audio a-…, images img-…, real-time streams rts-…, collections c-… ("default" always exists).
Typical flow: upload_media → understand_video → create_index → search_* / ask_* → generate_clip / compile_clips.
Existing v1 spoken-word/scene indexes are searched by the legacy_search_* tools. New indexes use understand_video → create_index; legacy index creation is not exposed by this connector.
Long jobs (upload_media, render_timeline, download_timeline_render, download_stream, generate_clip, compile_clips, create_highlight_clip, reframe_video, generate_transcript, translate_transcript) return {status:"processing", output_url} immediately; poll get_job_result(output_url) every ~30 s until it returns the result. Never re-run the job while it is processing.
Every stream_url has a matching player_url that opens in a browser.`;
