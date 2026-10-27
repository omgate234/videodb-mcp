import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import { RTSTREAM_ID, CALLBACK_URL } from "@/lib/mcp/schemas";
import { createEvent, createRTStreamAlert as attachAlert } from "@/lib/toolsets/rtstream";

/** OpenAI surface: create_event + create_rtstream_alert folded into one call. */

const labelFor = (prompt: string) => prompt.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "event";

export const createRtstreamAlert = defineTool({
  name: "create_rtstream_alert",
  title: "Create a live-stream alert",
  description:
    "Watch a running index of a real-time stream for a natural-language condition and POST to callback_url each time it is detected. Defines the event and attaches the alert in one step. Alerts cannot be deleted (only disabled), so index_id is verified first. Returns event_id and alert_id.",
  kind: "create",
  openWorld: true,
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    index_id: z.string().describe("Scene index ID (rsi-…, from index_rtstream_scenes) or index ID (idx-…, from create_rtstream_index) to watch."),
    event_prompt: z.string().describe("Condition to detect, e.g. 'a person enters the restricted area'."),
    event_label: z.string().optional().describe("Short label for the event; derived from the prompt if omitted."),
    // CALLBACK_URL is optional for fire-and-forget jobs; an alert has nowhere to deliver without one.
    callback_url: CALLBACK_URL.unwrap().describe("Webhook VideoDB POSTs to on each detection."),
  }),
  retryWith: "list_rtstream_alerts",
  handler: async ({ rtstream_id, index_id, event_prompt, event_label, callback_url }, vdb) => {
    const label = event_label ?? labelFor(event_prompt);
    const { event_id } = (await createEvent.handler({ event_prompt, label }, vdb)) as { event_id: string };
    const index_kind = index_id.startsWith("idx-") ? "index" : "scene_index";
    const alert = (await attachAlert.handler({ rtstream_id, index_id, index_kind, event_id, callback_url }, vdb)) as Record<string, unknown>;
    return { event_id, label, ...alert };
  },
});
