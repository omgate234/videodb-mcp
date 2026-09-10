# indexing toolset

Default on. Manage existing legacy scene indexes and create new indexes with the v2 understand → index pipeline. Code in `lib/toolsets/indexing.ts`, tests in `test/indexing.test.ts`.

Legacy creation tools `index_spoken_words` and `index_scenes` have been removed from MCP. Use `understand_video` followed by `create_index` for new searchable content. Existing legacy search and scene-index management tools remain available.

| Tool | Kind | SDK | Wire |
| --- | --- | --- | --- |
| `list_scene_indexes` ★ | read | `Video.listSceneIndex` | GET video/{id}/index/scene |
| `get_scene_index` | read | `Video.getSceneIndex(id)` | GET video/{id}/index/scene/{sid} |
| `delete_scene_index` | destructive | `Video.deleteSceneIndex(id)` | DELETE video/{id}/index/scene/{sid} |
| `understand_video` | create | `Video.understand(analyzers, {segmentation, sampling, transform, callbackUrl})` | POST video/{id}/understand |
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
| `get_analyzer_output`, `create_index` | Analyzer addressed by `analyzer_name` **or** `analyzer_id`; whitespace is trimmed and an empty name falls back to the ID | Flat inputs; the SDK resolves either through `getAnalyzer(nameOrId)` |
| `create_index` | `fields` maps capability groups to field-name arrays, e.g. `{semantic:['description'], filter:['label']}`; names may be dotted paths (`frames.detections.label`) | Matches the server contract; `hydrate` and `return` are supported too |
| `get_analyzer_output` | Builds an `Understanding` shell from ids (no GET /video, no GET /understand) | Output path needs only ids; saves two round-trips |
| `get_analyzer_output` | Any top-level list in the raw output capped at 200 items with `<key>_total` + `truncated: true` | Output shape is analyzer-specific (`scenes`, segments…); cap applies generically |
| `get_scene_index` | Returns `{scene_index_id, video_id, scenes: [...]}` capped at 200 | Unbounded record list |
| `get_index_records` | Builds an `Index` shell from ids (no GET /video, no GET /indexes/{id}); `limit` ≤ 200; deprecated `segment_id/start_sec/end_sec` aliases dropped | Same shell idiom as `collection()`; aliases duplicate `scene_id/start/end` |
| `understand_video` | Run-level options are `segmentation`, `sampling`, `transform`, `callback_url`; analyzer specs expose `type`, `name`, `config`, `inputs`, `sampling`. Prompts belong in `config.prompt`; segmentation is one shot/time object | Matches server input structure; unknown analyzer top-level keys are rejected instead of advertised as valid |
| `get_index` | Errors "Index not found" when the SDK yields no manifest | SDK returns `undefined` on an empty body; the kernel would render that as `{ok: true}` |

## Long-form tool descriptions

`understand_video` (~3.6 kB) and `create_index` (~2.4 kB) carry markdown descriptions instead of one paragraph: analyzer/config tables, a worked JSON example, and the segmentation/sampling/field-group rules. They are the two tools whose input shape cannot be guessed from the schema alone, and `understand_video` had the highest tool-result error rate in the connector directory. Every other tool keeps a short description — descriptions ship in every `tools/list` and stay in context for the session, so this is deliberately not the house style.

Sourced from `videodb-docs/pages/understand/indexing-pipelines/` and the `videodb-cookbook/guides/indexing-v2/understanding/` notebooks. Where the two disagree the notebooks win, which is why `object_detection` is documented as requiring an active small-tier sandbox and `config.sandbox_id`: `understanding-artifacts.mdx` claims hosted object-detection models need none, the object-detection notebook creates one unconditionally.

Two shape corrections came out of that reading and are covered by `test/indexing.test.ts`:

| Field | Was | Is |
| --- | --- | --- |
| analyzer `inputs` | `Record<string, unknown>` — rejected the documented `["transcript"]` outright | `string[]` of earlier analyzer names, referenced in prompts as `{{inputs.<name>}}` |
| run-level `transform` | absent, so `z.object` stripped `{"resolution":"480p"}` and the run silently kept full resolution | `{resolution}` strict object, forwarded to the SDK |

Run-level `sampling` was added alongside `transform`, and both per-analyzer and run-level `sampling` are now a typed union (`uniform`+`frame_count` / `interval`+`every`) rather than a free record. `audio_chunking` is in the SDK signature but documented nowhere, so it stays unexposed.

## Kernel requests

Object detection requires an active compatible Open Compute sandbox, provisioned outside this connector. Select one using `analyzers[].config.sandbox_id`; hosted VLM models need no sandbox. This tool documents the prerequisite without provisioning compute.
