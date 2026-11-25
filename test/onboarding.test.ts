import { describe, expect, it } from "vitest";
import { allTools, enabledToolsets } from "@/lib/mcp/registry";
import { onboarding } from "@/lib/toolsets/onboarding";
import { call, fakeConnection, toolNamed } from "./harness";

describe("onboarding", () => {
  it("returns guidance without accessing or modifying the account", async () => {
    const vdb = fakeConnection();
    const tool = toolNamed(onboarding, "onboarding");
    const { data, isError } = await call(tool, {}, vdb);
    expect(isError).toBe(false);
    expect(tool.kind).toBe("read");
    expect(data).toEqual(expect.any(String));
    for (const method of Object.values(vdb.http)) expect(method).not.toHaveBeenCalled();
    // Every named tool in the guide must exist in the server catalog.
    const references = (data as string).match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [];
    const names = new Set(allTools().map((t) => t.name));
    for (const name of references.filter((n) => /^(get|list|search|ask|upload|generate|create|compile|render|download|translate|reframe|understand|add|query|aggregate|legacy)_/.test(n))) {
      expect(names.has(name), `Unknown tool in guide: ${name}`).toBe(true);
    }
  });

  it("is discoverable by default and respects deployment toolset selection", () => {
    expect(allTools(enabledToolsets("")).map((t) => t.name)).toContain("onboarding");
    expect(allTools(enabledToolsets("onboarding")).map((t) => t.name)).toEqual(["onboarding", "get_job_result", "submit_feedback"]);
    expect(allTools(enabledToolsets("media")).map((t) => t.name)).not.toContain("onboarding");
  });
});
