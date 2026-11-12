import { trace, TraceFlags, isSpanContextValid, type Context } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { SamplingDecision, type Sampler, type SamplingResult } from "@opentelemetry/sdk-trace";

export const TOOL_SPAN = "mcp.tool.call";

const sampled = (ctx: Context) => {
  const sc = trace.getSpanContext(ctx);
  return Boolean(sc && isSpanContextValid(sc) && sc.traceFlags & TraceFlags.SAMPLED);
};

/** Keep tool-call traces only; handshakes, OAuth and discovery roots are dropped. Children follow their parent. */
export class ToolCallSampler implements Sampler {
  shouldSample(ctx: Context, _traceId: string, name: string): SamplingResult {
    const parent = trace.getSpanContext(ctx);
    if (parent && isSpanContextValid(parent) && !parent.isRemote) {
      return { decision: sampled(ctx) ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD };
    }
    return { decision: name === TOOL_SPAN ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD };
  }

  toString() {
    return "ToolCallSampler";
  }
}

/** W3C traceparent, sent only from sampled spans so a dropped request never tells upstream to drop its trace. */
export class SampledOnlyPropagator extends W3CTraceContextPropagator {
  override inject(...args: Parameters<W3CTraceContextPropagator["inject"]>): void {
    if (sampled(args[0])) super.inject(...args);
  }
}
