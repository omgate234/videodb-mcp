/** Regenerate the tool table between the tools:begin/end markers in README.md. */
import { readFileSync, writeFileSync } from "node:fs";
import { TOOLSETS } from "@/lib/mcp/registry";

const rows = ["| Toolset | Default | Tool | Kind | What it does |", "| --- | --- | --- | --- | --- |"];
for (const ts of TOOLSETS)
  for (const t of ts.tools)
    rows.push(`| ${ts.name} | ${ts.defaultEnabled ? "on" : "off"} | \`${t.name}\` | ${t.kind} | ${t.description.split(/(?<=\.)\s/)[0]} |`);

const readme = readFileSync("README.md", "utf8");
const out = readme.replace(
  /<!-- tools:begin[^>]*-->[\s\S]*?<!-- tools:end -->/,
  `<!-- tools:begin — regenerate with \`npm run tools:sync\` -->\n${rows.join("\n")}\n<!-- tools:end -->`
);
writeFileSync("README.md", out);
console.log(`README tool table: ${rows.length - 2} tools`);
