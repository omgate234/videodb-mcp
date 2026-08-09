import { mintClientId, corsPreflight, oauthError, CORS_HEADERS } from "@/lib/oauth";
import { nowSeconds } from "@/lib/crypto";

/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591).
 *
 * Stateless: the returned client_id is a sealed blob encoding the registered
 * redirect_uris, so /oauth/authorize and /oauth/token can validate them
 * without a database. Clients are public (PKCE-only, no secret).
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return oauthError(400, "invalid_client_metadata", "Request body must be JSON.");
  }

  const redirectUris: unknown = body?.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return oauthError(400, "invalid_redirect_uri", "redirect_uris (non-empty array) is required.");
  }

  for (const uri of redirectUris) {
    let u: URL;
    try {
      u = new URL(String(uri));
    } catch {
      return oauthError(400, "invalid_redirect_uri", `Invalid redirect URI: ${uri}`);
    }
    const isLoopback =
      u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && isLoopback)) {
      return oauthError(
        400,
        "invalid_redirect_uri",
        `Redirect URIs must be https:// (or http:// loopback): ${uri}`
      );
    }
  }

  const clientName = typeof body?.client_name === "string" ? body.client_name.slice(0, 80) : undefined;
  const clientId = mintClientId(redirectUris.map(String), clientName);

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: nowSeconds(),
      redirect_uris: redirectUris,
      client_name: clientName,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
  );
}

export function OPTIONS() {
  return corsPreflight();
}
