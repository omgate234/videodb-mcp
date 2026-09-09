# Open client QA fixes — 2026-09-09

This change addresses the confirmed open client findings from the finalized QA review. Earlier uncommitted client fixes and the unrelated website changes are separate work.

| Tracking ID | Fix | Verification |
| --- | --- | --- |
| MCP-06 | Query and aggregate require exactly one nonempty index ID/name; legacy scene keyword search requires a scene index ID. Constraints appear in tool/field descriptions and run before API lookups. | Input and real MCP transport tests cover both/neither, empty values, null normalization and valid forwarding. |
| MCP-09 | `get_index_records` resolves the canonical collection ID through the accessible video, matching `list_indexes`. Missing or inconsistent collection information fails before a record read. | HTTP-boundary tests cover omitted/default/canonical collection inputs, pagination and denied/mismatched lookups. |
| SDK-02 (sibling `videodb-node-main`) | Realtime understanding reads preserve opaque output names/descriptors; `RTStream.index` serializes known reference keys to snake_case and rejects conflicts. | SDK HTTP-boundary tests cover create/get/list/refresh, custom names, legacy descriptors and error propagation. |

The SDK fix is source-only until published. This MCP commit keeps its existing dependency declaration; adopt a release containing SDK-02 before expecting deployed realtime index creation to be fixed. The MCP forwarding test accepts both old and corrected SDK casing without treating the old format as the server contract. The SDK's dedicated wire tests require the corrected format.

MCP-07 remains an investigation: no exact warning text or failing client payload establishes a schema/UI defect. MCP-08 reports invalid input shapes or an intentional tool limitation, not an open execution bug. SDK-01's array conversion is already fixed in 0.3.2. Backend Search V2, error-mapping and collection-alias behavior remain separate server work; no backend-error suppression or clip-generation workaround is introduced here.
