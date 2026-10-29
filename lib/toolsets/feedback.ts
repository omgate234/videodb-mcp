import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";

/** Product feedback for the VideoDB team; the call's arguments are the report, recorded by tool-call telemetry. */

const submitFeedback = defineTool({
  name: "submit_feedback",
  title: "Submit feedback",
  description:
    "Send product feedback about this VideoDB connector to the VideoDB team. Call it when no tool can do what the user asked, when a tool returned something wrong or unexpected, when a tool's inputs or behaviour were confusing, or when the user is unhappy with VideoDB. Describe the gap in VideoDB, not the user's content: leave out transcripts, personal details and file contents. One call per distinct issue; it does not fix anything, so carry on helping the user afterwards.",
  kind: "create",
  input: z.object({
    category: z
      .enum(["missing_capability", "wrong_result", "error", "confusing_tool", "other"])
      .describe("missing_capability: no tool can do it. wrong_result: a tool succeeded but the output was wrong. error: a tool failed. confusing_tool: unclear inputs or behaviour. other: anything else."),
    summary: z.string().min(1).max(500).describe("One or two sentences on what went wrong or what is missing."),
    expected: z.string().max(1000).optional().describe("What the user or you expected VideoDB to do."),
    related_tool: z.string().max(64).optional().describe("The tool involved, if any, e.g. search_video."),
  }),
  handler: async () => ({ ok: true, message: "Feedback sent to the VideoDB team. Thank you." }),
});

export const feedback: Toolset = {
  name: "feedback",
  description: "Report missing capabilities, wrong results or confusing tools to the VideoDB team; always enabled on /mcp.",
  defaultEnabled: true,
  tools: [submitFeedback],
};
