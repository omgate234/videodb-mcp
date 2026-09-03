# VideoDB MCP Server

A remote [MCP](https://modelcontextprotocol.io) server that connects **Claude** (and any MCP client) to [**VideoDB**](https://videodb.io) — upload, index, search, edit, and stream videos straight from a conversation.

Built to meet [Anthropic's connector directory review criteria](https://claude.com/docs/connectors/building/review-criteria): OAuth 2.1, Streamable HTTP, read/write tool separation, and full tool annotations. Deploys to Vercel in minutes with **zero infrastructure — no database, no Redis**.

```
"Upload this YouTube keynote, index it, and find every moment where they demo the product.
 Then cut those moments into one highlight reel."
```

## Tools

Tools are grouped into **toolsets**, one per VideoDB domain, and every tool is backed by the official [`videodb`](https://www.npmjs.com/package/videodb) Node SDK. Which toolsets a deployment exposes is set with `VIDEODB_MCP_TOOLSETS` (comma list or `all`; unset → the default-on set). Full catalog, SDK mapping and exclusions: [docs/TOOLSETS.md](docs/TOOLSETS.md).

<!-- tools:begin — regenerate with `npm run tools:sync` -->
| Toolset | Default | Tool | Kind | What it does |
| --- | --- | --- | --- | --- |
| collections | on | `list_collections` | read | List all collections in the connected VideoDB account, with their IDs, names, descriptions and visibility. |
| collections | on | `get_collection` | read | Get one collection's ID, name, description and public/private visibility. |
| collections | on | `create_collection` | create | Create a new VideoDB collection to organize videos. |
| collections | on | `update_collection` | update | Rename a collection, change its description, or switch it between public and private. |
| collections | on | `delete_collection` | destructive | Permanently delete a collection and everything in it. |
| collections | on | `get_account_usage` | read | Get the connected VideoDB account's current usage and billing summary as reported by VideoDB. |
| collections | on | `list_invoices` | read | List the connected VideoDB account's invoices (first 200; `truncated` is set when more exist). |
| media | on | `list_assets` | read | List videos, audio files and images together in one paginated result, filtered by type, name pattern, duration or file size, and sorted by name, duration or size. |
| media | on | `list_videos` | read | List videos in a VideoDB collection: IDs, names, durations, and playable stream/player URLs. |
| media | on | `list_audios` | read | List audio files in a VideoDB collection: IDs, names, durations and sizes. |
| media | on | `list_images` | read | List images in a VideoDB collection: IDs, names and URLs. |
| media | on | `get_video` | read | Get metadata for one video: name, duration, thumbnail, stream URL, and a player URL for watching it in a browser. |
| media | on | `get_audio` | read | Get metadata for one audio file: name, duration and size. |
| media | on | `get_image` | read | Get metadata for one image: name and URL. |
| media | on | `upload_media` | create | Upload a video, audio file, or image into VideoDB from a public URL (direct file links and YouTube URLs both work). |
| media | on | `search_youtube` | read | Search YouTube for videos matching a query and return titles, URLs and metadata — useful for finding URLs to pass to upload_media. |
| media | on | `search_videos_by_title` | read | Find videos in a collection whose title matches a natural-language query. |
| media | on | `update_video` | update | Update a video's display name. |
| media | on | `generate_thumbnail` | create | Get the default thumbnail of a video, or generate one from a specific timestamp (in seconds). |
| media | on | `list_thumbnails` | read | List every thumbnail image generated for a video (see generate_thumbnail), with image IDs and URLs. |
| media | on | `get_media_download_url` | read | Get a signed, time-limited download URL for an audio file (a-) or image (img-). |
| media | on | `transcode_media` | create | Start a transcode job for a video at a public URL: change resolution, quality, framerate or aspect ratio, or mute audio. |
| media | on | `get_transcode_status` | read | Get the status and output of a transcode job started by transcode_media. |
| media | on | `delete_video` | destructive | Permanently delete a video from a VideoDB collection. |
| media | on | `delete_audio` | destructive | Permanently delete an audio file from a VideoDB collection. |
| media | on | `delete_image` | destructive | Permanently delete an image from a VideoDB collection. |
| media | on | `remove_video_storage` | destructive | Delete the stored media bytes of a video while keeping its record, indexes and transcripts. |
| transcripts | on | `get_transcript` | read | Get the transcript of a video or audio file, either as plain text or with timestamped segments (per word, sentence, or time window). |
| transcripts | on | `generate_transcript` | create | Transcribe a video or audio file (speech to text), optionally forcing a fresh transcription or hinting the spoken language. |
| transcripts | on | `translate_transcript` | create | Translate a video's transcript into another language and return the translated segments (requires a transcript — get_transcript or generate_transcript first). |
| indexing | on | `index_spoken_words` | create | Transcribe and index everything spoken in a video so it becomes searchable with search_video / search_collection (legacy v1 index). |
| indexing | on | `index_scenes` | create | Visually index a video (legacy v1 scene index): samples frames per shot or per time window and describes what's on screen so visual moments become searchable (search_video with index_type='scene'). |
| indexing | on | `list_scene_indexes` | read | List the visual (scene) indexes that exist for a video, including their IDs, names and status. |
| indexing | on | `get_scene_index` | read | Return the per-scene records (start, end, description) of one visual scene index created by index_scenes. |
| indexing | on | `delete_scene_index` | destructive | Permanently delete one visual scene index of a video (the video itself is kept). |
| indexing | on | `understand_video` | create | Run one or more analyzers over a video to extract artifacts (transcript, scene descriptions, on-screen text, objects, brands, activities, locations). |
| indexing | on | `get_understanding` | read | Get the status of one understanding run and of each analyzer in it (pending, running, done, failed). |
| indexing | on | `list_understandings` | read | List every understanding run of a video with its status and analyzers. |
| indexing | on | `delete_understanding` | destructive | Permanently delete an understanding run and its stored analyzer artifacts (indexes built from it keep their own data). |
| indexing | on | `get_analyzer_output` | read | Return the raw artifact one analyzer produced in an understanding run, such as transcript segments or per-scene descriptions with start/end. |
| indexing | on | `create_index` | create | Build a retrieval-ready index from one analyzer's output of an understanding run (requires understand_video with that analyzer done). |
| indexing | on | `get_index` | read | Get one v2 index manifest by ID or name: status (building/ready/failed), record count, capabilities and field schema. |
| indexing | on | `list_indexes` | read | List the v2 indexes of a video (ID, name, status, capabilities, record count). |
| indexing | on | `delete_index` | destructive | Permanently delete a v2 index (its retrieval structures only; the video and understanding artifacts are kept). |
| indexing | on | `get_index_records` | read | Page through the records stored in a v2 index (scene_id, start, end, data). |
| search | on | `search_video` | read | Search within one video and get matching moments with start/end timestamps, text, and relevance scores. |
| search | on | `search_collection` | read | Search every indexed video in a collection and get matching moments grouped by video, with timestamps and scores. |
| search | on | `ask_video` | read | Answer a natural-language question from one video's indexed content (requires an index built by create_index). |
| search | on | `ask_collection` | read | Answer a natural-language question from every indexed video in a collection (requires indexes built by create_index). |
| search | on | `semantic_search` | read | Vector search over one or more indexes built by create_index (use_for includes 'semantic') in a video or across a collection. |
| search | on | `query_index` | read | Structured filter/sort over one index built by create_index (use_for includes 'query') in a video or across a collection. |
| search | on | `aggregate_index` | read | Counts, groups and facets over one index built by create_index (use_for includes 'aggregate') in a video or across a collection. |
| streams | on | `generate_clip` | create | Cut a clip (or a supercut of several segments) from a single video without re-encoding. |
| streams | on | `compile_clips` | create | Stitch moments from one or more videos into a single new stream — e.g. |
| streams | on | `add_subtitles` | create | Burn subtitles into a video from its transcript (requires index_spoken_words first). |
| streams | on | `create_highlight_clip` | create | Pick the moments of a video that match a natural-language prompt and compile them into one stream. |
| streams | on | `reframe_video` | create | Re-crop a video (or a segment of it) to a new aspect ratio — vertical, square, landscape or custom dimensions — and save it as a new video in the same collection. |
| streams | on | `download_stream` | create | Render any VideoDB stream URL (from generate_clip, compile_clips, add_subtitles, create_highlight_clip or get_video) into a downloadable MP4 file. |
| editor | on | `render_timeline` | create | Render a multi-track editor timeline into a new stream in one call. |
| editor | on | `download_timeline_render` | create | Request an MP4 download of a stream produced by render_timeline. |
| rtstream | off | `connect_rtstream` | create | Register a live RTSP/RTMP/HLS stream with VideoDB and start ingesting it. |
| rtstream | off | `list_rtstreams` | read | List real-time streams in the account with their IDs, names, status and media types. |
| rtstream | off | `get_rtstream` | read | Get one real-time stream: name, status, sample rate, media types, creation time. |
| rtstream | off | `set_rtstream_status` | update | Start (connect) or stop (disconnect) ingestion of a real-time stream. |
| rtstream | off | `get_rtstream_stream` | read | Generate a playable stream and player URL for a time window of a real-time stream. |
| rtstream | off | `export_rtstream_recording` | create | Export the latest completed recording of a real-time stream as a regular VideoDB video (or audio) asset. |
| rtstream | off | `get_rtstream_transcript` | read | Read the real-time transcript of a stream (requires transcription started via connect_rtstream enable_transcript or set_rtstream_transcript_status). |
| rtstream | off | `set_rtstream_transcript_status` | update | Start or stop real-time transcription on a stream. |
| rtstream | off | `index_rtstream_scenes` | create | Start a continuous visual (scene) index on a real-time stream: every window_seconds, frame_count frames are described with the prompt. |
| rtstream | off | `index_rtstream_audio` | create | Start a continuous spoken-word index on a real-time stream: the live transcript is chunked by segmenter/segment_value and summarised with the prompt. |
| rtstream | off | `list_rtstream_scene_indexes` | read | List the scene (visual and audio) indexes on a real-time stream with their IDs, prompts and status. |
| rtstream | off | `get_rtstream_scenes` | read | Read the records a scene index has produced so far (Unix-second start/end plus description). |
| rtstream | off | `set_rtstream_scene_index_status` | update | Resume or pause a scene index on a real-time stream. |
| rtstream | off | `search_rtstream` | read | Semantic search over the indexed records of a real-time stream (requires a scene index or index). |
| rtstream | off | `create_event` | create | Define a reusable event (a natural-language condition such as 'a person enters the restricted area') that alerts can watch for on any stream index. |
| rtstream | off | `list_events` | read | List the events defined on this account (ID, label, prompt). |
| rtstream | off | `create_rtstream_alert` | create | Attach an event (from create_event) to a stream index so VideoDB POSTs to callback_url each time the event is detected in a new window. |
| rtstream | off | `list_rtstream_alerts` | read | List the alerts attached to a stream index, with their event, callback and enabled state. |
| rtstream | off | `set_rtstream_alert_status` | update | Enable or disable an alert on a stream index without deleting it. |
| rtstream | off | `understand_rtstream` | create | Start a continuous vision-model (vlm) analysis on a real-time stream: every window_seconds, frame_count frames are analysed with the prompt and the output is stored under output_name. |
| rtstream | off | `list_rtstream_understandings` | read | List the continuous understanding jobs on a real-time stream with their status, segmentation, analyzers and output descriptors. |
| rtstream | off | `set_rtstream_understanding_status` | update | Resume or pause a continuous understanding job on a real-time stream. |
| rtstream | off | `get_rtstream_understanding_records` | read | Read the analysis records an understanding produced for a Unix-second time range (start and end required). |
| rtstream | off | `create_rtstream_index` | create | Materialise an understanding output into a continuously updated searchable index (requires understand_rtstream with store=true). |
| rtstream | off | `list_rtstream_indexes` | read | List the understanding-backed indexes on a real-time stream with their status, source understanding and capabilities. |
| rtstream | off | `set_rtstream_index_status` | update | Resume or pause an understanding-backed index on a real-time stream. |
| rtstream | off | `get_rtstream_index_records` | read | Read the records materialised into an understanding-backed index, optionally limited to a Unix-second start/end window. |
| meetings | off | `record_meeting` | create | Send a VideoDB recorder bot to a Zoom, Google Meet or Microsoft Teams meeting URL. |
| meetings | off | `get_meeting` | read | Get the current state of a meeting recorder bot started with record_meeting: status (initializing, joined, processing, done), the recorded video_id once done, and the speaker timeline when available. |
<!-- tools:end -->

No AI media *generation* tools are exposed (VideoDB's `generate*`/dub/voice-clone endpoints exist but are excluded — the Anthropic directory does not accept AI image/video/audio generation). Desktop capture is deliberately not exposed at all — the capture client is a local native binary talking over a long-lived socket, so neither it nor the capture sessions it produces belong in a remote connector.

## How auth works (no database)

Claude requires OAuth 2.1; VideoDB accounts use API keys. This server bridges the two with a **stateless OAuth layer**:

```
Claude → /oauth/register (Dynamic Client Registration)
       → /oauth/authorize        user pastes their VideoDB API key on a consent page
                                 key is verified live against GET api.videodb.io/user
       → /oauth/token            PKCE-checked; returns access + refresh tokens
       → /mcp                    Bearer token per request
```

Every artifact (client ID, auth code, access/refresh token) is an **AES-256-GCM-sealed payload** encrypted with `AUTH_SECRET`. The user's VideoDB API key travels *inside* the encrypted token and is decrypted per-request — it is never written to disk, logged, or stored server-side. Tokens are audience-bound to the `/mcp` URL (RFC 8707), auth codes are PKCE-bound (S256) and live 5 minutes, access tokens 1 hour, refresh tokens 30 days with rotation.

Trade-off to know: with no server-side state, individual tokens can't be revoked before expiry — rotating `AUTH_SECRET` revokes *all* connections at once (users just reconnect). If you later need per-user revocation, add a token-ID denylist in Vercel KV.

## Deploy to Vercel

1. Push this repo to GitHub, then **Import** it at [vercel.com/new](https://vercel.com/new) (or run `npx vercel` from the repo root — no GitHub needed).
2. Set one environment variable: `AUTH_SECRET` — generate with `openssl rand -hex 32`.
3. Make sure **Fluid compute** is enabled (default for new projects) so long-running uploads/indexing fit inside `maxDuration = 300`. On Pro you can raise it to 800 in `app/mcp/route.ts`.
4. Deploy. Your MCP endpoint is `https://<your-domain>/mcp`.

Point a real domain at it (e.g. `mcp.videodb.io`) before submitting to the directory — the reviewer expects the server domain to match the service.

## Connect it to Claude

1. Claude → **Settings → Connectors → Add custom connector** (Team/Enterprise: Organization settings → Connectors).
2. Enter `https://<your-domain>/mcp`.
3. Click **Connect** — the VideoDB consent page opens; paste your API key from [console.videodb.io](https://console.videodb.io).
4. Done. Ask Claude to `list my videodb collections` to smoke-test.

Also works in Claude Code (`claude mcp add --transport http videodb https://<your-domain>/mcp`) and MCP Inspector.

## Local development

```bash
npm install
cp .env.example .env       # set AUTH_SECRET
npm run dev                # http://localhost:3000
npm test                   # unit tests (no network)
npm run tools:list         # print the tool catalog
```

## Submitting to the Anthropic connector directory

See [docs/SUBMISSION.md](docs/SUBMISSION.md) for the filled-out checklist: portal steps, listing copy, allowed link URIs, test-account requirements, and the compliance acknowledgments.

## Project layout

```
app/mcp/route.ts                          MCP endpoint + bearer verification
app/oauth/{authorize,token,register}/     Stateless OAuth 2.1 authorization server
app/.well-known/...                       RFC 9728 + RFC 8414 discovery metadata
lib/mcp/{tool,registry,schemas}.ts        defineTool() kernel, toolset registry + env gating, shared zod atoms
lib/toolsets/*.ts                         One file per domain (collections, media, search, streams, editor, rtstream…)
lib/videodb/*.ts                          SDK client, output flattening, deadline, error mapping, key verification
lib/oauth.ts, lib/crypto.ts               Sealed-token machinery
lib/consent-page.ts                       VideoDB-branded consent screen
scripts/list-tools.ts                     Prints the tool catalog (npm run tools:list)
test/                                     vitest; harness fakes the SDK transport so real SDK classes run
```

## License

Apache-2.0 © Spext Labs Inc. (VideoDB)
