# Toolsets — SDK-backed tool catalog

The MCP server wraps the official `videodb` Node SDK (0.3.x). Tools are grouped into **toolsets**, one file each under `lib/toolsets/`, registered by `lib/mcp/registry.ts`. Exposure is chosen per deployment with `VIDEODB_MCP_TOOLSETS` (comma list or `all`; unset → every toolset marked default-on).

## Architecture

| Layer | File | Responsibility |
| --- | --- | --- |
| Transport/auth | `app/mcp/route.ts` | Streamable HTTP + bearer verification (unchanged OAuth layer) |
| Kernel | `lib/mcp/tool.ts` | `defineTool()` → name/annotation validation + null-tolerant input schema; `invoke()` = deadline + serialize + error mapping |
| Registry | `lib/mcp/registry.ts` | `Toolset` type, `TOOLSETS`, env gating, duplicate-name check |
| Shared schemas | `lib/mcp/schemas.ts` | zod atoms (`COLLECTION_ID`, `VIDEO_ID`, `TIMELINE`, `CALLBACK_URL`, `mediaKind()`) |
| SDK access | `lib/videodb/client.ts`, `resolve.ts` | `client(apiKey)` per call; `collection()` shell (no round-trip), `fetchVideo/Audio/Image` |
| Output | `lib/videodb/serialize.ts` | `toPlain()` snake_case flattening, `pick()`, `*_KEYS`, `shotsToPlain()` |
| Long jobs | `lib/videodb/deadline.ts` | 240 s race; timeout → `{status:"processing", retry_with}` |
| Errors | `lib/videodb/errors.ts` | SDK error classes → actionable text |
| Tests | `test/harness.ts` | `fakeConnection({"GET video": {...}})` fakes `vhttp`; real SDK classes run |

## Tool kinds → annotations

| kind | readOnlyHint | destructiveHint | idempotentHint | Use for |
| --- | --- | --- | --- | --- |
| `read` | true | — | — | GET-shaped, no account change (search/ask included) |
| `create` | false | false | — | Creates assets, indexes, streams, jobs |
| `update` | false | false | true | Rename, start/stop, enable/disable, visibility |
| `destructive` | false | true | true | Deletes |

## Rules for every tool

- snake_case name ≤ 64 chars, `verb_noun`; one purpose per tool; never a `method`/`path` pass-through.
- Prefer an SDK call. Where the API has no SDK binding, wrap the raw call in one `lib/videodb/*.ts` helper on `Connection.vhttp` (never a second HTTP stack) and keep the toolset handler SDK-shaped.
- Optional and defaulted params must tolerate an explicit `null`: clients send one for a param the model chose not to fill. `defineTool()` rewrites every tool's top-level params to read `null` as "not provided", so schemas are written with plain `.optional()`/`.default()` and nothing else is needed.
- Inputs snake_case; outputs snake_case via `toPlain`/`pick`. Trim large SDK objects with `pick(obj, *_KEYS)`; cap unbounded lists with `cap(items, key, max)` — truncated results always carry `truncated: true` + `total`.
- Long-running writes set `retryWith` to the read tool that shows the result.
- Descriptions state what the tool does and its prerequisite (e.g. "requires index_spoken_words"). No behavioural instructions to the model.
- Every tool: one unit test through `test/harness.ts` asserting the SDK wire call (`vdb.http.get/post…`) and the flattened output.

## Excluded from the connector

| Feature (SDK) | Reason |
| --- | --- |
| `generateImage/Music/SoundEffect/Voice/Video`, `dubVideo` | Directory policy: no AI image/video/audio generation |
| Voice clones, sandboxes, `GenerationJob`/`getJobStatus`/`waitForJob` | Exist only to serve the generation stack |
| `generateText` | LLM text; the client is already the LLM |
| Desktop capture in full: the capture client (`videodb/capture`), capture sessions (`Collection.listCaptureSessions`/`getCaptureSession`, `CaptureSession.*`), `WebSocketConnection`, `generateClientToken` | Capture is driven by a local native binary over a long-lived socket, with `generateClientToken` minting the secret for it. None of that surface — including the sessions it produces — belongs in a remote connector |
| `uploadFile` (local path), `play()` | Filesystem / spawns browser |
| Scene collections (`extractScenes` & CRUD), `Scene/Frame.describe`, `indexAudio`, `insertVideo` | v1 manual pipeline internals — deferred to v2 backlog |

Kept although model-backed (understanding/editing, not generation): `ask`, `translateTranscript`, `generateTranscript`, scene/visual indexing, `understand`, `reframe`, `clip`.

## Catalog

Legend: R read · C create · U update · D destructive. "SDK" names the call the handler must use. ★ = existing tool (keep name + semantics; extend inputs only).

### collections (default on) — owner: agent A

| Tool | Kind | SDK | Notes |
| --- | --- | --- | --- |
| `list_collections` ★ | R | `Connection.getCollections` | |
| `get_collection` | R | `Connection.getCollection(id)` | id, name, description, is_public |
| `create_collection` ★ | C | `Connection.createCollection(name, description, isPublic)` | |
| `update_collection` | U | `Connection.updateCollection` + `Collection.makePublic/makePrivate` | name/description optional; `is_public` optional → visibility call only when given |
| `delete_collection` | D | `Collection.delete` | refuse `default` |
| `get_account_usage` | R | `Connection.checkUsage` | |
| `list_invoices` | R | `Connection.getInvoices` | |

### media (default on) — owner: agent B

| Tool | Kind | SDK | Notes |
| --- | --- | --- | --- |
| `list_assets` | R | none — `GET /assets` through `Connection.vhttp` (`lib/videodb/assets.ts`) | account-wide when `collection_id` omitted; type/regex/duration/size filters, sort, pagination |
| `list_videos` ★ / `list_audios` / `list_images` | R | `Collection.getVideos/getAudios/getImages` | `pick` with `VIDEO_KEYS/AUDIO_KEYS/IMAGE_KEYS` |
| `get_video` ★ / `get_audio` / `get_image` | R | `Collection.getVideo/getAudio/getImage` | |
| `upload_media` ★ | C | `Collection.uploadURL` | + `callback_url` → returns `{accepted:true}` |
| `search_youtube` | R | `Connection.youtubeSearch(query, resultThreshold, duration)` | to find URLs to upload |
| `search_videos_by_title` | R | `Collection.searchTitle` | |
| `update_video` | U | `Video.update({name})` | |
| `generate_thumbnail` ★ / `list_thumbnails` | C / R | `Video.generateThumbnail(time)` / `Video.getThumbnails` | |
| `get_media_download_url` | R | `Audio.generateUrl` / `Image.generateUrl` | signed URL; video → use `download_stream` |
| `transcode_media` / `get_transcode_status` | C / R | `Connection.transcode(source, callbackUrl, mode, videoConfig, audioConfig)` / `getTranscodeDetails` | `callback_url` required by SDK |
| `delete_video` ★ / `delete_audio` / `delete_image` | D | `Collection.deleteVideo/deleteAudio/deleteImage` | |
| `remove_video_storage` | D | `Video.removeStorage` | keeps record, drops bytes |

### transcripts (default on) — owner: agent C

| Tool | Kind | SDK | Notes |
| --- | --- | --- | --- |
| `get_transcript` ★ | R | `Video.getTranscript(start,end,segmenter,length)` / `Audio.getTranscript` | `media_id` accepts m- or a- (`mediaKind`); keep `video_id` as alias for compatibility; `segmenter` word/sentence/time |
| `generate_transcript` | C | `Video.generateTranscript(force, languageCode)` / `Audio.generateTranscript` | |
| `translate_transcript` | C | `Video.translateTranscript(language, additionalNotes, callbackUrl)` | |

### indexing (default on) — owner: agent D

| Tool | Kind | SDK | Notes |
| --- | --- | --- | --- |
| `index_spoken_words` ★ | C | `Video.indexSpokenWords` | + `segmentation_type` sentence/llm, `callback_url` |
| `index_scenes` ★ | C | `Video.indexVisuals` | + `model_name`, `callback_url` |
| `list_scene_indexes` ★ / `get_scene_index` / `delete_scene_index` | R / R / D | `Video.listSceneIndex/getSceneIndex/deleteSceneIndex` | get = per-scene records |
| `understand_video` | C | `Video.understand(analyzers, options)` | analyzers `[{type, name?, ...config}]`; types documented in description (speech_transcription, vlm, ocr, object_detection, brand_detection, activity_recognition, location_detection); `segmentation`, `callback_url` |
| `get_understanding` / `list_understandings` / `delete_understanding` | R / R / D | `Video.getUnderstanding/listUnderstandings/deleteUnderstanding` | |
| `get_analyzer_output` | R | `Understanding.getAnalyzerOutput(nameOrId)` | raw records; cap output size (first N + `truncated`) |
| `create_index` | C | `Video.index(source, {name, useFor, fields})` | `source` = `{understanding_id, analyzer_id?, analyzer_name?}` resolved via `Understanding.getAnalyzer(...).toIndexSource()` |
| `get_index` / `list_indexes` / `delete_index` | R / R / D | `Video.getIndex/listIndexes/deleteIndex` | |
| `get_index_records` | R | `Index.records(limit, cursor)` | cursor pagination |

### search (default on) — owner: agent E

| Tool | Kind | SDK | Notes |
| --- | --- | --- | --- |
| `search_video` ★ / `search_collection` ★ | R | `Video.search` / `Collection.search` | v2 params only (`top_k`, `mode`, `include_clip`, `session_id`) |
| `legacy_search_video` / `legacy_search_collection` | R | `Video.legacySearch` / `Collection.legacySearch` | v1 params only; split out because the SDK throws when the two families are mixed |
| `ask_video` / `ask_collection` | R | `Video.ask` / `Collection.ask` (`{topK, mode, includeSources}`) | answer + sources shots |
| `semantic_search` | R | `Video.semanticSearch` / `Collection.semanticSearch` | `video_id` optional → collection scope; `index_names`, `index_ids`, `top_k`, `score_threshold`, `filter` |
| `query_index` | R | `Video.query` / `Collection.query` | structured filter/sort |
| `aggregate_index` | R | `Video.aggregate` / `Collection.aggregate` | `group_by`, `metric` |

### streams (default on) — owner: agent F

| Tool | Kind | SDK | Notes |
| --- | --- | --- | --- |
| `generate_clip` ★ / `compile_clips` ★ / `add_subtitles` ★ | C | `Video.generateStream` / `vhttp.post(["compile"])` / `Video.addSubtitle` | `add_subtitles`: expose full `SubtitleStyleProps` (colours, alignment enum, margins, border_style) |
| `create_highlight_clip` | C | `Video.clip(prompt, contentType, modelName)` | returns shots + compiled stream via `SearchResult.compile()` |
| `reframe_video` | C | `Video.reframe({start,end,target,mode,callbackUrl})` | target preset enum or `{width,height}` |
| `download_stream` | C | `Connection.download(streamLink, name)` | MP4 render of any stream_url |

### editor (default on) — owner: agent G

| Tool | Kind | SDK | Notes |
| --- | --- | --- | --- |
| `render_timeline` | C | `EditorTimeline` + `Track/Clip/*Asset` classes → `generateStream()` | whole spec in one call; zod mirrors B6 example in the SDK inventory (tracks → clips → asset union video/image/audio/text/caption; enums Fit/Position/Filter/CaptionAnimation…) |
| `download_timeline_render` | C | `EditorTimeline.downloadStream(streamUrl)` | |

### rtstream (default on) — owner: agent H

| Tool | Kind | SDK |
| --- | --- | --- |
| `connect_rtstream` | C | `Collection.connectRTStream(url, name, mediaTypes, sampleRate, store, enableTranscript)` |
| `list_rtstreams` / `get_rtstream` | R | `Collection.listRTStreams` / `getRTStream` |
| `set_rtstream_status` | U | `RTStream.start/stop` (`action` enum) |
| `get_rtstream_stream` | R | `RTStream.generateStream(start, end)` → player URL |
| `export_rtstream_recording` | C | `RTStream.export(name)` |
| `get_rtstream_transcript` / `set_rtstream_transcript_status` | R / U | `RTStream.getTranscript` / `startTranscript`,`stopTranscript` |
| `index_rtstream_scenes` / `index_rtstream_audio` | C | `RTStream.indexVisuals` / `indexAudio` |
| `list_rtstream_scene_indexes` / `get_rtstream_scenes` / `set_rtstream_scene_index_status` | R / R / U | `listSceneIndexes` / `RTStreamSceneIndex.getScenes` / `start,stop` |
| `search_rtstream` | R | `RTStream.search` |
| `create_event` / `list_events` | C / R | `Connection.createEvent` / `listEvents` |
| `create_rtstream_alert` / `list_rtstream_alerts` / `set_rtstream_alert_status` | C / R / U | `RTStreamSceneIndex.createAlert/listAlerts/enableAlert,disableAlert` |
| `understand_rtstream` / `list_rtstream_understandings` / `get_rtstream_understanding_records` | C / R / R | `RTStream.understand` / `listUnderstanding` / `RTStreamUnderstanding.getRecords` |
| `create_rtstream_index` / `list_rtstream_indexes` / `get_rtstream_index_records` | C / R / R | `RTStream.index` / `listIndexes` / `RTStreamIndex.getRecords` |

### meetings (default on) — owner: agent I

| Tool | Kind | SDK |
| --- | --- | --- |
| `record_meeting` | C | `Collection.recordMeeting({meetingUrl, botName, meetingTitle, callbackUrl, timeZone})` |
| `get_meeting` | R | `Collection.getMeeting` |

## Agent contract (Phase 1)

Each agent owns exactly three paths and touches nothing else:

- `lib/toolsets/<name>.ts` — implement every tool in your table; export the `Toolset` const already stubbed.
- `test/<name>.test.ts` — one test per tool via `test/harness.ts`.
- `docs/toolsets/<name>.md` — ≤ 40 lines: tool table + any deviation from this catalog and why.

Done means `npm run typecheck && npm test && npm run tools:list` all pass on your branch.

## Upstream defects (VideoDB API / SDK)

Found by live testing against the dev API. These belong to VideoDB's server or the `videodb` Node SDK, not to this connector; no workaround is implemented here.

| Tool affected | Defect | Evidence |
| --- | --- | --- |
| `list_rtstreams` | `name` filter crashes the server for any value | HTTP 500 `'NoneType' object has no attribute 'lower'` — likely a stream row with a NULL name |
| `delete_image` | Destructive op reports a false failure on thumbnail-derived records | HTTP 500 returned, but the image record is actually deleted |
| `search_youtube` | `result_threshold` ignored | `Connection.youtubeSearch` always returns 10 results |
| `set_rtstream_scene_index_status` | Echoes a status that may not be real | SDK hardcodes `status = 'connected'` after the scene-index status PATCH instead of reading the response |
| `create_rtstream_alert` | Accepts a nonexistent `index_id` and creates an undeletable alert | Alert is created against a bogus index; there is no delete-alert endpoint |
| `search_videos_by_title`, `list_thumbnails`, `list_invoices` | `fromSnakeToCamel` converted top-level arrays into objects | Fixed upstream on `fix/snake-to-camel-array` in `videodb-node-main`, unreleased; this connector still runs the published 0.3.1 until that ships |

## Coverage gaps

Paths that live testing could not exercise, so they are unverified rather than known-good:

- rtstream v2 understand → index **write** path (`understand_rtstream`, `create_rtstream_index`): the test account has zero v2 understandings/indexes and both tools 404 on the handler's pre-flight, so their request bodies have never reached VideoDB.
- rtstream transcripts (`get_rtstream_transcript`): no transcript data exists anywhere in the account.
- `get_transcode_status`: no transcode job reached a terminal state during testing.
