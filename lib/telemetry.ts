import { createHash } from "node:crypto";
import { after } from "next/server";
import { openClientId } from "@/lib/oauth";
import type { ToolResult } from "@/lib/mcp/tool";

/**
 * Optional tool-call telemetry. When TELEMETRY_URL is set, every tool call is
 * POSTed to `${TELEMETRY_URL}/v1/mcp/calls` after the response is sent: which
 * tool, with what arguments, how long it took, and whether it succeeded,
 * failed (and why) or timed out into a "processing" hand-back. Unset → no-op.
 *
 * Never blocks or fails a tool call, and never sends the user's API key: the
 * caller is identified by a hash of the key plus the email sealed in the token.
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
    client: clientName ?? null,
    metadata: { server: "videodb-mcp/2.0.0" },
    timestamp: new Date().toISOString(),
  };
}

async function send(payload: Record<string, unknown>): Promise<void> {
  try {
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
      after(() => send(payload));
    } catch {
      void send(payload); // outside a request scope (tests, scripts)
    }
  } catch (e) {
    console.warn("telemetry: could not build tool-call record:", e instanceof Error ? e.message : e);
  }
}
