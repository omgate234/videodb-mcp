import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { director } from "@/lib/toolsets/director";
import { call, fakeConnection, toolNamed } from "./harness";

const BASE = "https://search.test/api";
const USER = { "GET user": { user_id: "u-alice", user_email: "a@x.io" } };
const fetchMock = vi.fn();

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  vi.stubEnv("DIRECTOR_SEARCH_URL", BASE + "/");
  vi.stubEnv("DIRECTOR_SEARCH_KEY", "k".repeat(32));
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const sent = () => {
  const [url, init] = fetchMock.mock.calls[0];
  return { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
};

describe("director toolset", () => {
  it("forwards dataset_search with the shared key and the caller's own user id", async () => {
    fetchMock.mockReturnValue(reply(200, { session_id: "s-1", msg_id: "m-1", status: "running" }));
    const vdb = fakeConnection(USER);
    const { data, isError } = await call(toolNamed(director, "dataset_search"), { message: "kitchens" }, vdb);
    expect(isError).toBe(false);
    expect(data).toMatchObject({ msg_id: "m-1", status: "running" });
    expect(vdb.http.get).toHaveBeenCalledWith(["user"], undefined, { convert: false });
    expect(sent()).toMatchObject({
      url: `${BASE}/search`, method: "POST", body: { message: "kitchens" },
      headers: { "X-Internal-Key": "k".repeat(32), "X-VideoDB-User": "u-alice" },
    });
  });

  it("maps each tool onto its route", async () => {
    const cases: [string, Record<string, unknown>, string, string, unknown][] = [
      ["get_search_status", { msg_id: "m/1" }, "GET", "/search/m%2F1", undefined],
      ["get_result_set", { content_id: "srs-1" }, "GET", "/result-sets/srs-1", undefined],
      ["list_result_shots", { content_id: "srs-1", where: { tier: "confirmed" } }, "POST", "/result-sets/srs-1/shots",
        { where: { tier: "confirmed" }, sort: "score", order: "desc", limit: 100 }],
      ["stream_result_shot", { content_id: "srs-1", video_id: "m-1", start: 1, end: 2 }, "POST", "/result-sets/srs-1/stream",
        { video_id: "m-1", start: 1, end: 2, pad: 0 }],
      ["export_result_set", { content_id: "srs-1", formats: ["mcap"] }, "POST", "/result-sets/srs-1/export",
        { formats: ["mcap"], fps: 5, mcap_profile: "foxglove", offset: 0 }],
      ["export_result_set", { content_id: "srs-1", formats: ["lerobot"], offset: 200, limit: 25 }, "POST", "/result-sets/srs-1/export",
        { formats: ["lerobot"], fps: 5, mcap_profile: "foxglove", offset: 200, limit: 25 }],
      ["get_export_status", { export_id: "a".repeat(32), portable: true }, "GET", `/exports/${"a".repeat(32)}?portable=true`, undefined],
    ];
    for (const [name, args, method, path, body] of cases) {
      fetchMock.mockReset().mockReturnValue(reply(200, { ok: true }));
      const { isError } = await call(toolNamed(director, name), args, fakeConnection(USER));
      expect(isError, name).toBe(false);
      expect(sent(), name).toMatchObject({ url: BASE + path, method });
      expect(sent().body, name).toEqual(body);
    }
  });

  it("returns the service's message as a tool error", async () => {
    fetchMock.mockReturnValue(reply(404, { error: "No result set with that id" }));
    const { data, isError } = await call(toolNamed(director, "get_result_set"), { content_id: "srs-9" }, fakeConnection(USER));
    expect(isError).toBe(true);
    expect(String(data)).toContain("No result set with that id");
  });

  it("refuses to forward without a resolved user", async () => {
    const { isError } = await call(toolNamed(director, "get_result_set"), { content_id: "srs-1" }, fakeConnection({ "GET user": {} }));
    expect(isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a tool error, not a crash, when unconfigured", async () => {
    vi.stubEnv("DIRECTOR_SEARCH_KEY", "");
    const { data, isError } = await call(toolNamed(director, "get_result_set"), { content_id: "srs-1" }, fakeConnection(USER));
    expect(isError).toBe(true);
    expect(String(data)).toContain("not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
