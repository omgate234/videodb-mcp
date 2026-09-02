import type { Toolset } from "@/lib/mcp/registry";

/** Multi-track editor timeline (SDK EditorTimeline) → rendered stream. */
export const editor: Toolset = {
  name: "editor",
  description: "Multi-track timeline editing (video/image/audio/text/caption clips).",
  defaultEnabled: true,
  tools: [],
};
