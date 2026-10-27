import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AuthenticationError, InvalidRequestError } from "videodb";
import { defineTool, run, settleError } from "@/lib/mcp/tool";
import { StillProcessing } from "@/lib/videodb/deadline";
import { enabled, recordSignIn, recordToolCall, signInPayload, toPayload, userKey } from "@/lib/telemetry";
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

  it("an out-of-credit account is not counted as a failure", () => {
    const err = new InvalidRequestError({ status: 400, statusText: "", data: {} } as never, {
      cause: "Insufficient credit: your balance is $-13.50. Please add credits to continue",
    } as never);
    const settled = settleError(err, tool(async () => 1));
    expect(settled.outcome).toEqual({ status: "success" });
    expect(settled.result.isError).toBeUndefined();
    // The result blob is what separates it from a real success in the collector.
    expect(JSON.parse(settled.result.content[0].text)).toMatchObject({ status: "insufficient_credit" });
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
      userId: "u-1",
      userName: "Ada",
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
      user_id: "u-1",
      user_name: "Ada",
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

  it("names the caller from GET /user once per key, in the after-response send", async () => {
    vi.stubEnv("TELEMETRY_URL", "https://o.example");
    vi.stubEnv("TELEMETRY_KEY", "svc");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("/user")
        ? Response.json({ success: true, data: { user_id: "u-1", name: "Ada", email: "ada@example.com" } })
        : new Response(null, { status: 202 })
    );
    const call = () =>
      recordToolCall({ tool: "t", kind: "read", args: {}, result: { content: [] }, outcome: { status: "success" }, latencyMs: 1, apiKey: "sk-cache-test" });
    call();
    await new Promise((r) => setTimeout(r, 0));
    call();
    await new Promise((r) => setTimeout(r, 0));
    const urls = fetchSpy.mock.calls.map(([u]) => String(u));
    expect(urls.filter((u) => u.endsWith("/user"))).toHaveLength(1);
    const posts = fetchSpy.mock.calls.filter(([u]) => String(u).endsWith("/v1/mcp/calls"));
    expect(posts).toHaveLength(2);
    expect(JSON.parse(String(posts[1][1]?.body))).toMatchObject({ user_id: "u-1", user_name: "Ada", user_email: "ada@example.com" });
  });

  it.each([
    ["network failure", () => Promise.reject(new Error("ECONNRESET"))],
    ["5xx", async () => new Response("bad gateway", { status: 502 })],
    ["401", async () => Response.json({ success: false }, { status: 401 })],
    ["non-JSON body", async () => new Response("<html>", { status: 200 })],
    ["wrong field types", async () => Response.json({ data: { user_id: 42, name: null, email: {} } })],
  ])("a failed GET /user (%s) still sends the record with default identity", async (label, userResponse) => {
    vi.stubEnv("TELEMETRY_URL", "https://o.example");
    vi.stubEnv("TELEMETRY_KEY", "svc");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("/user") ? (userResponse as () => Promise<Response>)() : new Response(null, { status: 202 })
    );
    expect(() =>
      recordToolCall({
        tool: "t", kind: "read", args: {}, result: { content: [] }, outcome: { status: "success" }, latencyMs: 1,
        apiKey: `sk-fail-${label}`, email: "sealed@example.com",
      })
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    const posts = fetchSpy.mock.calls.filter(([u]) => String(u).endsWith("/v1/mcp/calls"));
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toMatchObject({
      user_key: userKey(`sk-fail-${label}`), user_id: null, user_name: null, user_email: "sealed@example.com",
    });
  });

  it("does not retry a failed lookup on every call", async () => {
    vi.stubEnv("TELEMETRY_URL", "https://o.example");
    vi.stubEnv("TELEMETRY_KEY", "svc");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
      String(url).endsWith("/user") ? new Response("down", { status: 503 }) : new Response(null, { status: 202 })
    );
    for (let i = 0; i < 3; i++) {
      recordToolCall({ tool: "t", kind: "read", args: {}, result: { content: [] }, outcome: { status: "success" }, latencyMs: 1, apiKey: "sk-backoff" });
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).endsWith("/user"))).toHaveLength(1);
    expect(fetchSpy.mock.calls.filter(([u]) => String(u).endsWith("/v1/mcp/calls"))).toHaveLength(3);
  });
});

describe("recordSignIn", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("posts the sign-in with a normalised account creation time", async () => {
    vi.stubEnv("TELEMETRY_URL", "https://o.example/");
    vi.stubEnv("TELEMETRY_KEY", "k");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
    recordSignIn({ userId: "u-1", email: "a@x.io", clientName: "ChatGPT", accountCreatedAt: "2026-10-23T10:00:00+05:30", signedUp: true });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://o.example/v1/mcp/connections");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      user_id: "u-1",
      user_email: "a@x.io",
      client: "ChatGPT",
      account_created_at: "2026-10-23T04:30:00.000Z",
      signed_up: true,
    });
  });

  it("drops an unparseable creation time and is a no-op when disabled", () => {
    expect(signInPayload({ accountCreatedAt: "nope" })).toMatchObject({ account_created_at: null, signed_up: null });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    recordSignIn({ userId: "u-1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
