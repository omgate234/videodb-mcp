import { withMcpAuth } from "mcp-handler";
import { verifyToken } from "@/lib/mcp/handler";

/**
 * YouTube channel insights. Signs the user in here, then relays MCP traffic to
 * the creators service, which verifies the same bearer at /oauth/introspect.
 */
export const maxDuration = 300;

const FORWARDED = ["authorization", "content-type", "accept", "mcp-protocol-version", "mcp-session-id", "last-event-id"];

async function relay(req: Request): Promise<Response> {
  const upstream = process.env.YOUTUBE_MCP_UPSTREAM?.trim();
  if (!upstream) return Response.json({ error: "youtube-mcp is not configured on this deployment." }, { status: 503 });

  const headers = new Headers();
  for (const h of FORWARDED) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const res = await fetch(upstream, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
    signal: AbortSignal.timeout(maxDuration * 1000),
  });

  const out = new Headers();
  for (const h of ["content-type", "mcp-session-id", "mcp-protocol-version", "cache-control"]) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(res.body, { status: res.status, headers: out });
}

const handler = withMcpAuth(relay, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/youtube-mcp",
});

export { handler as GET, handler as POST, handler as DELETE };
