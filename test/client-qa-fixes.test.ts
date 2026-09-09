import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { Connection } from "videodb";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { register } from "@/lib/mcp/tool";
import { search } from "@/lib/toolsets/search";
import { indexing } from "@/lib/toolsets/indexing";
import * as sdkClient from "@/lib/videodb/client";
import { call, fakeConnection, toolNamed } from "./harness";

// The installed SDK is CommonJS; mock its Axios instance, not the ESM export.
const require = createRequire(import.meta.url);
const sdkAxios = createRequire(require.resolve("videodb"))("axios");

afterEach(() => vi.restoreAllMocks());

describe("index selection constraints", () => {
  it.each(["query_index", "aggregate_index"])("%s requires one nonempty identifier after null normalization", async (name) => {
    const tool = toolNamed(search, name);
    for (const args of [{}, { index_id: "i", index_name: "n" }, { index_id: null, index_name: null }, { index_id: " " }, { index_name: "" }]) {
      expect(tool.input.safeParse(args).success).toBe(false);
    }
    const route = name === "query_index" ? "query" : "aggregate";
    for (const args of [{ index_id: " i ", index_name: null }, { index_id: null, index_name: " n " }]) {
      const vdb = fakeConnection({ [`POST collection/default/${route}`]: { results: [] } });
      expect((await call(tool, args, vdb)).isError).toBe(false);
      expect(vdb.http.post.mock.calls[0][1]).toMatchObject(args.index_id ? { index_id: "i" } : { index_name: "n" });
    }
  });

  it("requires a scene ID only for legacy scene keyword search", async () => {
    const tool = toolNamed(search, "legacy_search_video");
    const input = { video_id: "m-1", query: "factory", search_type: "keyword", index_type: "scene" };
    for (const scene_index_id of [undefined, null, "", " "]) {
      expect(tool.input.safeParse({ ...input, scene_index_id }).success).toBe(false);
    }
    expect(tool.input.safeParse({ ...input, search_type: "semantic" }).success).toBe(true);
    expect(tool.input.safeParse({ ...input, index_type: "spoken_word" }).success).toBe(true);
    const vdb = fakeConnection({ "GET video/m-1": { id: "m-1", collectionId: "c-1" }, "POST video/m-1/search": { results: [] } });
    expect((await call(tool, { ...input, scene_index_id: " si-1 " }, vdb)).isError).toBe(false);
    expect(vdb.http.post.mock.calls[0][1]).toMatchObject({ scene_index_id: "si-1", search_type: "keyword", index_type: "scene" });
  });

  it("advertises and enforces the constraints through tools/list and tools/call", async () => {
    const vdb = fakeConnection({});
    vi.spyOn(sdkClient, "client").mockReturnValue(vdb);
    const server = new McpServer({ name: "selection-test", version: "1" });
    for (const name of ["query_index", "aggregate_index", "legacy_search_video"]) register(server, toolNamed(search, name));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const pending = new Map<number, (m: any) => void>();
    let id = 0;
    clientTransport.onmessage = (m: any) => pending.get(m.id)?.(m);
    const request = async (method: string, params: Record<string, unknown>) => {
      const requestId = ++id;
      const response = new Promise<any>((resolve) => pending.set(requestId, resolve));
      await clientTransport.send({ jsonrpc: "2.0", id: requestId, method, params }, {
        authInfo: { token: "test", clientId: "test", scopes: [], extra: { videodbApiKey: "test" } },
      });
      try { return await response; } finally { pending.delete(requestId); }
    };
    try {
      await server.connect(serverTransport);
      await clientTransport.start();
      await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
      await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" });
      const list = await request("tools/list", {});
      expect(list.error).toBeUndefined();
      for (const name of ["query_index", "aggregate_index"]) {
        const tool = list.result.tools.find((t: any) => t.name === name);
        expect(tool.description).toContain("exactly one");
        expect(tool.inputSchema.properties.index_id.description).toContain("exactly one");
        expect(tool.inputSchema.properties.index_name.description).toContain("exactly one");
        for (const args of [{}, { index_id: "i", index_name: "n" }]) {
          const result = await request("tools/call", { name, arguments: args });
          expect(JSON.stringify(result)).toContain("Provide exactly one");
          expect(result.result?.isError || Boolean(result.error)).toBe(true);
        }
      }
      const result = await request("tools/call", { name: "legacy_search_video", arguments: { video_id: "m-1", query: "factory", search_type: "keyword", index_type: "scene" } });
      expect(JSON.stringify(result)).toContain("scene_index_id is required");
      expect(vdb.http.get).not.toHaveBeenCalled();
      expect(vdb.http.post).not.toHaveBeenCalled();
    } finally {
      await server.close();
      await clientTransport.close();
    }
  });
});

describe("index collection scope through real SDK HTTP conversion", () => {
  it.each([undefined, "default", "c-real"])("lists and reads the same index with collection_id=%s", async (collection_id) => {
    const request = vi.fn(async (config: any) => {
      if (config.url === "video/m-1") {
        expect(config.params.collection_id).toBe(collection_id ?? "default");
        return { data: { success: true, data: { id: "m-1", collection_id: "c-real" } } };
      }
      expect(config.params.collection_id).toBe("c-real");
      if (config.url === "video/m-1/indexes") {
        return { data: { success: true, data: { indexes: [{ index_id: "idx-1", status: "ready", record_count: 1 }] } } };
      }
      expect(config.url).toBe("video/m-1/indexes/idx-1/records");
      expect(config.params).toEqual({ collection_id: "c-real", limit: 1, cursor: "page-2" });
      return { data: { success: true, data: { records: [{ video_id: "m-1", scene_id: "s-1", start: 0, end: 4, data: { Custom_Key: "untouched" } }], next_cursor: "page-3" } } };
    });
    vi.spyOn(sdkAxios, "create").mockReturnValue({ request });
    const vdb = new Connection("https://api.test", { apiKey: "test" });
    const scope = { video_id: "m-1", ...(collection_id ? { collection_id } : {}) };
    const listed = await call(toolNamed(indexing, "list_indexes"), scope, vdb);
    expect(listed.isError).toBe(false);
    expect(listed.data).toMatchObject([{ index_id: "idx-1", record_count: 1 }]);
    const read = await call(toolNamed(indexing, "get_index_records"), { ...scope, index_id: "idx-1", limit: 1, cursor: "page-2" }, vdb);
    expect(read.isError).toBe(false);
    expect(read.data).toMatchObject({ records: [{ scene_id: "s-1", start: 0, end: 4 }], next_cursor: "page-3" });
    expect(request).toHaveBeenCalledTimes(4);
  });

  it.each([new Error("Access denied"), { id: "m-1", collectionId: "c-other" }, { id: "m-1" }])("does not read records after a denied or inconsistent video lookup", async (response) => {
    const vdb = fakeConnection({ "GET video/m-1": response });
    const result = await call(toolNamed(indexing, "get_index_records"), { video_id: "m-1", collection_id: "c-real", index_id: "idx-1" }, vdb);
    expect(result.isError).toBe(true);
    expect(vdb.http.get).toHaveBeenCalledTimes(1);
    expect(vdb.http.get.mock.calls[0][0]).toEqual(["video", "m-1"]);
  });
});
