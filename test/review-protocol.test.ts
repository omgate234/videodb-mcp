import { expect, it, vi } from "vitest";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { registerAll } from "@/lib/mcp/registry";
import * as sdkClient from "@/lib/videodb/client";
import { fakeConnection } from "./harness";

it("advertises and validates corrected inputs through MCP tools/list and tools/call", async () => {
  const vdb = fakeConnection({
    "GET video/m-1": { id: "m-1", collectionId: "default" },
    "POST video/m-1/understand": (body: any) => {
      expect(body).toMatchObject({ analyzers: [{ type: "vlm", config: { prompt: "Describe" } }], callback_url: "https://example.com/callback" });
      return { understandingId: "u-1", status: "pending" };
    },
    "GET video/m-1/understand/u-1": { understandingId: "u-1", status: "done", analyzers: [{ id: "an-1", name: "scene", type: "vlm", status: "done" }] },
    "POST video/m-1/indexes": (body: any) => {
      expect(body.fields).toEqual({ semantic: ["description"] });
      return { index_id: "idx-1", status: "building" };
    },
  });
  const clientSpy = vi.spyOn(sdkClient, "client").mockReturnValue(vdb);
  const server = new McpServer({ name: "review-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (message: any) => void>();
  let id = 0;
  clientTransport.onmessage = (message: any) => pending.get(message.id)?.(message);
  const request = async (method: string, params: Record<string, unknown> = {}): Promise<any> => {
    const requestId = ++id;
    const response = new Promise((resolve) => pending.set(requestId, resolve));
    await clientTransport.send({ jsonrpc: "2.0", id: requestId, method, params }, {
      authInfo: { token: "test-token", clientId: "review-test", scopes: [], extra: { videodbApiKey: "test-key" } },
    });
    try { return await response; } finally { pending.delete(requestId); }
  };

  try {
    registerAll(server);
    await server.connect(serverTransport);
    await clientTransport.start();
    const initialized = await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "review-test", version: "1.0.0" } });
    expect(initialized.error).toBeUndefined();
    await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    const listed = await request("tools/list");
    expect(listed.error).toBeUndefined();
    const tools = listed.result.tools;
    expect(tools.some((t: any) => ["index_scenes", "index_spoken_words"].includes(t.name))).toBe(false);
    const analyzerSchema = tools.find((t: any) => t.name === "understand_video").inputSchema.properties.analyzers.items;
    expect(analyzerSchema.properties).toHaveProperty("config");
    expect(analyzerSchema.properties).not.toHaveProperty("prompt");
    expect(analyzerSchema.additionalProperties).toBe(false);

    const args = { video_id: "m-1", analyzers: [{ type: "vlm", config: { prompt: "Describe" } }], segmentation: { type: "shot", threshold: 40 } };
    const invalid = await request("tools/call", { name: "understand_video", arguments: { ...args, callback_url: "bad url" } });
    expect(invalid.result?.isError || Boolean(invalid.error)).toBe(true);
    expect(vdb.http.post).not.toHaveBeenCalled();
    const corrected = await request("tools/call", { name: "understand_video", arguments: { ...args, callback_url: "https://example.com/callback" } });
    expect(corrected.error).toBeUndefined();
    expect(corrected.result.isError).not.toBe(true);
    expect(JSON.parse(corrected.result.content[0].text)).toMatchObject({ accepted: true, understanding_id: "u-1" });

    const indexed = await request("tools/call", { name: "create_index", arguments: { video_id: "m-1", understanding_id: "u-1", analyzer_name: "", analyzer_id: "an-1", fields: { semantic: ["description"] } } });
    expect(indexed.error).toBeUndefined();
    expect(indexed.result.isError).not.toBe(true);
    expect(JSON.parse(indexed.result.content[0].text)).toMatchObject({ index_id: "idx-1" });
  } finally {
    await server.close();
    await clientTransport.close();
    clientSpy.mockRestore();
  }
});
