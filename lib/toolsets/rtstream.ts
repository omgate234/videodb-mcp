import type { Toolset } from "@/lib/mcp/registry";

/** Real-time streams: connect, index, alerts, transcripts, search, export. */
export const rtstream: Toolset = {
  name: "rtstream",
  description: "Real-time streams (RTSP/live): connect, index live, alerts, search, export.",
  defaultEnabled: false,
  tools: [],
};
