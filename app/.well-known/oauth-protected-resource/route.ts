import { publicOrigin, mcpResourceUrl, corsPreflight, CORS_HEADERS, SCOPES } from "@/lib/oauth";

/** OAuth 2.0 Protected Resource Metadata (RFC 9728) — origin-level fallback. */
export async function GET(req: Request) {
  const origin = publicOrigin(req);
  return Response.json(
    {
      resource: mcpResourceUrl(req),
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      scopes_supported: SCOPES,
      resource_name: "VideoDB MCP Server",
      resource_documentation: "https://docs.videodb.io",
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=3600" } }
  );
}

export function OPTIONS() {
  return corsPreflight();
}
