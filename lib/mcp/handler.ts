import type { Implementation, McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { openAccessToken, acceptedMcpAudiences, type McpPath } from "@/lib/oauth";

const serverInfo: Implementation = {
  name: "videodb",
  title: "VideoDB",
  version: "2.0.0",
  description: "Edit, clip, subtitle and search your videos",
  websiteUrl: "https://videodb.io",
  icons: [{ src: "https://mcp.videodb.io/videodb-icon.png", mimeType: "image/png" }],
};

/** Verify our sealed bearer tokens and expose the VideoDB API key to tools. */
export const verifyToken = async (req: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined;
  const payload = openAccessToken(bearerToken);
  if (!payload) return undefined;

  // RFC 8707 audience check: the token must have been minted for an MCP URL on this origin.
  if (payload.aud && !acceptedMcpAudiences(req).includes(payload.aud)) return undefined;

  return {
    token: bearerToken,
    clientId: payload.client_id,
    scopes: payload.scope ? payload.scope.split(" ") : ["videodb"],
    expiresAt: payload.exp,
    extra: { videodbApiKey: payload.key, email: payload.email, userId: payload.user_id, userName: payload.user_name },
  };
};

/** One Streamable HTTP MCP endpoint; routes differ only in path, tool list and instructions. */
export function mcpRoute(path: McpPath, instructions: string, registerTools: (server: McpServer) => void) {
  const handler = createMcpHandler(registerTools, { serverInfo, instructions });
  return withMcpAuth(handler, verifyToken, {
    required: true,
    resourceMetadataPath: `/.well-known/oauth-protected-resource${path}`,
  });
}
