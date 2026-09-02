/**
 * Print the tool catalog. Asserts unique names, ≤64 chars, snake_case.
 *   npx tsx scripts/list-tools.ts            # markdown table
 *   npx tsx scripts/list-tools.ts --json     # machine-readable
 */
import { TOOLSETS, allTools } from "@/lib/mcp/registry";

const json = process.argv.includes("--json");
allTools(); // throws on duplicates

if (json) {
  console.log(JSON.stringify(TOOLSETS.map((t) => ({ ...t, tools: t.tools.map((x) => ({ name: x.name, kind: x.kind, title: x.title })) })), null, 2));
} else {
  console.log("| Toolset | Default | Tool | Kind | What it does |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const ts of TOOLSETS) {
    for (const t of ts.tools) {
      console.log(`| ${ts.name} | ${ts.defaultEnabled ? "on" : "off"} | \`${t.name}\` | ${t.kind} | ${t.description.split(/(?<=\.)\s/)[0]} |`);
    }
  }
  const total = TOOLSETS.reduce((n, t) => n + t.tools.length, 0);
  const byKind = allTools().reduce<Record<string, number>>((m, t) => ((m[t.kind] = (m[t.kind] ?? 0) + 1), m), {});
  console.error(`\n${total} tools — ${JSON.stringify(byKind)}`);
}
