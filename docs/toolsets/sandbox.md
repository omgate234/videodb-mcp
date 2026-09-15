# sandbox toolset

Sandbox Compute: GPU runtimes for open-weight models. Default on. `lib/toolsets/sandbox.ts`, tests `test/sandbox.test.ts`.

A sandbox exists only to be named by `config.sandbox_id` in `understand_video` — hosted model tiers (`mini`, `basic`, `pro`, `ultra`, `default`) never need one. Before this toolset the connector told the model to obtain a `sandbox_id` it had no way to obtain, which made `object_detection` unreachable through MCP.

| Tool | Kind | SDK | Wire |
| --- | --- | --- | --- |
| `create_sandbox` | create | `Connection.createSandbox(tier, name, callbackUrl, modelCategories, models)` | POST `sandbox` |
| `get_sandbox` | read | `Connection.getSandbox(id)` | GET `sandbox/{id}` |
| `list_sandboxes` | read | `Connection.listSandboxes(status, page, pageSize)` | GET `sandbox?status&page&page_size` |
| `stop_sandbox` | destructive | `Sandbox.stop(grace)` + `Sandbox.refresh()` | POST `sandbox/{id}/stop`, then GET `sandbox/{id}` |

Records `pick` to `id, tier, status, name, models, model_categories, region, created_at, started_at, stopped_at, expires_at`.

## Lifecycle

`create_sandbox` → status `provisioning` → poll `get_sandbox` → `active` (or `alert`: usable, degraded) → submit jobs → `stop_sandbox` → `stopping` → `stopped`.

`stopped` and `failed` are terminal and there is no restart, which is why `stop_sandbox` is `destructive` rather than an `update` like `set_rtstream_status`: the resource is gone and in-flight jobs routed to it fail. Billing is runtime-based (small $1/h, medium $3.50/h, measured `started_at` → `stopped_at`), so an abandoned sandbox keeps charging for up to its 24-hour cap.

## Deviations

| Item | Why |
| --- | --- |
| No tool wraps `waitForReady` / `waitForStop` | They poll for 300 s / 120 s. Same reason the long write tools became jobs: the client abandons the call at ~60 s. The model polls `get_sandbox` instead, and every tool that starts a transition carries `poll_with: "get_sandbox"` |
| `models` is `string[]`, not the SDK's `SandboxModel` enum | The enum omits catalog entries — `rtdetr-v2-r50vd` and `Qwen/Qwen3-4B` are documented models with no enum member — and the docs allow team-issued aliases. The server canonicalises names and rejects bad ones. The catalog with minimum tiers is in the tool description instead |
| `tier` / `status` come from the SDK's `SandboxTier` / `SandboxStatus` | These are closed sets the SDK owns; `z.enum()` over the exported objects drifts loudly if a release changes them |
| `model_categories` is a local enum | The seven category names are documented but not exported by the SDK |
| `stop_sandbox` re-reads after stopping | `Sandbox.stop()` applies `res.data?.data`, but the API answers `{success, data}` — so `res.data` *is* the record and `res.data.data` is `undefined`. The instance keeps its pre-stop status and the tool would report `active` on a sandbox it just stopped. The extra GET is the fix; see SDK issues |

## Kernel requests

None.
