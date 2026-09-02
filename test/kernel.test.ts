import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, ANNOTATIONS } from "@/lib/mcp/tool";
import { allTools, TOOLSETS, enabledToolsets } from "@/lib/mcp/registry";
import { toPlain, cap } from "@/lib/videodb/serialize";
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
