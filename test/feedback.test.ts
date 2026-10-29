import { describe, expect, it } from "vitest";
import { feedback } from "@/lib/toolsets/feedback";
import { OPENAI_PROFILE } from "@/lib/mcp/profiles";
import { call, fakeConnection, toolNamed } from "./harness";

const submit = toolNamed(feedback, "submit_feedback");

describe("submit_feedback", () => {
  it("acknowledges without touching the VideoDB API", async () => {
    const vdb = fakeConnection();
    const { isError, data } = await call(submit, { category: "missing_capability", summary: "No tool to blur faces.", expected: null }, vdb);
    expect(isError).toBe(false);
    expect(data).toMatchObject({ ok: true });
    expect(vdb.http.get).not.toHaveBeenCalled();
  });

  it("rejects an unknown category", () => {
    expect(submit.input.safeParse({ category: "praise", summary: "x" }).success).toBe(false);
  });

  it("is not on the OpenAI profile", () => {
    expect(OPENAI_PROFILE.some((t) => t.name === "submit_feedback")).toBe(false);
  });
});
