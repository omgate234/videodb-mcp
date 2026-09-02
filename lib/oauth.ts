import { open, seal, nowSeconds } from "./crypto";

function _urlencode(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

/**
 * Stateless OAuth 2.1 primitives.
 *
 * Flow (all artifacts are sealed AES-GCM payloads — see lib/crypto.ts):
 *   1. Claude registers via Dynamic Client Registration → client_id encodes
 *      the registered redirect_uris.
 *   2. /oauth/authorize validates the request, shows a consent page where the
 *      user pastes their VideoDB API key. The pending request travels in a
 *      sealed `req` blob inside the form (tamper-proof).
 *   3. On approval the key is verified against the VideoDB API, then sealed
 *      into a short-lived authorization code bound to the PKCE challenge.
 *   4. /oauth/token verifies PKCE and exchanges the code for access +
 *      refresh tokens that carry the (encrypted) VideoDB API key.
 */

// ---------- lifetimes (seconds) ----------
export const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days
export const AUTH_CODE_TTL = 5 * 60; // 5 minutes
export const CONSENT_REQUEST_TTL = 15 * 60; // 15 minutes

export const SCOPES = ["videodb", "offline_access"];

// ---------- payload types ----------
export interface ClientPayload {
  typ: "client";
  ru: string[]; // registered redirect_uris
  name?: string;
  iat: number;
}

export interface ConsentRequestPayload {
  typ: "req";
  client_id: string;
  redirect_uri: string;
  cc: string; // PKCE code_challenge (S256)
  state?: string;
  scope: string;
  resource?: string;
  exp: number;
}

export interface CodePayload {
  typ: "code";
  key: string; // verified VideoDB API key
  client_id: string;
  redirect_uri: string;
  cc: string;
  scope: string;
  aud: string; // canonical MCP resource URL
  exp: number;
}

export interface AccessPayload {
  typ: "access";
  key: string;
  client_id: string;
  scope: string;
  aud: string;
  exp: number;
  iat: number;
}

export interface RefreshPayload {
  typ: "refresh";
  key: string;
  client_id: string;
  scope: string;
  aud: string;
  exp: number;
}

// ---------- minting / opening ----------

export function mintClientId(redirectUris: string[], name?: string): string {
  const payload: ClientPayload = { typ: "client", ru: redirectUris, name, iat: nowSeconds() };
  return `vdbc_${seal({ ...payload })}`;
}

export function openClientId(clientId: string): ClientPayload | null {
  if (!clientId?.startsWith("vdbc_")) return null;
  const payload = open<ClientPayload>(clientId.slice(5));
  return payload?.typ === "client" && Array.isArray(payload.ru) ? payload : null;
}

export function mintConsentRequest(p: Omit<ConsentRequestPayload, "typ" | "exp">): string {
  return seal({ ...p, typ: "req", exp: nowSeconds() + CONSENT_REQUEST_TTL });
}

export function openConsentRequest(token: string): ConsentRequestPayload | null {
  const p = open<ConsentRequestPayload>(token);
  return p?.typ === "req" && p.exp > nowSeconds() ? p : null;
}

export function mintCode(p: Omit<CodePayload, "typ" | "exp">): string {
  return seal({ ...p, typ: "code", exp: nowSeconds() + AUTH_CODE_TTL });
}

export function openCode(token: string): CodePayload | null {
  const p = open<CodePayload>(token);
  return p?.typ === "code" && p.exp > nowSeconds() ? p : null;
}

export function mintAccessToken(p: Omit<AccessPayload, "typ" | "exp" | "iat">): string {
  const now = nowSeconds();
  return seal({ ...p, typ: "access", iat: now, exp: now + ACCESS_TOKEN_TTL });
}

export function openAccessToken(token: string): AccessPayload | null {
  const p = open<AccessPayload>(token);
  return p?.typ === "access" && p.exp > nowSeconds() ? p : null;
}

export function mintRefreshToken(p: Omit<RefreshPayload, "typ" | "exp">): string {
  return seal({ ...p, typ: "refresh", exp: nowSeconds() + REFRESH_TOKEN_TTL });
}

export function openRefreshToken(token: string): RefreshPayload | null {
  const p = open<RefreshPayload>(token);
  return p?.typ === "refresh" && p.exp > nowSeconds() ? p : null;
}

// ---------- URL helpers ----------

/**
 * Public origin of the incoming request, honoring Vercel's forwarded headers.
 * Used consistently for issuer, resource metadata, and token audience so the
 * same deployment works on localhost, *.vercel.app, and custom domains.
 */
export function publicOrigin(req: Request): string {
  const get = (n: string) => req.headers.get(n) ?? undefined;
  const host = get("x-forwarded-host") ?? get("host") ?? "localhost:3000";
  const isLocal =
    host.startsWith("localhost") || host.startsWith("127.") || host.startsWith("[::1]");
  const proto = get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (isLocal ? "http" : "https");
  return `${proto}://${host.toLowerCase()}`;
}

/** Canonical resource URL per RFC 8707: lowercase scheme/host, no trailing slash. */
export function canonicalResource(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

export function mcpResourceUrl(req: Request): string {
  return canonicalResource(`${publicOrigin(req)}/mcp`);
}

/**
 * Redirect URI validation: exact match against the registered list, except
 * loopback URIs (RFC 8252) where the port is ignored — Claude Code and MCP
 * Inspector use ephemeral localhost ports.
 */
export function redirectUriAllowed(candidate: string, registered: string[]): boolean {
  let cu: URL;
  try {
    cu = new URL(candidate);
  } catch {
    return false;
  }
  const isLoopback = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  return registered.some((r) => {
    try {
      const ru = new URL(r);
      if (isLoopback(cu.hostname) && isLoopback(ru.hostname)) {
        return cu.protocol === ru.protocol && cu.pathname === ru.pathname;
      }
      return r === candidate;
    } catch {
      return false;
    }
  });
}

// ---------- DirectorFE bridge ----------

/**
 * Where the user signs in, instead of pasting an API key.
 *
 * Unset means no bridge is configured, and /oauth/authorize falls back to the
 * built-in consent page. That fallback is what keeps the e2e suite and local
 * development runnable without a DirectorFE instance, and it is the path an
 * account with a VideoDB API key but no DirectorFE login still takes.
 */
export function directorFeOrigin(): string | null {
  const origin = process.env.DIRECTORFE_ORIGIN?.trim();
  return origin ? origin.replace(/\/$/, "") : null;
}

/**
 * Shared secret proving a callback really came from DirectorFE.
 *
 * Without it a stolen req_token would be enough to drive the callback and mint
 * an authorization code, since the req_token travels through the browser.
 */
export function bridgeSecret(): string | null {
  const secret = process.env.DIRECTORFE_BRIDGE_SECRET?.trim();
  return secret ? secret : null;
}

export const BRIDGE_SECRET_HEADER = "x-bridge-secret";

export function consentUrl(reqToken: string): string {
  const origin = directorFeOrigin();
  if (!origin) throw new Error("DIRECTORFE_ORIGIN is not configured");
  return `${origin}/connect/videodb-mcp?${_urlencode({ req_token: reqToken })}`;
}

// ---------- response helpers ----------

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function oauthError(status: number, error: string, description: string): Response {
  return Response.json(
    { error, error_description: description },
    { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
  );
}
