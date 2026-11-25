import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/mcp/robot/route";
import { GET as metadata } from "@/app/.well-known/oauth-protected-resource/mcp/robot/route";
import { mintAccessToken, resourceAllowed } from "@/lib/oauth";
import { allTools, enabledToolsets } from "@/lib/mcp/registry";
import { INSTRUCTIONS, OPENAI_INSTRUCTIONS, ROBOT_INSTRUCTIONS } from "@/lib/mcp/instructions";
import { director } from "@/lib/toolsets/director";

const ORIGIN = "https://mcp.videodb.io";
function request(method: string, bearer?: string) {
  return new Request(ORIGIN + "/mcp/robot", {
    method: "POST",
    headers: { host: "mcp.videodb.io", "content-type": "application/json",
      accept: "application/json, text/event-stream", ...(bearer ? { authorization: "Bearer " + bearer } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
  });
}
beforeEach(() => vi.stubEnv("AUTH_SECRET", "test-secret-test-secret-test-secret"));
afterEach(() => vi.unstubAllEnvs());

it("challenges with the robot resource metadata", async () => {
  const res = await POST(request("tools/list"));
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource/mcp/robot");
});

it("advertises the robot resource under the shared OAuth server", async () => {
  const req = request("tools/list");
  expect(resourceAllowed(req, ORIGIN + "/mcp/robot")).toBe(true);
  expect(await (await metadata(req)).json()).toMatchObject({
    resource: ORIGIN + "/mcp/robot", authorization_servers: [ORIGIN],
  });
});

it.each(["/mcp/robot", "/mcp"])("lists only dataset tools with a shared-auth %s token", async (path) => {
  const bearer = mintAccessToken({ key: "k", user_id: "u", client_id: "c", scope: "videodb", aud: ORIGIN + path });
  const res = await POST(request("tools/list", bearer));
  expect(res.status).toBe(200);
  const text = await res.text();
  const payload = res.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(text.split("\n").find(line => line.startsWith("data: "))!.slice(6))
    : JSON.parse(text);
  expect(payload.result.tools.map((t: { name: string }) => t.name).sort())
    .toEqual(director.tools.map(t => t.name).sort());
});

it("rejects tokens for a different origin", async () => {
  const bearer = mintAccessToken({ key: "k", client_id: "c", scope: "videodb", aud: "https://other.example/mcp/robot" });
  expect((await POST(request("tools/list", bearer))).status).toBe(401);
});

it("keeps dataset tools and instructions out of the normal MCP", () => {
  vi.stubEnv("DIRECTOR_SEARCH_URL", "https://search.test/internal/v1/director");
  vi.stubEnv("DIRECTOR_SEARCH_KEY", "configured");
  for (const setting of ["", "all"]) {
    const names = allTools(enabledToolsets(setting)).map(t => t.name);
    for (const tool of director.tools) expect(names).not.toContain(tool.name);
  }
  expect(INSTRUCTIONS).not.toContain("dataset_search");
  expect(OPENAI_INSTRUCTIONS).not.toContain("dataset_search");
  expect(ROBOT_INSTRUCTIONS).toContain("dataset_search");
});
