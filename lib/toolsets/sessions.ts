import type { Toolset } from "@/lib/mcp/registry";

/** Meeting recorder bots + desktop capture sessions (server-side view only). */
export const sessions: Toolset = {
  name: "sessions",
  description: "Meeting recording bots and desktop capture sessions.",
  defaultEnabled: false,
  tools: [],
};
