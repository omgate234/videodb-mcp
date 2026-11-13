/** Next runs this once at boot. Tracing starts only when an OTLP endpoint is configured. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_SDK_DISABLED === "true") return;
  try {
    const { startOtel } = await import("./lib/otel/sdk");
    startOtel();
  } catch (e) {
    console.warn("otel: could not start tracing:", e instanceof Error ? e.message : e);
  }
}
