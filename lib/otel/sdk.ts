import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { detectResources, envDetector, resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { SampledOnlyPropagator, ToolCallSampler } from "@/lib/otel/sampler";

/** Start tracing: tool-call spans plus outbound HTTP, exported over OTLP/HTTP. */
export function startOtel(): void {
  // Endpoint and auth come from OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_EXPORTER_OTLP_HEADERS.
  const exporter = new OTLPTraceExporter();

  const attrs: Record<string, string> = { "service.name": "videodb-mcp", "service.namespace": "mcp", "cloud.provider": "azure" };
  if (process.env.CONTAINER_APP_REPLICA_NAME) attrs["service.instance.id"] = process.env.CONTAINER_APP_REPLICA_NAME;
  // OTEL_RESOURCE_ATTRIBUTES carries deployment.environment.name and service.version.
  const resource = detectResources({ detectors: [envDetector] }).merge(resourceFromAttributes(attrs));

  const provider = new TracerProvider({
    resource,
    sampler: new ToolCallSampler(),
    spanProcessors: [new BatchSpanProcessor({ exporter })],
  });
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new SampledOnlyPropagator());
  trace.setGlobalTracerProvider(provider);

  registerInstrumentations({
    instrumentations: [
      // Not ignoreIncomingRequestHook: that suppresses tracing for the whole request. The sampler drops these spans instead.
      new HttpInstrumentation(),
      new UndiciInstrumentation(),
    ],
  });

  process.once("SIGTERM", () => void provider.shutdown().catch(() => {}));
}
