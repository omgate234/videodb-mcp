import { TOOLSETS, allTools } from "@/lib/mcp/registry";
import { SITE } from "../site";

export const dynamic = "force-static";

/** Plain-text summary for LLM crawlers (llmstxt.org). Counts come from the registry so they never drift. */
export function GET() {
  const total = allTools().length;
  const body = `# VideoDB MCP Server

> Hosted remote MCP (Model Context Protocol) server that connects Claude, Claude Code, Cursor and any MCP client to a VideoDB account: upload media from URLs, transcribe and index video, search moments by meaning, cut clips and highlight reels, render timelines, watch live RTSP/RTMP/HLS streams, and record meetings.

- Endpoint: ${SITE.endpoint}
- Transport: Streamable HTTP
- Auth: OAuth 2.1 with Dynamic Client Registration; the user signs in to their VideoDB account once
- Tools: ${total} across ${TOOLSETS.length} toolsets (${TOOLSETS.map((t) => t.name).join(", ")})
- Account: free at ${SITE.links.console} (no credit card)

## Connect

- Claude: Settings → Connectors → Add custom connector → paste ${SITE.endpoint}
- Claude Code: \`claude mcp add --transport http videodb ${SITE.endpoint}\`
- Cursor: add \`{"mcpServers":{"videodb":{"url":"${SITE.endpoint}"}}}\`
- Any client: add as a remote Streamable HTTP server with the same URL

## Toolsets

${TOOLSETS.map((t) => `- ${t.name} (${t.tools.length}): ${t.tools.map((x) => x.name).join(", ")}`).join("\n")}

## Docs

- [MCP Server overview](${SITE.links.docs})
- [Connect the MCP Server](${SITE.links.docsConnect})
- [Tool reference](${SITE.links.docsTools})
- [Workflows](${SITE.links.docsWorkflows})
- [Auth and privacy](${SITE.links.docsPrivacy})
- [VideoDB documentation](${SITE.links.docsHome})

## Policies

- Privacy: ${SITE.links.privacy}
- Terms: ${SITE.links.terms}
- Support: hello@videodb.io
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
