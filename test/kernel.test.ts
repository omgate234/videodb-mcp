import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool, ANNOTATIONS, annotationsFor } from "@/lib/mcp/tool";
import { allTools, TOOLSETS, enabledToolsets } from "@/lib/mcp/registry";
import { toPlain, cap } from "@/lib/videodb/serialize";
import { asAccountBlocked, describeError, withPromoLink } from "@/lib/videodb/errors";
import { InvalidRequestError } from "videodb";
import { withDeadline, StillProcessing } from "@/lib/videodb/deadline";
import { call, fakeConnection } from "./harness";

describe("registry", () => {
  it("has unique, valid tool names with annotations", () => {
    const tools = allTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(t.name.length).toBeLessThanOrEqual(64);
      expect(t.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(ANNOTATIONS[t.kind]).toBeDefined();
      expect(t.title).toBeTruthy();
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it("marks exactly the outward-reaching tools open-world", () => {
    const openWorld = allTools().filter((t) => annotationsFor(t).openWorldHint).map((t) => t.name).sort();
    expect(openWorld).toEqual([
      "connect_rtstream",
      "create_collection",
      "create_index",
      "create_rtstream_alert",
      "create_sandbox",
      "reframe_video",
      "set_rtstream_alert_status",
      "set_rtstream_status",
      "transcode_media",
      "translate_transcript",
      "understand_video",
      "update_collection",
      "upload_media",
    ]);
  });

  it("points every retryWith at a real read tool", () => {
    const byName = new Map(allTools().map((t) => [t.name, t]));
    for (const t of allTools()) {
      if (!t.retryWith) continue;
      const target = byName.get(t.retryWith);
      expect(target, `${t.name} retryWith → unknown tool ${t.retryWith}`).toBeDefined();
      expect(target!.kind, `${t.name} retryWith → ${t.retryWith} must be a read tool`).toBe("read");
    }
  });

  it("gates toolsets by env", () => {
    expect(enabledToolsets("").every((t) => t.defaultEnabled)).toBe(true);
    expect(enabledToolsets("all")).toHaveLength(TOOLSETS.length);
    expect(enabledToolsets("media,search").map((t) => t.name)).toEqual(["media", "search", "jobs", "feedback"]); // jobs reads what the others start; feedback is always offered
    expect(() => enabledToolsets("nope")).toThrow(/Unknown toolset/);
  });
});

describe("serialize", () => {
  it("flattens SDK-like objects to snake_case and derives player_url", () => {
    class Fake {
      id = "m-1";
      streamUrl = "https://s/x.m3u8";
      getVideos = async () => [];
      transcript = undefined;
      nested = { wordTimestamps: [{ start: 1 }] };
    }
    const out = toPlain(new Fake()) as Record<string, unknown>;
    expect(out).toEqual({
      id: "m-1",
      stream_url: "https://s/x.m3u8",
      player_url: expect.stringContaining("console.videodb.io/player?url="),
      nested: { word_timestamps: [{ start: 1 }] },
    });
  });

  it("breaks cycles", () => {
    const a: any = { id: 1 };
    a.parent = { child: a };
    expect(toPlain(a)).toEqual({ id: 1, parent: {} });
  });
});

describe("cap", () => {
  it("passes short lists through untouched", () => {
    expect(cap([1, 2], "items", 5)).toEqual({ items: [1, 2] });
  });

  it("truncates with a uniform truncated/total contract regardless of key", () => {
    expect(cap([1, 2, 3], "records", 2)).toEqual({ records: [1, 2], truncated: true, total: 3 });
    expect(cap([1, 2, 3], "shots", 2)).toEqual({ shots: [1, 2], truncated: true, total: 3 });
  });
});

describe("deadline + invoke", () => {
  it("returns a processing result instead of an error on timeout", async () => {
    const slow = defineTool({
      name: "slow_tool",
      title: "Slow",
      description: "never finishes in time for this test",
      kind: "create",
      input: z.object({}),
      retryWith: "get_thing",
      handler: () => new Promise(() => {}),
    });
    await expect(withDeadline(slow.handler({}, fakeConnection()), "x", { ms: 10 })).rejects.toBeInstanceOf(StillProcessing);
  });

  it("maps thrown errors to isError results", async () => {
    const bad = defineTool({
      name: "bad_tool",
      title: "Bad",
      description: "always throws for this test case",
      kind: "read",
      input: z.object({}),
      handler: async () => {
        throw new Error("boom");
      },
    });
    const res = await call(bad, {}, fakeConnection());
    expect(res.isError).toBe(true);
    expect(res.data).toBe("Error: boom");
  });

  it("rejects bad tool names", () => {
    expect(() => defineTool({ name: "BadName", title: "", description: "", kind: "read", input: z.object({}), handler: async () => 1 })).toThrow();
  });
});

describe("describeError", () => {
  it("surfaces the API's message and status from the SDK's nested cause", () => {
    // The SDK builds this exact shape: new InvalidRequestError(response, { cause: apiMessage }).
    const err = new InvalidRequestError({ status: 403, statusText: "Forbidden", data: {} } as never, {
      cause: "Given collection id not found in your account",
    } as never);
    expect(describeError(err)).toBe(
      "VideoDB rejected the request (HTTP 403): Given collection id not found in your account"
    );
  });

  it("falls back to the response body when no cause is set", () => {
    const err = new InvalidRequestError({ status: 404, statusText: "Not Found", data: { message: "Session not found" } } as never);
    expect(describeError(err)).toBe("VideoDB rejected the request (HTTP 404): Session not found");
  });
});

describe("gateway timeouts", () => {
  // The SDK wraps any non-401 HTTP failure as InvalidRequestError(response, { cause }).
  const apiError = (status: number, message: string) =>
    new InvalidRequestError({ status, statusText: "", data: {} } as never, { cause: message } as never);

  const failingTool = (err: Error, retryWith?: string) =>
    defineTool({
      name: "export_recording",
      title: "Export recording",
      description: "a long write whose request dies at the API gateway in this test",
      kind: "create",
      input: z.object({}),
      retryWith,
      handler: async () => {
        throw err;
      },
    });

  it("turns an upstream 504 into a processing result naming the retry tool", async () => {
    const tool = failingTool(apiError(504, "Endpoint request timed out"), "get_rtstream");
    const res = await call(tool, {}, fakeConnection());
    expect(res.isError).toBe(false);
    expect(res.data).toMatchObject({ status: "processing", retry_with: "get_rtstream" });
    const { message } = res.data as { message: string };
    expect(message).toContain("get_rtstream");
    expect(message).not.toMatch(/succeed|successful/i);
  });

  it("omits retry_with when the tool declares none", async () => {
    const res = await call(failingTool(apiError(504, "Endpoint request timed out")), {}, fakeConnection());
    expect(res.isError).toBe(false);
    expect(res.data).toMatchObject({ status: "processing" });
    expect(res.data).not.toHaveProperty("retry_with");
  });

  it("treats every gateway status the same way", async () => {
    for (const status of [408, 502, 503]) {
      const res = await call(failingTool(apiError(status, "gateway"), "get_rtstream"), {}, fakeConnection());
      expect(res.isError, `HTTP ${status}`).toBe(false);
      expect(res.data).toMatchObject({ status: "processing" });
    }
  });

  it("returns a 400 as a rejected-input result carrying the API's message", async () => {
    const res = await call(failingTool(apiError(400, "Invalid start time"), "get_rtstream"), {}, fakeConnection());
    expect(res.isError).toBe(false);
    expect(res.data).toMatchObject({ status: "rejected", http_status: 400, action_required: "fix_arguments" });
    expect((res.data as { message: string }).message).toMatch(/^Invalid start time/);
  });

  it("keeps an ambiguous 500 a hard failure", async () => {
    const res = await call(failingTool(apiError(500, "Internal server error"), "get_rtstream"), {}, fakeConnection());
    expect(res.isError).toBe(true);
    expect(res.data).toBe("Error: VideoDB rejected the request (HTTP 500): Internal server error");
  });
});

describe("insufficient credit", () => {
  const apiError = (status: number, message: string) =>
    new InvalidRequestError({ status, statusText: "", data: {} } as never, { cause: message } as never);

  const failingTool = (err: Error) =>
    defineTool({
      name: "upload_media",
      title: "Upload media",
      description: "a billed write that this test fails on the account's credit balance",
      kind: "create",
      input: z.object({}),
      handler: async () => {
        throw err;
      },
    });

  const BALANCE = "Insufficient credit: your balance is $-13.50. Please add credits to continue";

  it("returns the balance message as a result, not an error", async () => {
    const res = await call(failingTool(apiError(400, BALANCE)), {}, fakeConnection());
    expect(res.isError).toBe(false);
    expect(res.data).toMatchObject({ status: "insufficient_credit", action_required: "add_credits" });
    const { message } = res.data as { message: string };
    expect(message).toContain("$-13.50");
    expect(message).toMatch(/add credits/i);
  });

  it("catches a plain job failure carrying the same wording", async () => {
    const res = await call(failingTool(new Error(BALANCE)), {}, fakeConnection());
    expect(res.isError).toBe(false);
    expect(res.data).toMatchObject({ status: "insufficient_credit" });
  });

  it("catches a 402 whatever its wording", async () => {
    const res = await call(failingTool(apiError(402, "Payment required")), {}, fakeConnection());
    expect(res.isError).toBe(false);
    expect(res.data).toMatchObject({ status: "insufficient_credit" });
  });

  it("catches an insufficient_credit error_code whatever the status and wording", async () => {
    const err = apiError(400, "Request refused");
    (err as unknown as { response: { data: Record<string, unknown> } }).response.data = { error_code: "insufficient_credit" };
    const res = await call(failingTool(err), {}, fakeConnection());
    expect(res.data).toMatchObject({ status: "insufficient_credit" });
  });

  it("leaves unrelated failures as errors", async () => {
    const res = await call(failingTool(apiError(500, "Internal server error")), {}, fakeConnection());
    expect(res.isError).toBe(true);
  });

  it("links to the plain console", async () => {
    const res = await call(failingTool(apiError(400, BALANCE)), {}, fakeConnection());
    expect(res.data).toMatchObject({ console_url: "https://console.videodb.io" });
    expect((res.data as { message: string }).message).toMatch(/no subscription is required/);
  });
});

describe("plan limits", () => {
  it.each([
    "You’ve reached the maximum limit for Image generation on your current plan.",
    "Audio is over 2 hours, please reachout to team@videodb.io to increase the quota.",
  ])("classifies %s as plan_limit", (msg) => {
    const blocked = asAccountBlocked(new Error(msg));
    expect(blocked).toMatchObject({ status: "plan_limit", action_required: "contact_support", contact: "team@videodb.io" });
    expect(blocked!.message).toContain(msg);
    expect(blocked!.message).not.toMatch(/\bpro\b|upgrade/i);
  });

  it("leaves Free plan usage limits alone", () => {
    expect(asAccountBlocked(new Error("Free plan usage limit reached: 10 uploads per day. It resets at 2026-11-21 00:00 UTC. Upgrade to Pro to remove this limit."))).toBeUndefined();
  });

  it("leaves the hackathon LLM budget alone", () => {
    expect(asAccountBlocked(new Error("You have reached the Hackathon budget for this model tier (Pro)."))).toBeUndefined();
  });

  it("keeps credit wording on the credit path", () => {
    expect(asAccountBlocked(new Error("Insufficient credit: your balance is $0.00."))?.status).toBe("insufficient_credit");
  });
});

describe("withPromoLink", () => {
  const blocked = asAccountBlocked(new Error("Insufficient credit: your balance is $0.00."))!;
  const cap = (msg: string) => asAccountBlocked(new Error(msg))!;
  const VIDEO_CAP = "You’ve reached the maximum limit for Video generation on your current plan.";
  const PROMO_URL = "https://console.videodb.io/?page=billing&promo=test-promo";
  const plan = (id: string | undefined) => vi.fn(async () => id);

  const withPromo = async (fn: () => Promise<void>) => {
    vi.stubEnv("PRO_PROMO_CODE", "test-promo");
    try {
      await fn();
    } finally {
      vi.unstubAllEnvs();
    }
  };

  it("sends every out-of-credit account to the promo link without mentioning Pro or looking up the plan", () =>
    withPromo(async () => {
      const planOf = plan("Pro_v1");
      const linked = await withPromoLink(blocked, planOf);
      expect(linked.console_url).toBe(PROMO_URL);
      expect(linked.message).toBe(blocked.message);
      expect(JSON.stringify(linked)).not.toMatch(/\bpro\b|upgrade/i);
      expect(planOf).not.toHaveBeenCalled();
    }));

  it("turns a Free account's generation cap into an add-credits result on the promo link", () =>
    withPromo(async () => {
      const linked = await withPromoLink(cap(VIDEO_CAP), plan("Free_v1"));
      expect(linked).toMatchObject({ status: "plan_limit", limit: VIDEO_CAP, action_required: "add_credits", console_url: PROMO_URL });
      expect(linked.message).toMatch(/adding credits lifts it/);
      expect(JSON.stringify(linked)).not.toMatch(/\bpro\b|upgrade/i);
    }));

  it("leaves a Pro account's cap as a support ask", () =>
    withPromo(async () => {
      const limit = cap(VIDEO_CAP);
      expect(await withPromoLink(limit, plan("Pro_v1"))).toBe(limit);
    }));

  it("leaves caps Pro does not raise as a support ask without looking up the plan", () =>
    withPromo(async () => {
      const limit = cap("Audio is over 5 hours, please reachout to team@videodb.io to increase the quota.");
      const planOf = plan("Free_v1");
      expect(await withPromoLink(limit, planOf)).toBe(limit);
      expect(planOf).not.toHaveBeenCalled();
    }));

  it("falls back to the support ask when the plan lookup fails", () =>
    withPromo(async () => {
      const limit = cap(VIDEO_CAP);
      expect(await withPromoLink(limit, () => Promise.reject(new Error("down")))).toBe(limit);
    }));

  it("leaves results alone when no promo is configured", async () => {
    expect(await withPromoLink(blocked, plan("Free_v1"))).toBe(blocked);
    const limit = cap(VIDEO_CAP);
    expect(await withPromoLink(limit, plan("Free_v1"))).toBe(limit);
  });
});
