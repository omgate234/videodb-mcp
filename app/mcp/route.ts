import { mcpRoute } from "@/lib/mcp/handler";
import { registerAll } from "@/lib/mcp/registry";
import { INSTRUCTIONS } from "@/lib/mcp/instructions";

/**
 * VideoDB MCP endpoint (Streamable HTTP). Tools live in lib/toolsets/*, one
 * file per SDK domain; exposure is chosen with VIDEODB_MCP_TOOLSETS.
 */

// Allow long-running VideoDB jobs (upload/index/compile) to finish.
// Requires Fluid compute on Vercel (default on new projects); Pro plans can raise to 800.
export const maxDuration = 300;

const handler = mcpRoute("/mcp", INSTRUCTIONS, (server) => registerAll(server));

export { handler as GET, handler as POST };
