import { mcpRoute } from "@/lib/mcp/handler";
import { registerTools } from "@/lib/mcp/registry";
import { OPENAI_PROFILE } from "@/lib/mcp/profiles";
import { OPENAI_INSTRUCTIONS } from "@/lib/mcp/instructions";

/**
 * Compact profile for the ChatGPT plugin. Plugin-installed MCP servers get a
 * tool-spec byte budget (8 KB/tool, 64 KB total, shared across plugins); tools
 * past it are silently hidden. scripts/tool-sizes.ts guards the budget.
 */
export const maxDuration = 300;

const handler = mcpRoute("/openai-mcp", OPENAI_INSTRUCTIONS, (server) => registerTools(server, OPENAI_PROFILE, "openai"));

export { handler as GET, handler as POST };
