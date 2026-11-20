import { context, trace, SpanStatusCode, type Attributes, type Span } from "@opentelemetry/api";
import { TOOL_SPAN } from "@/lib/otel/sampler";
import type { Outcome } from "@/lib/telemetry";

const tracer = () => trace.getTracer("videodb-mcp");

export type ToolOutcome = "ok" | "error" | "processing" | "input_rejected" | "out_of_credit" | "plan_limit" | "unauthenticated";

/** Collapse a settled call into the span's outcome code. */
export function toolOutcome(o: Outcome, opts: { blocked?: "insufficient_credit" | "plan_limit"; isError: boolean; authed: boolean }): ToolOutcome {
  if (!opts.authed) return "unauthenticated";
  if (opts.blocked) return opts.blocked === "plan_limit" ? "plan_limit" : "out_of_credit";
  if (o.status === "processing") return "processing";
  if (o.status === "error") return opts.isError ? "error" : "input_rejected";
  return "ok";
}

// Only IDs are copied from arguments; nothing else a caller sends is recorded.
const ID_ARGS: Record<string, string> = { video_id: "videodb.media.id", collection_id: "videodb.collection.id" };

export function startAttributes(tool: { name: string; kind: string; toolset?: string }, args: unknown, who: { userId?: string; client?: string }): Attributes {
  const a: Attributes = { "mcp.tool.name": tool.name, "mcp.tool.kind": tool.kind };
  if (tool.toolset) a["mcp.toolset"] = tool.toolset;
  if (who.client) a["mcp.client.name"] = who.client;
  if (who.userId) a["videodb.tenant.id"] = who.userId;
  if (args && typeof args === "object") {
    for (const [arg, key] of Object.entries(ID_ARGS)) {
      const v = (args as Record<string, unknown>)[arg];
      if (typeof v === "string" && v) a[key] = v;
    }
  }
  return a;
}

/** A new root span for one tool call; `fn` runs inside it, so outbound calls carry its traceparent. */
export async function withToolSpan<T>(attributes: Attributes, fn: (span: Span) => Promise<T>): Promise<T> {
  const span = tracer().startSpan(TOOL_SPAN, { root: true, attributes });
  return context.with(trace.setSpan(context.active(), span), () => fn(span));
}

export function endToolSpan(span: Span, outcome: ToolOutcome, o: Outcome): void {
  span.setAttribute("mcp.tool.outcome", outcome);
  if (outcome === "processing" && o.errorType) span.setAttribute("mcp.processing.reason", o.errorType);
  if (o.httpStatus) span.setAttribute("http.response.status_code", o.httpStatus);
  if (outcome === "error") {
    if (o.errorType) span.setAttribute("error.type", o.errorType);
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
  span.end();
}
