import {
  openClientId,
  openConsentRequest,
  mintCode,
  redirectUriAllowed,
  canonicalResource,
  mcpResourceUrl,
  publicOrigin,
  bridgeSecret,
  BRIDGE_SECRET_HEADER,
  corsPreflight,
  oauthError,
  CORS_HEADERS,
} from "@/lib/oauth";
import { safeEqual } from "@/lib/crypto";
import { validateApiKey } from "@/lib/videodb";

export const maxDuration = 30;

/**
 * DirectorFE hands back a freshly minted credential for an authorized user.
 *
 * Server-to-server, never a browser redirect: the credential must not appear in
 * a URL, where it would reach browser history, referrer headers and access logs.
 * The reply carries the URL DirectorFE should send the user to — this endpoint
 * cannot redirect the browser itself, since the browser is not the caller.
 *
 * The shared secret is what separates this from the req_token, which travels
 * through the browser and must therefore be assumed stealable on its own.
 */
export async function POST(req: Request) {
  const expected = bridgeSecret();
  if (!expected) {
    return oauthError(
      503,
      "bridge_not_configured",
      "DIRECTORFE_BRIDGE_SECRET is not set on this deployment."
    );
  }

  const presented = req.headers.get(BRIDGE_SECRET_HEADER) ?? "";
  if (!presented || !safeEqual(presented, expected)) {
    return oauthError(401, "invalid_client", "Bridge authentication failed.");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return oauthError(400, "invalid_request", "Request body must be JSON.");
  }

  const consent = openConsentRequest(String(body?.req_token ?? ""));
  if (!consent) {
    return oauthError(
      400,
      "invalid_request",
      "This authorization request has expired. Start the connection again from the client."
    );
  }

  // Re-validate against the sealed request rather than trusting the caller —
  // same defense in depth the interactive consent path applies.
  const client = openClientId(consent.client_id);
  if (!client || !redirectUriAllowed(consent.redirect_uri, client.ru)) {
    return oauthError(400, "invalid_request", "Invalid authorization request.");
  }

  const token = String(body?.token ?? "").trim();
  if (!token) {
    return oauthError(400, "invalid_request", "token is required.");
  }

  // Confirm the credential actually works before sealing it into a code. A key
  // that fails here becomes a connection that appears to succeed and then breaks
  // on the first tool call, with nothing pointing at the cause.
  const check = await validateApiKey(token);
  if (!check.valid) {
    return oauthError(400, "invalid_grant", check.error ?? "Credential was rejected by VideoDB.");
  }

  const aud = consent.resource ? canonicalResource(consent.resource) : mcpResourceUrl(req);

  const code = mintCode({
    key: token,
    client_id: consent.client_id,
    redirect_uri: consent.redirect_uri,
    cc: consent.cc,
    scope: consent.scope,
    aud,
  });

  const redirectTo = new URL(consent.redirect_uri);
  redirectTo.searchParams.set("code", code);
  if (consent.state !== undefined) redirectTo.searchParams.set("state", consent.state);
  redirectTo.searchParams.set("iss", publicOrigin(req));

  return Response.json(
    { redirect_to: redirectTo.toString() },
    { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
  );
}

export function OPTIONS() {
  return corsPreflight();
}
