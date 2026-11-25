import { mcpRoute } from "@/lib/mcp/handler";
import { registerTools } from "@/lib/mcp/registry";
import { ROBOT_INSTRUCTIONS } from "@/lib/mcp/instructions";
import { director } from "@/lib/toolsets/director";

// Standalone dataset MCP, using the same OAuth authentication as /mcp.
export const maxDuration = 300;

const handler = mcpRoute("/mcp/robot", ROBOT_INSTRUCTIONS, (server) =>
  registerTools(server, director.tools, "robot"));

export { handler as GET, handler as POST };
