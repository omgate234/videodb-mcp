# search toolset

Legacy (v1) moment search plus Search V2: ask, semantic search, structured query, aggregation.

| Tool | Kind | SDK | Scope |
| --- | --- | --- | --- |
| `search_video` ★ | R | `Video.search` | video |
| `search_collection` ★ | R | `Collection.search` | collection |
| `ask_video` | R | `Video.ask({topK, mode, includeSources})` | video |
| `ask_collection` | R | `Collection.ask(...)` | collection |
| `semantic_search` | R | `Video.semanticSearch` / `Collection.semanticSearch` | `video_id` optional |
| `query_index` | R | `Video.query` / `Collection.query` | `video_id` optional |
| `aggregate_index` | R | `Video.aggregate` / `Collection.aggregate` | `video_id` optional |

## Routing in `search_video` / `search_collection`

| Caller passes | Route | Wire |
| --- | --- | --- |
| nothing beyond `query` | legacy with defaults (`semantic`, `spoken_word`, 5) | `POST …/search` |
| only legacy params | legacy, defaults fill the gaps | `POST …/search` |
| any v2 param (`top_k`, `mode`, `include_clip`, `session_id`) | Search V2 | `POST …/search/v2` |
| both groups | SDK throws "Cannot mix legacy search params…" — surfaced as the tool error | none |

## Deviations from the catalog

- Brief asked for legacy params with no defaults at all. Defaults are still applied, but only when no v2 param is present: `test/seed.test.ts` (not owned by this toolset) pins query-only `search_video` to the legacy body, and it keeps the ★ tools' prior behaviour. V2 is reachable with any v2 param.
- `search_collection` exposes `index_type` + `result_threshold` (existing) + v2 params, not `search_type`/`scene_index_id`: `Collection.legacySearch` rejects keyword search and silently drops `scene_index_id` for non-rtstream namespaces.
- `searchToPlain` also handles `AskResponse` → `{answer, sources}` and caps shot/aggregate row lists at 200 (`truncated: true, total`).
- Ask descriptions say "requires indexes built by create_index"; V2 retrieval reads v2 indexes, not the legacy spoken/scene indexes.

## Kernel requests

None.
