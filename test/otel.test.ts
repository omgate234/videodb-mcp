import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { context, propagation, trace, ROOT_CONTEXT } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { SampledOnlyPropagator, ToolCallSampler, TOOL_SPAN } from "@/lib/otel/sampler";
import { endToolSpan, startAttributes, toolOutcome, withToolSpan } from "@/lib/otel/tool";

const exporter = new InMemorySpanExporter();
const provider = new TracerProvider({ sampler: new ToolCallSampler(), spanProcessors: [new SimpleSpanProcessor({ exporter })] });
const tracer = provider.getTracer("test");

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new SampledOnlyPropagator());
  trace.setGlobalTracerProvider(provider);
});
afterAll(() => {
  trace.disable();
  context.disable();
  propagation.disable();
});
beforeEach(() => exporter.reset());

const traceparent = () => {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent;
};

describe("ToolCallSampler", () => {
  it("drops non-tool roots and their children, and injects no traceparent for them", () => {
    tracer.startActiveSpan("POST /mcp", (req) => {
      expect(req.isRecording()).toBe(false);
      expect(traceparent()).toBeUndefined();
      tracer.startSpan("GET").end();
      req.end();
    });
    expect(exporter.getFinishedSpans()).toHaveLength(0);
  });

  it("keeps a tool span as a new root inside a dropped request, and its children follow", async () => {
    let header: string | undefined;
    await tracer.startActiveSpan("POST /mcp", async (req) => {
      await withToolSpan({ "mcp.tool.name": "get_video" }, async (span) => {
        header = traceparent();
        tracer.startSpan("GET /video").end();
        endToolSpan(span, "ok", { status: "success" });
      });
      req.end();
    });
    const spans = exporter.getFinishedSpans();
    expect(spans.map((s) => s.name).sort()).toEqual(["GET /video", TOOL_SPAN]);
    const tool = spans.find((s) => s.name === TOOL_SPAN)!;
    expect(tool.parentSpanContext).toBeUndefined();
    expect(header).toMatch(new RegExp(`^00-${tool.spanContext().traceId}-[0-9a-f]{16}-01$`));
  });

  it("keeps a tool span even under a remote unsampled parent", () => {
    const remote = trace.setSpanContext(ROOT_CONTEXT, { traceId: "1".repeat(32), spanId: "2".repeat(16), traceFlags: 0, isRemote: true });
    const span = tracer.startSpan(TOOL_SPAN, {}, remote);
    expect(span.isRecording()).toBe(true);
    span.end();
  });
});

describe("tool span attributes", () => {
  it("copies only ID arguments, never other input", () => {
    const a = startAttributes(
      { name: "search_video", kind: "read", toolset: "search" },
      { video_id: "m-1", collection_id: "c-default", query: "secret plans", url: "https://x" },
      { userId: "u-1", client: "Claude" }
    );
    expect(a).toEqual({
      "mcp.tool.name": "search_video",
      "mcp.tool.kind": "read",
      "mcp.toolset": "search",
      "mcp.client.name": "Claude",
      "videodb.tenant.id": "u-1",
      "videodb.media.id": "m-1",
      "videodb.collection.id": "c-default",
    });
  });

  it("records outcome, reason and error class, never the message", async () => {
    await withToolSpan({}, async (span) => endToolSpan(span, "error", { status: "error", errorType: "InvalidRequestError", errorMessage: "boom", httpStatus: 404 }));
    await withToolSpan({}, async (span) => endToolSpan(span, "processing", { status: "processing", errorType: "deadline" }));
    const [err, proc] = exporter.getFinishedSpans();
    expect(err.attributes).toEqual({ "mcp.tool.outcome": "error", "http.response.status_code": 404, "error.type": "InvalidRequestError" });
    expect(err.status.code).toBe(2);
    expect(proc.attributes).toEqual({ "mcp.tool.outcome": "processing", "mcp.processing.reason": "deadline" });
  });
});

describe("toolOutcome", () => {
  const base = { blocked: undefined, isError: false, authed: true };
  it.each([
    [{ status: "success" }, base, "ok"],
    [{ status: "success" }, { ...base, blocked: "insufficient_credit" }, "out_of_credit"],
    [{ status: "success" }, { ...base, blocked: "plan_limit" }, "plan_limit"],
    [{ status: "processing" }, base, "processing"],
    [{ status: "error" }, { ...base, isError: true }, "error"],
    [{ status: "error" }, base, "input_rejected"],
    [{ status: "error" }, { ...base, isError: true, authed: false }, "unauthenticated"],
  ] as const)("%o %o → %s", (o, opts, want) => {
    expect(toolOutcome(o, opts)).toBe(want);
  });
});
