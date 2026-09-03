import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, ANNOTATIONS } from "@/lib/mcp/tool";
import { allTools, TOOLSETS, enabledToolsets } from "@/lib/mcp/registry";
import { toPlain, cap } from "@/lib/videodb/serialize";
import { describeError } from "@/lib/videodb/errors";
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
    expect(enabledToolsets("media,search").map((t) => t.name)).toEqual(["media", "search"]);
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

  it("keeps a 400 a hard failure with the API's message", async () => {
    const res = await call(failingTool(apiError(400, "Invalid start time"), "get_rtstream"), {}, fakeConnection());
    expect(res.isError).toBe(true);
    expect(res.data).toBe("Error: VideoDB rejected the request (HTTP 400): Invalid start time");
  });

  it("keeps an ambiguous 500 a hard failure", async () => {
    const res = await call(failingTool(apiError(500, "Internal server error"), "get_rtstream"), {}, fakeConnection());
    expect(res.isError).toBe(true);
    expect(res.data).toBe("Error: VideoDB rejected the request (HTTP 500): Internal server error");
  });
});
