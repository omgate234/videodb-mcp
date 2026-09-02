# indexing toolset

Default on. v1 spoken/scene indexes + v2 understand → index pipeline. Code in `lib/toolsets/indexing.ts`, tests in `test/indexing.test.ts`.

| Tool | Kind | SDK | Wire |
| --- | --- | --- | --- |
| `index_spoken_words` ★ | create | `Video.indexSpokenWords(lang, segmentationType, force, callbackUrl)` | POST video/{id}/index |
| `index_scenes` ★ | create | `Video.indexVisuals({prompt, batchConfig, modelName, name, callbackUrl})` | POST video/{id}/index/scene |
| `list_scene_indexes` ★ | read | `Video.listSceneIndex` | GET video/{id}/index/scene |
| `get_scene_index` | read | `Video.getSceneIndex(id)` | GET video/{id}/index/scene/{sid} |
| `delete_scene_index` | destructive | `Video.deleteSceneIndex(id)` | DELETE video/{id}/index/scene/{sid} |
| `understand_video` | create | `Video.understand(analyzers, {segmentation, callbackUrl})` | POST video/{id}/understand |
| `get_understanding` | read | `Video.getUnderstanding(id)` | GET video/{id}/understand/{uid} |
| `list_understandings` | read | `Video.listUnderstandings` | GET video/{id}/understand |
| `delete_understanding` | destructive | `Video.deleteUnderstanding(id)` | DELETE video/{id}/understand/{uid} |
| `get_analyzer_output` | read | `Understanding.getAnalyzerOutput(nameOrId)` | GET video/{id}/understand/{uid}/analyzers/{a}/output (raw) |
| `create_index` | create | `Video.getUnderstanding` → `Understanding.getAnalyzer(...)` → `Video.index(analyzer, {name, useFor, fields, callbackUrl})` | POST video/{id}/indexes (raw) |
| `get_index` | read | `Video.getIndex({indexId} \| {name})` | GET video/{id}/indexes[/{iid}]?collection_id (raw) |
| `list_indexes` | read | `Video.listIndexes(useFor?)` | GET video/{id}/indexes?collection_id[&use_for] (raw) |
| `delete_index` | destructive | `Video.deleteIndex(id)` | DELETE video/{id}/indexes/{iid}?collection_id |
| `get_index_records` | read | `Index.records(limit, cursor)` | GET video/{id}/indexes/{iid}/records (raw) |

Output shapes: understanding runs flatten via a local `understandingToPlain` → `{id, video_id, status, analyzers[{id,name,type,status}]}` (analyzers carry a back-reference to their run). Index manifests `pick` to `index_id, name, status, error, use_for, record_count, fields, field_schema`; records to `video_id, understanding_id, scene_id, start, end, data`. `callback_url` on any create tool → `{accepted: true, ...ids}` after the POST.

## Deviations from the catalog

| Where | What | Why |
| --- | --- | --- |
| `index_spoken_words` ★ / `index_scenes` ★ | Inputs only extended (`segmentation_type`, `callback_url` / `model_name`, `callback_url`); outputs unchanged unless `callback_url` given | Backward compatibility |
| `get_analyzer_output`, `create_index` | Analyzer addressed by `analyzer_name` **or** `analyzer_id` (one required, checked in the handler) instead of a `source` object | Flat inputs; the SDK resolves either through `getAnalyzer(nameOrId)` |
| `get_analyzer_output` | Builds an `Understanding` shell from ids (no GET /video, no GET /understand) | Output path needs only ids; saves two round-trips |
| `get_analyzer_output` | Any top-level list in the raw output capped at 200 items with `<key>_total` + `truncated: true` | Output shape is analyzer-specific (`scenes`, segments…); cap applies generically |
| `get_scene_index` | Returns `{scene_index_id, video_id, scenes: [...]}` capped at 200 | Unbounded record list |
| `get_index_records` | Builds an `Index` shell from ids (no GET /video, no GET /indexes/{id}); `limit` ≤ 200; deprecated `segment_id/start_sec/end_sec` aliases dropped | Same shell idiom as `collection()`; aliases duplicate `scene_id/start/end` |
| `understand_video` | Exposes `segmentation` + `callback_url` only (no `sampling`/`transform`/`audio_chunking`); analyzer extra keys pass through untouched | Catalog scope; per-analyzer config already covers prompt/model/etc. |
| `get_index` | Errors "Index not found" when the SDK yields no manifest | SDK returns `undefined` on an empty body; the kernel would render that as `{ok: true}` |

## Kernel requests

None.
