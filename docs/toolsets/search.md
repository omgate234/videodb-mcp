# search toolset

Search V2: moment search, ask, semantic search, structured query, aggregation.

| Tool | Kind | SDK | Scope |
| --- | --- | --- | --- |
| `search_video` ★ | R | `Video.search` (v2) | video |
| `search_collection` ★ | R | `Collection.search` (v2) | collection |
| `ask_video` | R | `Video.ask({topK, mode, includeSources})` | video |
| `ask_collection` | R | `Collection.ask(...)` | collection |
| `semantic_search` | R | `Video.semanticSearch` / `Collection.semanticSearch` | `video_id` optional |
| `query_index` | R | `Video.query` / `Collection.query` | `video_id` optional |
| `aggregate_index` | R | `Video.aggregate` / `Collection.aggregate` | `video_id` optional |

## Deviations from the catalog

`query_index` and `aggregate_index` require exactly one nonempty `index_id` or `index_name`. Both/neither are rejected before any API lookup. Unset optional identifiers may be omitted or `null`.

- `searchToPlain` also handles `AskResponse` → `{answer, sources}` and caps shot/aggregate row lists at 200 (`truncated: true, total`).
- Ask descriptions say "requires indexes built by create_index"; V2 retrieval reads v2 indexes only.

## Kernel requests

None.
