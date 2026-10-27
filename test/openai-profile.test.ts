import { expect, it } from "vitest";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { registerTools } from "@/lib/mcp/registry";
import { OPENAI_PROFILE } from "@/lib/mcp/profiles";
import { specBytes, PER_TOOL_BUDGET, TOTAL_BUDGET } from "../scripts/tool-sizes";

it("the OpenAI profile lists 25 unique tools within the plugin byte budget", async () => {
  const names = OPENAI_PROFILE.map((t) => t.name);
  expect(new Set(names).size).toBe(names.length);
  expect(names).toHaveLength(25);
  for (const t of OPENAI_PROFILE) expect(specBytes(t), t.name).toBeLessThanOrEqual(PER_TOOL_BUDGET);
  expect(OPENAI_PROFILE.reduce((n, t) => n + specBytes(t), 0)).toBeLessThanOrEqual(TOTAL_BUDGET);

  // Every tool the review test cases name must be present under that exact name.
  for (const n of ["list_assets", "search_video", "generate_transcript", "get_transcript", "add_subtitles", "compile_clips", "upload_media", "get_job_result", "understand_video", "get_understanding", "create_index"]) {
    expect(names).toContain(n);
  }

  const server = new McpServer({ name: "profile-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (message: any) => void>();
  let id = 0;
  clientTransport.onmessage = (message: any) => pending.get(message.id)?.(message);
  const request = async (method: string, params: Record<string, unknown> = {}): Promise<any> => {
    const requestId = ++id;
    const response = new Promise((resolve) => pending.set(requestId, resolve));
    await clientTransport.send({ jsonrpc: "2.0", id: requestId, method, params });
    try { return await response; } finally { pending.delete(requestId); }
  };
  try {
    registerTools(server, OPENAI_PROFILE, "openai");
    await server.connect(serverTransport);
    await clientTransport.start();
    await request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "profile-test", version: "1.0.0" } });
    const listed = await request("tools/list");
    expect(listed.result.tools.map((t: any) => t.name).sort()).toEqual([...names].sort());
  } finally {
    await clientTransport.close();
    await server.close();
  }
});
