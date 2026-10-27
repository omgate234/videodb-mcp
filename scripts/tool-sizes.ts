/**
 * Serialized tools/list bytes per tool, the number ChatGPT's plugin budget is
 * measured on (8 KB/tool, 64 KB total, ~1.5× our raw bytes).
 *   npx tsx scripts/tool-sizes.ts                     # full catalog, report only
 *   npx tsx scripts/tool-sizes.ts --profile openai    # exits 1 over 4,500 B/tool or 40,000 B total
 */
import { z } from "zod";
import { TOOLSETS } from "@/lib/mcp/registry";
import { annotationsFor, type ToolDef } from "@/lib/mcp/tool";
import { OPENAI_PROFILE } from "@/lib/mcp/profiles";

export const PER_TOOL_BUDGET = 4_500;
export const TOTAL_BUDGET = 40_000;

export function specBytes(t: ToolDef<any>): number {
  const spec = {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: z.toJSONSchema(t.input, { io: "input", unrepresentable: "any" }),
    annotations: { title: t.title, ...annotationsFor(t) },
  };
  return JSON.stringify(spec).length;
}

const isCli = process.argv[1]?.endsWith("tool-sizes.ts");
const profile = process.argv.includes("--profile") ? process.argv[process.argv.indexOf("--profile") + 1] : undefined;
const tools = profile === "openai" ? OPENAI_PROFILE : profile ? (() => { throw new Error(`Unknown profile ${profile}`); })() : TOOLSETS.flatMap((t) => t.tools);

if (isCli) report(tools, profile);

function report(tools: ToolDef<any>[], profile: string | undefined) {
const rows = tools.map((t) => ({ name: t.name, kind: t.kind, bytes: specBytes(t) })).sort((a, b) => b.bytes - a.bytes);
const total = rows.reduce((n, r) => n + r.bytes, 0);
for (const r of rows) console.log(`${String(r.bytes).padStart(6)}  ${r.kind.padEnd(11)} ${r.name}`);
console.log(`\n${rows.length} tools, ${total} bytes`);

if (profile) {
  const over = rows.filter((r) => r.bytes > PER_TOOL_BUDGET).map((r) => `${r.name} (${r.bytes})`);
  const fail = over.length > 0 || total > TOTAL_BUDGET;
  if (over.length) console.error(`over ${PER_TOOL_BUDGET} B/tool: ${over.join(", ")}`);
  if (total > TOTAL_BUDGET) console.error(`over ${TOTAL_BUDGET} B total`);
  process.exit(fail ? 1 : 0);
}
}
