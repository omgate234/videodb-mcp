import { z } from "zod";
import { SandboxStatus, SandboxTier } from "videodb";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { pick } from "@/lib/videodb/serialize";

/**
 * Sandbox Compute: GPU runtimes for open-weight models, addressed by
 * `config.sandbox_id` in understand_video. Provisioning and teardown are both
 * asynchronous, so no tool here waits — the SDK's waitForReady/waitForStop
 * pollers would outlive the client's request timeout.
 */

const SANDBOX_KEYS = [
  "id",
  "tier",
  "status",
  "name",
  "models",
  "model_categories",
  "region",
  "created_at",
  "started_at",
  "stopped_at",
  "expires_at",
];

const SANDBOX_ID = z.string().describe("Sandbox ID, from create_sandbox or list_sandboxes.");
const TIER = z.enum(SandboxTier);
const STATUS = z.enum(SandboxStatus);
const CATEGORY = z.enum([
  "vlm",
  "object_detection",
  "speech_to_text",
  "text_to_speech",
  "image_generation",
  "audio_generation",
  "text_generation",
]);

const POLL = "Poll get_sandbox until status is \"active\"; it is not usable before then.";

const createSandbox = defineTool({
  name: "create_sandbox",
  title: "Create sandbox",
  description: `Start a GPU sandbox: VideoDB's managed runtime for open-weight models. Hosted models need none of this — a sandbox is required only when a workflow names a model from the catalog below, and is then passed as \`config.sandbox_id\` to understand_video.

Returns as soon as the sandbox is registered, with status "provisioning". Poll get_sandbox until status is "active" before submitting any job to it — a job sent to a provisioning sandbox fails.

## Model catalog

| Model | Use case | Minimum tier |
| --- | --- | --- |
| google/gemma-4-E2B-it | text generation | small |
| Qwen/Qwen3-4B | text generation | small |
| Qwen/Qwen3.5-9B | text and vision | small |
| openai/whisper-large-v3-turbo | speech to text | small |
| k2-fsa/OmniVoice | text to speech | small |
| stabilityai/stable-audio-open-1.0 | audio generation | small |
| rtdetr-v2-r50vd | object detection | small |
| google/gemma-4-26B-A4B-it | text and vision | medium |
| Qwen/Qwen3.5-27B | text and vision | medium |
| black-forest-labs/FLUX.1-dev | image generation | medium |
| google/gemma-4-31B-it | text and vision | medium |

Pick the smallest tier that supports the largest model you need; one medium sandbox can serve both. Name exact models with \`models\`, or prepare a whole class with \`model_categories\` (vlm, object_detection, speech_to_text, text_to_speech, image_generation, audio_generation, text_generation).

## Cost

Billing is runtime-based, recorded when the sandbox stops and measured from started_at to stopped_at: small $1/hour, medium $3.50/hour. A sandbox keeps billing until stop_sandbox runs, so reuse one across a workflow and stop it when the work is done. Limits: 5 concurrent small or 3 medium, 24 hours maximum runtime each.`,
  kind: "create",
  openWorld: true,
  input: z.object({
    tier: TIER.default("small").describe("Compute tier. small covers object detection and the lighter VLMs; medium is needed for FLUX and the larger VLMs."),
    name: z.string().optional().describe("Human-readable name; VideoDB generates one if omitted."),
    models: z
      .array(z.string().min(1))
      .optional()
      .describe('Exact model names to prepare, e.g. ["rtdetr-v2-r50vd"]. Use these when the workflow is known.'),
    model_categories: z
      .array(CATEGORY)
      .optional()
      .describe('Model classes to prepare instead of exact names, e.g. ["vlm","object_detection"].'),
    callback_url: z.string().url().optional().describe("Webhook VideoDB calls on provisioning events."),
  }),
  retryWith: "get_sandbox",
  handler: async ({ tier, name, models, model_categories, callback_url }, vdb) => {
    const sandbox = await vdb.createSandbox(tier, name, callback_url, model_categories, models);
    return { ...pick(sandbox, SANDBOX_KEYS), poll_with: "get_sandbox", message: POLL };
  },
});

const getSandbox = defineTool({
  name: "get_sandbox",
  title: "Get sandbox",
  description:
    'Get one sandbox: its status, tier, prepared models and lifetime. Statuses are provisioning (starting, not usable yet), active (ready for jobs), alert (usable but degraded), stopping, stopped and failed. Both stopped and failed are terminal — a sandbox cannot be restarted, so create a new one.',
  kind: "read",
  input: z.object({ sandbox_id: SANDBOX_ID }),
  handler: async ({ sandbox_id }, vdb) => pick(await vdb.getSandbox(sandbox_id), SANDBOX_KEYS),
});

const listSandboxes = defineTool({
  name: "list_sandboxes",
  title: "List sandboxes",
  description:
    'List the account\'s sandboxes with their status, tier and prepared models. Filter with status="active" to find a running sandbox to reuse before creating (and paying for) another one.',
  kind: "read",
  input: z.object({
    status: STATUS.optional().describe("Only return sandboxes in this state. Omitted = every state."),
    page: z.number().int().min(1).default(1).describe("Page number (1-based)."),
    page_size: z.number().int().min(1).max(100).default(20).describe("Sandboxes per page, max 100."),
  }),
  handler: async ({ status, page, page_size }, vdb) => {
    const sandboxes = await vdb.listSandboxes(status, page, page_size);
    return { sandboxes: sandboxes.map((s) => pick(s, SANDBOX_KEYS)) };
  },
});

const stopSandbox = defineTool({
  name: "stop_sandbox",
  title: "Stop sandbox",
  description:
    "Stop a sandbox and end its billing. This is permanent — a stopped sandbox cannot be restarted, and any job still routed to it fails; create a new sandbox to run more work. Returns while the status is still \"stopping\"; poll get_sandbox for \"stopped\". Leave grace true to let running jobs finish first.",
  kind: "destructive",
  input: z.object({
    sandbox_id: SANDBOX_ID,
    grace: z.boolean().default(true).describe("Wait for in-flight jobs to finish before teardown. false kills them immediately."),
  }),
  retryWith: "get_sandbox",
  handler: async ({ sandbox_id, grace }, vdb) => {
    const sandbox = await vdb.getSandbox(sandbox_id);
    await sandbox.stop(grace);
    // Sandbox.stop() reads the new state from res.data.data, but the API answers
    // {success, data}; the instance keeps its pre-stop status, so re-read it.
    await sandbox.refresh();
    return { ...pick(sandbox, SANDBOX_KEYS), poll_with: "get_sandbox" };
  },
});

export const sandbox: Toolset = {
  name: "sandbox",
  description: "Sandbox Compute: GPU runtimes for open-weight models referenced by config.sandbox_id.",
  defaultEnabled: true,
  tools: [createSandbox, getSandbox, listSandboxes, stopSandbox],
};
