/**
 * API-key verification for the OAuth consent step. Kept as a bare fetch:
 * the SDK has no /user call and this must never poll.
 */
const BASE = () => process.env.VIDEODB_API_BASE || "https://api.videodb.io";

export async function validateApiKey(
  apiKey: string
): Promise<{ valid: boolean; email?: string; error?: string }> {
  let res: Response;
  try {
    res = await fetch(`${BASE()}/user`, {
      headers: { "x-access-token": apiKey, "x-videodb-client": "videodb-mcp/2.0.0" },
    });
  } catch {
    return { valid: false, error: "Could not reach the VideoDB API to verify the key. Try again." };
  }
  if (res.status === 401) return { valid: false, error: "That API key was rejected by VideoDB." };
  const json = (await res.json().catch(() => null)) as { data?: { user_email?: string } } | null;
  if (!res.ok) return { valid: false, error: `VideoDB API error (HTTP ${res.status}).` };
  return { valid: true, email: json?.data?.user_email };
}
