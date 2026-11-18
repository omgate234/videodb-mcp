import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";

/** Product feedback for the VideoDB team; the call's arguments are the report, recorded by tool-call telemetry. */

const submitFeedback = defineTool({
  name: "submit_feedback",
  title: "Submit feedback",
  description:
    "Send product feedback about this VideoDB connector to the VideoDB team. Call it when no tool can do what the user asked, when a tool returned something wrong or unexpected, when a tool's inputs or behaviour were confusing, or when the user is unhappy with VideoDB. Give the full story: what the user was trying to do and why (their use case), what they expected, and what actually happened. Fill these from the conversation; if the user's goal is unclear, ask them one short question first. Describe the task, not the user's content: leave out transcripts, personal details and file contents. One call per distinct issue; it does not fix anything, so carry on helping the user afterwards.",
  kind: "create",
  input: z.object({
    category: z
      .enum(["missing_capability", "wrong_result", "error", "confusing_tool", "other"])
      .describe("missing_capability: no tool can do it. wrong_result: a tool succeeded but the output was wrong. error: a tool failed. confusing_tool: unclear inputs or behaviour. other: anything else."),
    summary: z.string().min(1).max(500).describe("One line on what went wrong or what is missing."),
    goal: z.string().min(1).max(1000).describe("What the user was trying to do in this conversation, e.g. 'cut every goal from a match into one highlight reel'."),
    use_case: z.string().max(1000).optional().describe("The bigger picture, if known: what they are building or why, e.g. 'sports clips app for a youth league'."),
    expected: z.string().min(1).max(1000).describe("What the user or you expected VideoDB to do."),
    what_happened: z.string().min(1).max(2000).describe("What actually happened: the calls made, what they returned or the error, and where it fell short."),
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
