import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { openAccessToken, mcpResourceUrl } from "@/lib/oauth";
import { registerAll } from "@/lib/mcp/registry";
import { INSTRUCTIONS } from "@/lib/mcp/instructions";

/**
 * VideoDB MCP endpoint (Streamable HTTP). Tools live in lib/toolsets/*, one
 * file per SDK domain; exposure is chosen with VIDEODB_MCP_TOOLSETS.
 */

// Allow long-running VideoDB jobs (upload/index/compile) to finish.
// Requires Fluid compute on Vercel (default on new projects); Pro plans can raise to 800.
export const maxDuration = 300;

const handler = createMcpHandler((server) => registerAll(server), {
  serverInfo: { name: "videodb", version: "2.0.0" },
  instructions: INSTRUCTIONS,
});

/** Verify our sealed bearer tokens and expose the VideoDB API key to tools. */
const verifyToken = async (req: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined;
  const payload = openAccessToken(bearerToken);
  if (!payload) return undefined;

  // RFC 8707 audience check: the token must have been minted for this MCP URL.
  const expected = mcpResourceUrl(req);
  if (payload.aud && payload.aud !== expected) return undefined;

  return {
    token: bearerToken,
    clientId: payload.client_id,
    scopes: payload.scope ? payload.scope.split(" ") : ["videodb"],
    expiresAt: payload.exp,
    extra: { videodbApiKey: payload.key },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
});

export { authHandler as GET, authHandler as POST };
