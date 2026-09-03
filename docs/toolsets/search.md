# search toolset

Legacy (v1) moment search plus Search V2: ask, semantic search, structured query, aggregation.

| Tool | Kind | SDK | Scope |
| --- | --- | --- | --- |
| `search_video` ★ | R | `Video.search` (v2) | video |
| `search_collection` ★ | R | `Collection.search` (v2) | collection |
| `legacy_search_video` | R | `Video.legacySearch` | video |
| `legacy_search_collection` | R | `Collection.legacySearch` | collection |
| `ask_video` | R | `Video.ask({topK, mode, includeSources})` | video |
| `ask_collection` | R | `Collection.ask(...)` | collection |
| `semantic_search` | R | `Video.semanticSearch` / `Collection.semanticSearch` | `video_id` optional |
| `query_index` | R | `Video.query` / `Collection.query` | `video_id` optional |
| `aggregate_index` | R | `Video.aggregate` / `Collection.aggregate` | `video_id` optional |

## v2 / legacy split

The two parameter families are mutually exclusive — the SDK throws `Cannot mix legacy search params with new search params` when both are present — so they are separate tools rather than one schema the model routes by hand.

| Tool | Params | Wire |
| --- | --- | --- |
| `search_video` / `search_collection` | `top_k`, `mode`, `include_clip`, `session_id` | `POST …/search/v2` |
| `legacy_search_video` | `search_type`, `index_type`, `result_threshold`, `scene_index_id` | `POST …/search` |
| `legacy_search_collection` | `index_type`, `result_threshold` | `POST …/search` |

Legacy defaults (`semantic`, `spoken_word`, 5) are zod `.default()`s on the legacy tools, so they show in the schema instead of being injected in the handler. The handlers call `legacySearch` directly rather than relying on `search()`'s dispatcher.

## Deviations from the catalog

- Brief asked for legacy params with no defaults at all. The legacy tools keep the v1 defaults (`semantic`, `spoken_word`, 5); `test/seed.test.ts` (not owned by this toolset) pins query-only `legacy_search_video` to that body.
- `legacy_search_collection` exposes `index_type` + `result_threshold`, not `search_type`/`scene_index_id`: `Collection.legacySearch` rejects keyword search and silently drops `scene_index_id` for non-rtstream namespaces.
- `searchToPlain` also handles `AskResponse` → `{answer, sources}` and caps shot/aggregate row lists at 200 (`truncated: true, total`).
- Ask descriptions say "requires indexes built by create_index"; V2 retrieval reads v2 indexes, not the legacy spoken/scene indexes.

## Kernel requests

None.
