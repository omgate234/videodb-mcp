import {
  openCode,
  openClientId,
  openRefreshToken,
  mintAccessToken,
  mintRefreshToken,
  corsPreflight,
  oauthError,
  CORS_HEADERS,
  ACCESS_TOKEN_TTL,
} from "@/lib/oauth";
import { sha256base64url, safeEqual } from "@/lib/crypto";

/**
 * OAuth 2.1 token endpoint (public clients, PKCE, refresh rotation).
 * Accepts application/x-www-form-urlencoded (required by spec; JSON tolerated).
 */

async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const j = await req.json();
      return Object.fromEntries(Object.entries(j ?? {}).map(([k, v]) => [k, String(v)]));
    } catch {
      return {};
    }
  }
  try {
    const form = await req.formData();
    const out: Record<string, string> = {};
    form.forEach((v, k) => {
      out[k] = String(v);
    });
    return out;
  } catch {
    return {};
  }
}

function tokenResponse(p: {
  key: string;
  client_id: string;
  scope: string;
  aud: string;
}): Response {
  const accessToken = mintAccessToken(p);
  const refreshToken = mintRefreshToken(p);
  return Response.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refreshToken,
      scope: p.scope,
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache" } }
  );
}

export async function POST(req: Request) {
  const params = await readParams(req);
  const grantType = params.grant_type;

  if (grantType === "authorization_code") {
    const code = openCode(params.code ?? "");
    if (!code) {
      return oauthError(400, "invalid_grant", "Authorization code is invalid or expired.");
    }
    if (params.client_id && params.client_id !== code.client_id) {
      return oauthError(400, "invalid_grant", "client_id does not match the authorization code.");
    }
    if (!openClientId(code.client_id)) {
      return oauthError(400, "invalid_client", "Unknown client.");
    }
    if (params.redirect_uri && params.redirect_uri !== code.redirect_uri) {
      return oauthError(400, "invalid_grant", "redirect_uri does not match the authorization request.");
    }
    const verifier = params.code_verifier ?? "";
    if (!verifier || !safeEqual(sha256base64url(verifier), code.cc)) {
      return oauthError(400, "invalid_grant", "PKCE verification failed.");
    }
    return tokenResponse({
      key: code.key,
      client_id: code.client_id,
      scope: code.scope,
      aud: code.aud,
    });
  }

  if (grantType === "refresh_token") {
    const refresh = openRefreshToken(params.refresh_token ?? "");
    if (!refresh) {
      return oauthError(400, "invalid_grant", "Refresh token is invalid or expired. Reconnect the connector.");
    }
    if (params.client_id && params.client_id !== refresh.client_id) {
      return oauthError(400, "invalid_grant", "client_id does not match the refresh token.");
    }
    // Rotation: issue a fresh access + refresh token pair.
    return tokenResponse({
      key: refresh.key,
      client_id: refresh.client_id,
      scope: refresh.scope,
      aud: refresh.aud,
    });
  }

  return oauthError(
    400,
    "unsupported_grant_type",
    "Supported grant types: authorization_code, refresh_token."
  );
}

export function OPTIONS() {
  return corsPreflight();
}
