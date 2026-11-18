import { openAccessToken, externalResources, introspectionClient, publicOrigin, mcpResourceUrl, oauthError } from "@/lib/oauth";
import { safeEqual } from "@/lib/crypto";

/**
 * OAuth 2.0 Token Introspection (RFC 7662) for the services behind /youtube-mcp and
 * external MCP resource servers. Only tokens minted for those are reported active, and
 * the response carries the VideoDB API key that resource needs to act for the user.
 */
export async function POST(req: Request) {
  const client = introspectionClient();
  if (!client) return oauthError(503, "temporarily_unavailable", "Introspection is not configured on this deployment.");

  if (!authenticated(req.headers.get("authorization"), client)) {
    return Response.json(
      { error: "invalid_client", error_description: "Client authentication failed." },
      { status: 401, headers: { "WWW-Authenticate": 'Basic realm="introspect"', "Cache-Control": "no-store" } }
    );
  }

  let token = "";
  try {
    token = String((await req.formData()).get("token") ?? "");
  } catch {
    return oauthError(400, "invalid_request", "Body must be application/x-www-form-urlencoded with a token.");
  }

  const p = openAccessToken(token);
  const audiences = [mcpResourceUrl(req, "/youtube-mcp"), ...externalResources()];
  if (!p || !p.user_id || !audiences.includes(p.aud)) return inactive();

  return Response.json(
    {
      active: true,
      iss: publicOrigin(req),
      aud: p.aud,
      sub: p.user_id,
      name: p.user_name,
      client_id: p.client_id,
      scope: p.scope,
      token_type: "Bearer",
      iat: p.iat,
      exp: p.exp,
      videodb_api_key: p.key,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function inactive(): Response {
  return Response.json({ active: false }, { headers: { "Cache-Control": "no-store" } });
}

function authenticated(header: string | null, client: { id: string; secret: string }): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  const id = decodeURIComponent(decoded.slice(0, sep));
  const secret = decodeURIComponent(decoded.slice(sep + 1));
  return safeEqual(id, client.id) && safeEqual(secret, client.secret);
}
