import type { Connection } from "@/lib/videodb/client";

/**
 * Client for the Director search service. The shared key authenticates this
 * server; X-VideoDB-User names the account the service scopes every result to.
 */
const BASE = () => process.env.DIRECTOR_SEARCH_URL?.trim().replace(/\/+$/, "");
const KEY = () => process.env.DIRECTOR_SEARCH_KEY?.trim();
const TIMEOUT_MS = 45_000; // inside the 50 s tool deadline

export const directorConfigured = () => Boolean(BASE() && KEY());

/** The caller's VideoDB user id, read with their own key so it cannot be claimed. */
export async function userId(vdb: Connection): Promise<string> {
  const res = await vdb.vhttp.get<{ user_id?: string }>(["user"], undefined, { convert: false });
  const id = (res.data as { user_id?: unknown } | undefined)?.user_id;
  if (typeof id !== "string" || !id) throw new Error("Could not resolve the VideoDB account for this connection.");
  return id;
}

export async function director(vdb: Connection, method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const base = BASE();
  const key = KEY();
  if (!base || !key) throw new Error("Director search is not configured on this server.");
  const user = await userId(vdb);
  let res: Response;
  try {
    res = await fetch(base + path, {
      method,
      headers: {
        "X-Internal-Key": key,
        "X-VideoDB-User": user,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("Director search is unreachable; try again shortly.");
  }
  const json = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (!res.ok) {
    throw new Error(typeof json?.error === "string" ? json.error : `Director search failed (HTTP ${res.status}).`);
  }
  return json;
}

export const seg = encodeURIComponent;
