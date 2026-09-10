/** Server-level guidance sent to the client on initialize. Keep it short; tools carry the detail. */
export const INSTRUCTIONS = `VideoDB turns video/audio into a searchable, editable database.
IDs: videos m-…, audio a-…, images img-…, real-time streams rts-…, collections c-… ("default" always exists).
Typical flow: upload_media → understand_video → create_index → search_* / ask_* → generate_clip / compile_clips.
Existing v1 spoken-word/scene indexes are searched by the legacy_search_* tools. New indexes use understand_video → create_index; legacy index creation is not exposed by this connector.
Write tools that take longer than ~4 minutes return {status:"processing"} — the job keeps running; re-check with the named read tool.
Every stream_url has a matching player_url that opens in a browser.`;
