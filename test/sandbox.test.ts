import { describe, expect, it } from "vitest";
import { sandbox } from "@/lib/toolsets/sandbox";
import { call, fakeConnection, toolNamed } from "./harness";

const SB = {
  sandboxId: "sb-1",
  tier: "small",
  status: "provisioning",
  name: "detect",
  models: ["rtdetr-v2-r50vd"],
  modelCategories: ["object_detection"],
  region: "us-east-1",
  createdAt: "2026-09-10T00:00:00Z",
};
const SB_OUT = {
  id: "sb-1",
  tier: "small",
  status: "provisioning",
  name: "detect",
  models: ["rtdetr-v2-r50vd"],
  model_categories: ["object_detection"],
  region: "us-east-1",
  created_at: "2026-09-10T00:00:00Z",
};
const t = (name: string) => toolNamed(sandbox, name);

describe("sandbox", () => {
  it("create_sandbox posts the SDK's argument order and never waits for ready", async () => {
    let posted: any;
    const vdb = fakeConnection({
      "POST sandbox": (body: any) => {
        posted = body;
        return SB;
      },
    });
    const { data, isError } = await call(
      t("create_sandbox"),
      { tier: "small", name: "detect", models: ["rtdetr-v2-r50vd"], model_categories: ["object_detection"], callback_url: "https://hook.test/sb" },
      vdb
    );
    expect(isError, String(data)).toBe(false);
    expect(posted).toEqual({
      tier: "small",
      name: "detect",
      callback_url: "https://hook.test/sb",
      model_categories: ["object_detection"],
      models: ["rtdetr-v2-r50vd"],
    });
    // One request: waitForReady would have polled GET sandbox/sb-1 for up to 300s.
    expect(vdb.http.get).not.toHaveBeenCalled();
    expect(data).toEqual({ ...SB_OUT, poll_with: "get_sandbox", message: expect.stringContaining("active") });
  });

  it("create_sandbox defaults the tier to small and validates the enums", () => {
    const parsed = t("create_sandbox").input.parse({});
    expect(parsed.tier).toBe("small");
    expect(t("create_sandbox").input.safeParse({ tier: "large" }).success).toBe(false);
    expect(t("create_sandbox").input.safeParse({ model_categories: ["captioning"] }).success).toBe(false);
    // Model names are free strings: the catalog carries entries the SDK enum omits.
    expect(t("create_sandbox").input.safeParse({ models: ["rtdetr-v2-r50vd"] }).success).toBe(true);
  });

  it("get_sandbox trims the record", async () => {
    const vdb = fakeConnection({ "GET sandbox/sb-1": { ...SB, status: "active" } });
    const { data } = await call(t("get_sandbox"), { sandbox_id: "sb-1" }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["sandbox", "sb-1"]);
    expect(data).toEqual({ ...SB_OUT, status: "active" });
  });

  it("list_sandboxes forwards the status filter and paging", async () => {
    const vdb = fakeConnection({ "GET sandbox": { sandboxes: [SB] } });
    const { data } = await call(t("list_sandboxes"), { status: "active", page: 2, page_size: 50 }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["sandbox"], { params: { page: 2, page_size: 50, status: "active" } });
    expect(data).toEqual({ sandboxes: [SB_OUT] });
  });

  it("stop_sandbox is destructive, sends grace, and re-reads the status the SDK drops", async () => {
    let stopBody: any;
    let gets = 0;
    const vdb = fakeConnection({
      "GET sandbox/sb-1": () => (gets++ === 0 ? { ...SB, status: "active" } : { ...SB, status: "stopping" }),
      "POST sandbox/sb-1/stop": (body: any) => {
        stopBody = body;
        // The API answers {success, data}; Sandbox.stop() reads res.data.data, so
        // without the refresh the tool would report the pre-stop status.
        return { ...SB, status: "stopping" };
      },
    });
    const tool = t("stop_sandbox");
    expect(tool.kind).toBe("destructive");
    const { data, isError } = await call(tool, { sandbox_id: "sb-1", grace: false }, vdb);
    expect(isError, String(data)).toBe(false);
    expect(stopBody).toEqual({ grace: false });
    expect(data).toEqual({ ...SB_OUT, status: "stopping", poll_with: "get_sandbox" });
  });
});
