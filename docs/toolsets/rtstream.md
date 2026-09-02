# rtstream toolset (default off)

Real-time streams on the `videodb` SDK. File: `lib/toolsets/rtstream.ts`, tests: `test/rtstream.test.ts`. All timestamps are Unix seconds.

| Tool | Kind | SDK call | Wire |
| --- | --- | --- | --- |
| `connect_rtstream` | create | `Collection.connectRTStream(url, name, mediaTypes, sampleRate, store, enableTranscript)` | POST `rtstream` |
| `list_rtstreams` / `get_rtstream` | read | `Collection.listRTStreams({limit, offset, status, name, ordering})` / `getRTStream(id)` | GET `rtstream` / `rtstream/{id}` |
| `set_rtstream_status` | update | `RTStream.start/stop` | PATCH `rtstream/{id}/status` |
| `get_rtstream_stream` | read | `RTStream.generateStream(start, end)` | GET `rtstream/{id}/stream` |
| `export_rtstream_recording` | create | `RTStream.export(name)` | POST `rtstream/{id}/export` |
| `get_rtstream_transcript` / `set_rtstream_transcript_status` | read / update | `RTStream.getTranscript({…})` / `startTranscript`, `stopTranscript(mode, engine)` | GET / POST `rtstream/{id}/transcription` |
| `index_rtstream_scenes` / `index_rtstream_audio` | create | `RTStream.indexVisuals({batchConfig:{type:time}, …})` / `indexAudio({batchConfig:{type:segmenter}, …})` | POST `rtstream/{id}/index/scene` |
| `list_rtstream_scene_indexes` | read | `RTStream.listSceneIndexes()` | GET `rtstream/{id}/index/scene` |
| `get_rtstream_scenes` / `set_rtstream_scene_index_status` | read / update | `RTStreamSceneIndex.getScenes(start, end, page, pageSize)` / `start`, `stop` | GET `rtstream/{id}/index/scene/{iid}` / PATCH `…/status` |
| `search_rtstream` | read | `RTStream.search({query, indexType, indexId, resultThreshold, scoreThreshold})` | POST `rtstream/{id}/search` |
| `create_event` / `list_events` | create / read | `Connection.createEvent(prompt, label)` / `listEvents()` | POST / GET `rtstream/event` |
| `create_rtstream_alert` / `list_rtstream_alerts` / `set_rtstream_alert_status` | create / read / update | `RTStreamSceneIndex` or `RTStreamIndex` `.createAlert(eventId, callbackUrl)` / `listAlerts` / `enableAlert`, `disableAlert` | `rtstream/{id}/index/{iid}/alert[/{aid}/status]` or `…/indexes/{iid}/alert…` |
| `understand_rtstream` / `list_rtstream_understandings` | create / read | `RTStream.understand({segmentation, analyzers:[vlm], store})` / `listUnderstanding()` | POST / GET `rtstream/{id}/understand` |
| `set_rtstream_understanding_status` / `get_rtstream_understanding_records` | update / read | `RTStreamUnderstanding.start`, `stop` / `getRecords(start, end, output, page, pageSize)` | PATCH `…/understand/{uid}/status` / GET `…/understand/{uid}/records` |
| `create_rtstream_index` | create | `RTStream.getUnderstanding(uid).outputs[output]` → `RTStream.index({source, name, useFor})` | GET `…/understand/{uid}`, POST `rtstream/{id}/indexes` |
| `list_rtstream_indexes` | read | `RTStream.listIndexes()` | GET `rtstream/{id}/indexes` |
| `set_rtstream_index_status` / `get_rtstream_index_records` | update / read | `RTStreamIndex.start`, `stop` / `getRecords(start, end, page, pageSize)` | PATCH `…/indexes/{iid}/status` / GET `…/indexes/{iid}/records` |

## Notes

- `collection_id` only on `connect_rtstream` / `list_rtstreams`: `GET rtstream/{id}` ignores the collection, so per-stream tools take just `rtstream_id` and hydrate via `collection(vdb, "default").getRTStream(id)`.
- Scene-index, understanding and index handles are id-only shells (same idiom as `collection()`), so record/status/alert tools make exactly one wire call.
- `index_rtstream_scenes` / `index_rtstream_audio` send no `extraction_config` when `window_seconds` / `segmenter+segment_value` are omitted (server default).
- `understand_rtstream` exposes the one supported shape (single `vlm` analyzer, `{type: time, window: "<n>s"}`) as flat fields `prompt`, `window_seconds`, `frame_count`, `output_name`, `store`.
- `create_rtstream_index` does one extra GET of the understanding to resolve the output descriptor; an unknown `output` is a clear error listing the available ones.
- Search shots carry no per-shot stream URL (one GET each); `get_rtstream_stream` with the shot's `start`/`end` plays it.

## Deviations from the catalog

- Added `set_rtstream_understanding_status` and `set_rtstream_index_status`: v2 objects have their own start/stop lifecycle; without them a created understanding/index could never be paused.
- Alert tools take `index_id` + `index_kind` (`scene_index` default | `index`) instead of `scene_index_id`: the released v2 flow attaches alerts to `RTStreamIndex`, and the SDK exposes both paths with identical signatures.
