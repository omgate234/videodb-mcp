/** Server-level guidance sent to the client on initialize. Keep it short; tools carry the detail. */
export const INSTRUCTIONS = `VideoDB turns video/audio into a searchable, editable database.
IDs: videos m-…, audio a-…, images img-…, real-time streams rts-…, collections c-… ("default" always exists).
Typical flow: upload_media → index_spoken_words / index_scenes → search_* or ask_* → generate_clip / compile_clips.
Write tools that take longer than ~4 minutes return {status:"processing"} — the job keeps running; re-check with the named read tool.
Every stream_url has a matching player_url that opens in a browser.`;
