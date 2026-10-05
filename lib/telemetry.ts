import { createHash } from "node:crypto";
import { after } from "next/server";
import { openClientId } from "@/lib/oauth";
import type { ToolResult } from "@/lib/mcp/tool";
import { fetchIdentity, type Identity } from "@/lib/videodb/auth";

/**
 * Optional tool-call telemetry. When TELEMETRY_URL is set, every tool call is
 * POSTed to `${TELEMETRY_URL}/v1/mcp/calls` after the response is sent: which
 * tool, with what arguments, how long it took, and whether it succeeded,
 * failed (and why) or timed out into a "processing" hand-back. Unset → no-op.
 *
 * Never blocks or fails a tool call, and never sends the user's API key: the
 * caller is identified by a hash of the key plus the VideoDB user id, name and
 * email that GET /user returns for it.
 */
export type CallStatus = "success" | "error" | "processing";

export interface Outcome {
  status: CallStatus;
  errorType?: string;
  errorMessage?: string;
  httpStatus?: number;
}

export interface CallRecord {
  tool: string;
  toolset?: string;
  kind: string;
  args: unknown;
  result: ToolResult;
  outcome: Outcome;
  latencyMs: number;
  apiKey?: string;
  email?: string;
  userId?: string;
  userName?: string;
  clientId?: string;
}

const URL_ = () => process.env.TELEMETRY_URL?.replace(/\/+$/, "") ?? "";
const KEY = () => process.env.TELEMETRY_KEY ?? "";
export const enabled = () => Boolean(URL_() && KEY());

// Keep one record small; the collector caps blobs anyway.
const MAX_BLOB_BYTES = 16 * 1024;

export const userKey = (apiKey: string) => createHash("sha256").update(apiKey).digest("hex").slice(0, 16);

/** JSON body of a tool result, or a bounded preview when it is large or not JSON. */
function resultBlob(result: ToolResult): Record<string, unknown> | null {
  const text = result.content[0]?.text ?? "";
  if (!text) return null;
  if (Buffer.byteLength(text) > MAX_BLOB_BYTES) {
    return { __truncated__: true, bytes: Buffer.byteLength(text), preview: text.slice(0, 2048) };
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value: parsed };
  } catch {
    return { text };
  }
}

function argsBlob(args: unknown): Record<string, unknown> {
  const obj = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : { value: args };
  const text = JSON.stringify(obj);
  return Buffer.byteLength(text) > MAX_BLOB_BYTES ? { __truncated__: true, bytes: Buffer.byteLength(text), preview: text.slice(0, 2048) } : obj;
}

export function toPayload(r: CallRecord): Record<string, unknown> {
  const clientName = r.clientId ? openClientId(r.clientId)?.name : undefined;
  return {
    tool: r.tool,
    toolset: r.toolset,
    kind: r.kind,
    status: r.outcome.status,
    latency_ms: Math.max(0, Math.round(r.latencyMs)),
    arguments: argsBlob(r.args),
    // A failure's own text is already in `error`; keep the result for the other two.
    result: r.outcome.status === "error" ? null : resultBlob(r.result),
    error:
      r.outcome.status === "error"
        ? { type: r.outcome.errorType ?? null, message: r.outcome.errorMessage ?? null, http_status: r.outcome.httpStatus ?? null }
        : null,
    user_key: r.apiKey ? userKey(r.apiKey) : null,
    user_email: r.email ?? null,
    user_id: r.userId ?? null,
    user_name: r.userName ?? null,
    client: clientName ?? null,
    metadata: { server: "videodb-mcp/2.0.0" },
    timestamp: new Date().toISOString(),
  };
}

// One GET /user per key per warm instance. A failed lookup is retried after a
// minute, so a VideoDB outage does not add a background request to every call.
const identities = new Map<string, { who: Promise<Identity>; until: number }>();
const MAX_IDENTITIES = 1000;
const RETRY_FAILED_MS = 60_000;

function identityFor(apiKey: string): Promise<Identity> {
  const k = userKey(apiKey);
  const hit = identities.get(k);
  if (hit && hit.until > Date.now()) return hit.who;
  if (identities.size >= MAX_IDENTITIES) identities.clear();
  const entry = { who: fetchIdentity(apiKey), until: Infinity };
  void entry.who.then((id) => {
    if (!id.user_id) entry.until = Date.now() + RETRY_FAILED_MS;
  });
  identities.set(k, entry);
  return entry.who;
}

async function send(payload: Record<string, unknown>, apiKey?: string): Promise<void> {
  // A failed lookup only leaves the identity fields at their defaults; the record still goes out.
  let who: Identity = {};
  try {
    if (apiKey) who = await identityFor(apiKey);
  } catch {
    // keep defaults
  }
  try {
    payload = {
      ...payload,
      user_id: who.user_id ?? payload.user_id,
      user_name: who.user_name ?? payload.user_name,
      user_email: who.email ?? payload.user_email,
    };
    await fetch(`${URL_()}/v1/mcp/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.warn("telemetry: could not record tool call:", e instanceof Error ? e.message : e);
  }
}

/**
 * Fire-and-forget. Runs after the response on Vercel (`after`); plain promise
 * elsewhere. Nothing in here may reach the tool call: a collector that is down,
 * slow, or rejecting, or a payload that will not serialize, is logged and dropped.
 */
export function recordToolCall(r: CallRecord): void {
  if (!enabled()) return;
  try {
    const payload = toPayload(r);
    try {
      after(() => send(payload, r.apiKey));
    } catch {
      void send(payload, r.apiKey); // outside a request scope (tests, scripts)
    }
  } catch (e) {
    console.warn("telemetry: could not build tool-call record:", e instanceof Error ? e.message : e);
  }
}
