# collections toolset

Default on. Collections CRUD + account billing. Code in `lib/toolsets/collections.ts`, tests in `test/collections.test.ts`.

| Tool | Kind | SDK | Wire |
| --- | --- | --- | --- |
| `list_collections` ★ | read | `Connection.getCollections` | GET collection |
| `get_collection` | read | `Connection.getCollection(id)` | GET collection/{id} |
| `create_collection` ★ | create | `Connection.createCollection(name, description, isPublic)` | POST collection |
| `update_collection` | update | `Connection.updateCollection` + `Collection.makePublic/makePrivate` | PATCH collection/{id} (one call per concern) |
| `delete_collection` | destructive | `Collection.delete` | DELETE collection/{id} |
| `get_account_usage` | read | `Connection.checkUsage` | GET billing/usage |
| `list_invoices` | read | `Connection.getInvoices` | GET billing/invoices |

Collection objects are trimmed with a local `COLLECTION_KEYS = [id, name, description, is_public]` (Collection instances expose every SDK method as an enumerable prop).

## Deviations from the catalog

| Where | What | Why |
| --- | --- | --- |
| `list_collections` ★ | Output `pick`ed to 4 keys, gains `is_public` | Previously returned raw Collection instances; inputs unchanged |
| `create_collection` ★ | Output `pick`ed to 4 keys | Same; inputs unchanged |
| `update_collection` | At least one of `name`/`description`/`is_public` required (zod refine); when only one of name/description is given, the other is read via `getCollection` first | SDK PATCH sends both fields, so an omitted one would be blanked |
| `update_collection` | Visibility is a separate PATCH; result overlays the requested `is_public` | `makePublic/makePrivate` return void, and the rename PATCH response predates the visibility change |
| `delete_collection` | `collection_id` is required (no `"default"` fallback); literal `"default"` refused before any wire call | A defaulted ID would make an argument-less call destructive; catalog says refuse `default` |
| `list_invoices` | Returns `{invoices: [...first 200], truncated?, total?}` instead of a bare array | Unbounded record list cap per the toolset rules |

## Kernel requests

None.

## Open

- `delete_collection` refuses the literal id `"default"`, but not the default collection's real `c-…` id — that path reaches the API. Whether VideoDB itself rejects deleting an account's default collection is unverified; confirm against the live API and tighten the guard if it does not.
