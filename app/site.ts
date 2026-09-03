/** Public identity of the hosted server. One place for every URL the landing page, metadata and structured data reference. */
export const SITE = {
  origin: "https://mcp.videodb.io",
  endpoint: "https://mcp.videodb.io/mcp",
  name: "VideoDB MCP Server",
  title: "VideoDB MCP Server — Search, edit and stream video from Claude and any MCP client",
  description:
    "The hosted VideoDB MCP server connects Claude, Claude Code, Cursor and any MCP client to your video library. Upload from URLs, transcribe and index video, search moments by meaning, cut clips and highlight reels, and get streamable links — from a conversation. OAuth sign-in, no install.",
  links: {
    videodb: "https://videodb.io",
    console: "https://console.videodb.io",
    signup:
      "https://console.videodb.io/auth?utm_source=mcp_videodb_io&utm_medium=landing&utm_campaign=console_auth&utm_content=mcp_landing",
    docs: "https://docs.videodb.io/pages/mcp/index",
    docsConnect: "https://docs.videodb.io/pages/mcp/connect",
    docsTools: "https://docs.videodb.io/pages/mcp/tools",
    docsWorkflows: "https://docs.videodb.io/pages/mcp/workflows",
    docsPrivacy: "https://docs.videodb.io/pages/mcp/auth-and-privacy",
    docsLocal: "https://docs.videodb.io/pages/mcp/local-server",
    docsHome: "https://docs.videodb.io",
    privacy: "https://videodb.io/legal/privacy",
    terms: "https://videodb.io/legal/terms",
    discord: "https://discord.com/invite/py9P639jGz",
    email: "mailto:hello@videodb.io",
    mcpSpec: "https://modelcontextprotocol.io",
  },
} as const;
