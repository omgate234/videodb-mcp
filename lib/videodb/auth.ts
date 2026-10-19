/**
 * API-key verification for the OAuth consent step. Kept as a bare fetch:
 * the SDK has no /user call and this must never poll.
 */
const BASE = () => process.env.VIDEODB_API_BASE || "https://api.videodb.io";
const HEADERS = (apiKey: string) => ({ "x-access-token": apiKey, "x-videodb-client": "videodb-mcp/2.0.0" });

/** Who a key belongs to. GET /user returns the user record the key was minted from. */
export interface Identity {
  email?: string;
  user_id?: string;
  user_name?: string;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function identityOf(data: Record<string, unknown> | undefined): Identity {
  return { email: str(data?.email), user_id: str(data?.user_id), user_name: str(data?.name) };
}

async function getUser(apiKey: string, timeoutMs?: number): Promise<{ status: number; data?: Record<string, unknown> }> {
  const res = await fetch(`${BASE()}/user`, {
    headers: HEADERS(apiKey),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const json = (await res.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  return { status: res.status, data: res.ok ? json?.data : undefined };
}

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

/** Best-effort lookup for telemetry attribution; never throws. */
export async function fetchIdentity(apiKey: string): Promise<Identity> {
  try {
    return identityOf((await getUser(apiKey, 5000)).data);
  } catch {
    return {};
  }
}

export async function validateApiKey(apiKey: string): Promise<{ valid: boolean; error?: string } & Identity> {
  let user: Awaited<ReturnType<typeof getUser>>;
  try {
    user = await getUser(apiKey);
  } catch {
    return { valid: false, error: "Could not reach the VideoDB API to verify the key. Try again." };
  }
  if (user.status === 401) return { valid: false, error: "That API key was rejected by VideoDB." };
  if (user.status < 200 || user.status >= 300) return { valid: false, error: `VideoDB API error (HTTP ${user.status}).` };
  return { valid: true, ...identityOf(user.data) };
}
