import { afterEach, expect, it, vi } from "vitest";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { registerEditorApp } from "@/lib/apps/editor";

const ENV = { VIDEODB_EDITOR_APP_URL: "https://fe.test/mcp-app/editor.json", VIDEODB_EDITOR_API_URL: "https://director.test" };

afterEach(() => vi.unstubAllGlobals());

async function connect(fetchImpl: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: URL | string, init?: RequestInit) => {
    const body = fetchImpl(String(url), init);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
  }));
  const server = new McpServer({ name: "editor-test", version: "1.0.0" });
  await registerEditorApp(server, ENV as any);
  const [client, transport] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (m: any) => void>();
  let id = 0;
  client.onmessage = (m: any) => pending.get(m.id)?.(m);
  const request = async (method: string, params: Record<string, unknown> = {}): Promise<any> => {
    const requestId = ++id;
    const reply = new Promise((resolve) => pending.set(requestId, resolve));
    await client.send({ jsonrpc: "2.0", id: requestId, method, params }, {
      authInfo: { token: "t", clientId: "c", scopes: [], extra: { videodbApiKey: "sk-user" } },
    } as any);
    return reply;
  };
  await server.connect(transport);
  await client.start();
  await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return request;
}

const manifest = (url: string) =>
  url.endsWith("editor.json") ? { html: "editor.html", csp: { connectDomains: ["https://stream.test"] } } : url.endsWith("editor.html") ? "<html>v1</html>" : null;

it("serves the bundle under a content-versioned URI that the tool points at", async () => {
  const request = await connect(manifest);
  const tools = (await request("tools/list")).result.tools;
  const open = tools.find((t: any) => t.name === "open_video_editor");
  const uri = open._meta.ui.resourceUri;
  expect(uri).toMatch(/^ui:\/\/videodb\/editor\/[0-9a-f]{12}$/);
  expect(tools.find((t: any) => t.name === "editor_api")._meta.ui.visibility).toEqual(["app"]);

  const read = (await request("resources/read", { uri })).result.contents[0];
  expect(read.text).toBe("<html>v1</html>");
  expect(read._meta.ui.csp.connectDomains).toEqual(["https://stream.test"]);
});

it("update_editor_timeline writes through the gated route with the caller's key", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const request = await connect((url, init) => {
    if (url.startsWith("https://director.test")) {
      calls.push({ url, init });
      return { message: "Timeline updated to revision 4.", revision: 4, healed: [] };
    }
    return manifest(url);
  });
  const tracks = [{ id: "t-1", clips: [{ id: "c-1", start: 0, duration: 5 }] }];
  const res = (await request("tools/call", { name: "update_editor_timeline", arguments: { timeline_id: "tl-1", revision: 3, tracks } })).result;

  expect(res.isError).toBeFalsy();
  expect(JSON.parse(res.content[0].text).revision).toBe(4);
  expect(calls[0].url).toBe("https://director.test/editor/tl-1/tracks");
  expect(calls[0].init?.method).toBe("PUT");
  expect((calls[0].init?.headers as Record<string, string>)["x-access-token"]).toBe("sk-user");
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({ revision: 3, tracks });
});

it("skips the app entirely when the manifest is unreachable", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
  vi.resetModules(); // drop the bundle cached by the earlier tests
  const { registerEditorApp } = await import("@/lib/apps/editor");
  const server = new McpServer({ name: "editor-test", version: "1.0.0" });
  const registerTool = vi.spyOn(server, "registerTool");
  await registerEditorApp(server, { ...ENV, VIDEODB_EDITOR_APP_URL: "https://fe.test/missing.json" } as any);
  expect(registerTool).not.toHaveBeenCalled();
});
