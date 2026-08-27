import {
  openClientId,
  mintConsentRequest,
  openConsentRequest,
  mintCode,
  redirectUriAllowed,
  canonicalResource,
  mcpResourceUrl,
  publicOrigin,
  directorFeOrigin,
  consentUrl,
  SCOPES,
} from "@/lib/oauth";
import { consentPage } from "@/lib/consent-page";
import { validateApiKey } from "@/lib/videodb";

export const maxDuration = 30;

/**
 * OAuth 2.1 authorization endpoint.
 *
 * GET  — validate the request, render the VideoDB consent page (user pastes
 *        their API key; the pending request travels in a sealed req_token).
 * POST — form submit: verify the key against the VideoDB API, mint a
 *        PKCE-bound authorization code, redirect back to Claude.
 */

function htmlError(status: number, message: string): Response {
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0b0f0d;color:#e8ede9;display:flex;align-items:center;justify-content:center;min-height:100vh"><div style="max-width:480px;padding:32px;border:1px solid #263029;border-radius:12px"><h2 style="margin:0 0 12px">Authorization error</h2><p style="color:#9fb0a5;line-height:1.6;margin:0">${message}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function redirectWith(redirectUri: string, params: Record<string, string | undefined>): Response {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v);
  }
  return Response.redirect(url.toString(), 302);
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;

  const clientId = p.get("client_id") ?? "";
  const redirectUri = p.get("redirect_uri") ?? "";
  const client = openClientId(clientId);

  // Never redirect to an unvalidated URI — hard-fail instead (OAuth 2.1 §4.1.2.1).
  if (!client) {
    return htmlError(400, "Unknown client_id. The client must register first via Dynamic Client Registration.");
  }
  if (!redirectUri || !redirectUriAllowed(redirectUri, client.ru)) {
    return htmlError(400, "redirect_uri does not match the URIs registered for this client.");
  }

  const state = p.get("state") ?? undefined;
  if (p.get("response_type") !== "code") {
    return redirectWith(redirectUri, {
      error: "unsupported_response_type",
      error_description: "Only response_type=code is supported.",
      state,
    });
  }
  const codeChallenge = p.get("code_challenge") ?? "";
  if (!codeChallenge || (p.get("code_challenge_method") ?? "S256") !== "S256") {
    return redirectWith(redirectUri, {
      error: "invalid_request",
      error_description: "PKCE with code_challenge_method=S256 is required.",
      state,
    });
  }

  const scope = p.get("scope") || SCOPES.join(" ");
  const resource = p.get("resource") ?? undefined;

  const reqToken = mintConsentRequest({
    client_id: clientId,
    redirect_uri: redirectUri,
    cc: codeChallenge,
    state,
    scope,
    resource,
  });

  // With a bridge configured the user signs in to VideoDB instead of handling a
  // secret; the sealed request rides along and comes back at /authorize/callback.
  if (directorFeOrigin()) {
    return Response.redirect(consentUrl(reqToken), 302);
  }

  return new Response(consentPage({ reqToken, clientName: client.name }), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const reqToken = String(form.get("req_token") ?? "");
  const action = String(form.get("action") ?? "approve");
  const apiKey = String(form.get("api_key") ?? "").trim();

  const consent = openConsentRequest(reqToken);
  if (!consent) {
    return htmlError(400, "This authorization request has expired. Close this window and try connecting again from Claude.");
  }

  // Re-validate against the sealed request (defense in depth).
  const client = openClientId(consent.client_id);
  if (!client || !redirectUriAllowed(consent.redirect_uri, client.ru)) {
    return htmlError(400, "Invalid authorization request.");
  }

  if (action === "deny") {
    return redirectWith(consent.redirect_uri, {
      error: "access_denied",
      error_description: "The user denied the request.",
      state: consent.state,
    });
  }

  if (!apiKey) {
    return new Response(
      consentPage({ reqToken, clientName: client.name, error: "Enter your VideoDB API key to continue." }),
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }

  const check = await validateApiKey(apiKey);
  if (!check.valid) {
    return new Response(
      consentPage({ reqToken, clientName: client.name, error: check.error }),
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }

  const aud = consent.resource ? canonicalResource(consent.resource) : mcpResourceUrl(req);

  const code = mintCode({
    key: apiKey,
    client_id: consent.client_id,
    redirect_uri: consent.redirect_uri,
    cc: consent.cc,
    scope: consent.scope,
    aud,
  });

  return redirectWith(consent.redirect_uri, {
    code,
    state: consent.state,
    iss: publicOrigin(req),
  });
}
