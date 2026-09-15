import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AuthenticationError, InvalidRequestError } from "videodb";
import { defineTool, run, settleError } from "@/lib/mcp/tool";
import { StillProcessing } from "@/lib/videodb/deadline";
import { enabled, recordToolCall, toPayload, userKey } from "@/lib/telemetry";
import { mintClientId } from "@/lib/oauth";
import { fakeConnection } from "./harness";

const tool = (handler: () => Promise<unknown>) =>
  defineTool({ name: "probe", title: "Probe", description: "telemetry outcome probe for tests", kind: "read", input: z.object({}), handler });

describe("outcome classification", () => {
  it("success carries no error", async () => {
    const { outcome } = await run(tool(async () => ({ id: "m-1" })), {}, fakeConnection());
    expect(outcome).toEqual({ status: "success" });
  });

  it("a thrown error is an error with its class, message and upstream status", async () => {
    const err = new InvalidRequestError({ status: 404, statusText: "Not Found", data: {} } as never, { cause: "no such video" } as never);
    const { result, outcome } = await run(tool(async () => { throw err; }), {}, fakeConnection());
    expect(result.isError).toBe(true);
    expect(outcome.status).toBe("error");
    expect(outcome.errorType).toBe("InvalidRequestError");
    expect(outcome.httpStatus).toBe(404);
    expect(outcome.errorMessage).toContain("no such video");
  });

  it("a bad credential is an error, not a crash", () => {
    const { outcome } = settleError(new AuthenticationError("nope" as never), tool(async () => 1));
    expect(outcome.status).toBe("error");
    expect(outcome.errorType).toBe("AuthenticationError");
  });

  it("deadline and gateway timeouts are processing, not failures", () => {
    const def = tool(async () => 1);
    expect(settleError(new StillProcessing("x"), def).outcome).toEqual({ status: "processing", errorType: "deadline" });
    const gw = new InvalidRequestError({ status: 504, statusText: "Gateway Timeout", data: {} } as never, { cause: "" } as never);
    const settled = settleError(gw, def);
    expect(settled.outcome).toEqual({ status: "processing", errorType: "gateway", httpStatus: 504 });
    expect(settled.result.isError).toBeUndefined();
  });
});

describe("payload", () => {
  it("names the caller by key hash and email, never by the key", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-test-secret-test-secret");
    const clientId = mintClientId(["https://c/cb"], "Claude");
    const p = toPayload({
      tool: "get_video",
      toolset: "media",
      kind: "read",
      args: { video_id: "m-1" },
      result: { content: [{ type: "text", text: JSON.stringify({ id: "m-1" }) }] },
      outcome: { status: "success" },
      latencyMs: 12.6,
      apiKey: "sk-secret",
      email: "ada@example.com",
      clientId,
    });
    expect(p).toMatchObject({
      tool: "get_video",
      toolset: "media",
      kind: "read",
      status: "success",
      latency_ms: 13,
      arguments: { video_id: "m-1" },
      result: { id: "m-1" },
      error: null,
      user_key: userKey("sk-secret"),
      user_email: "ada@example.com",
      client: "Claude",
    });
    expect(JSON.stringify(p)).not.toContain("sk-secret");
    vi.unstubAllEnvs();
  });

  it("puts the failure in error and drops the result text", () => {
    const p = toPayload({
      tool: "delete_video",
      kind: "destructive",
      args: {},
      result: { content: [{ type: "text", text: "Error: boom" }], isError: true },
      outcome: { status: "error", errorType: "Error", errorMessage: "boom", httpStatus: 500 },
      latencyMs: 1,
    });
    expect(p.result).toBeNull();
    expect(p.error).toEqual({ type: "Error", message: "boom", http_status: 500 });
    expect(p.user_key).toBeNull();
  });

  it("bounds oversized blobs instead of shipping them", () => {
    const big = "x".repeat(40_000);
    const p = toPayload({
      tool: "t",
      kind: "read",
      args: { blob: big },
      result: { content: [{ type: "text", text: JSON.stringify({ blob: big }) }] },
      outcome: { status: "success" },
      latencyMs: 1,
    });
    expect((p.arguments as any).__truncated__).toBe(true);
    expect((p.result as any).__truncated__).toBe(true);
    expect(JSON.stringify(p).length).toBeLessThan(10_000);
  });
});

describe("recordToolCall", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const record = () =>
    recordToolCall({
      tool: "t",
      kind: "read",
      args: {},
      result: { content: [{ type: "text", text: "{}" }] },
      outcome: { status: "success" },
      latencyMs: 1,
    });

  it("is a no-op without both env vars", () => {
    vi.stubEnv("TELEMETRY_URL", "https://o.example");
    vi.stubEnv("TELEMETRY_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(enabled()).toBe(false);
    record();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("swallows a record that cannot be built", () => {
    vi.stubEnv("TELEMETRY_URL", "https://o.example");
    vi.stubEnv("TELEMETRY_KEY", "svc");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic; // JSON.stringify throws
    expect(() =>
      recordToolCall({ tool: "t", kind: "read", args: cyclic, result: { content: [] }, outcome: { status: "success" }, latencyMs: 1 })
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it("POSTs to /v1/mcp/calls with the bearer key and never throws on failure", async () => {
    vi.stubEnv("TELEMETRY_URL", "https://o.example/");
    vi.stubEnv("TELEMETRY_KEY", "svc");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => record()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://o.example/v1/mcp/calls",
      expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer svc" }) })
    );
  });
});
