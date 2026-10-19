/**
 * API-key verification for the OAuth consent step. Kept as a bare fetch:
 * the SDK has no /user call and this must never poll.
 */
const BASE = () => process.env.VIDEODB_API_BASE || "https://api.videodb.io";
const HEADERS = (apiKey: string) => ({ "x-access-token": apiKey, "x-videodb-client": "videodb-mcp/2.0.0" });

/** Who the key belongs to; sealed into the token for telemetry attribution. */
export interface Identity {
  email?: string;
  user_id?: string;
  user_name?: string;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** The account's billing plan id (e.g. "Free_v1"), or undefined when it can't be read. Never throws. */
export async function fetchPlanId(apiKey: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${BASE()}/billing/usage`, { headers: HEADERS(apiKey), signal: AbortSignal.timeout(3000) });
    const json = (await res.json().catch(() => null)) as { data?: { plan_id?: unknown } } | null;
    return res.ok ? str(json?.data?.plan_id) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The billing row (what Connection.checkUsage() reads) carries user_id, email and
 * name. Best-effort: a missing billing row or a network blip leaves fields unset.
 */
export async function fetchIdentity(apiKey: string): Promise<Identity> {
  try {
    const res = await fetch(`${BASE()}/billing/usage`, { headers: HEADERS(apiKey), signal: AbortSignal.timeout(5000) });
    const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
    const d = json?.data ?? {};
    return { email: str(d.email), user_id: str(d.user_id), user_name: str(d.name) };
  } catch {
    return {};
  }
}

export async function validateApiKey(
  apiKey: string
): Promise<{ valid: boolean; error?: string } & Identity> {
  let res: Response;
  try {
    res = await fetch(`${BASE()}/user`, { headers: HEADERS(apiKey) });
  } catch {
    return { valid: false, error: "Could not reach the VideoDB API to verify the key. Try again." };
  }
  if (res.status === 401) return { valid: false, error: "That API key was rejected by VideoDB." };
  const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  if (!res.ok) return { valid: false, error: `VideoDB API error (HTTP ${res.status}).` };
  const who = await fetchIdentity(apiKey);
  return {
    valid: true,
    email: who.email ?? str(json?.data?.email) ?? str(json?.data?.user_email),
    user_id: who.user_id ?? str(json?.data?.user_id),
    user_name: who.user_name,
  };
}
