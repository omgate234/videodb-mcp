import { ImageResponse } from "next/og";
import { SITE } from "./site";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Satori renders SVG only through <img>; inline the real wordmark as a data URI.
const WORDMARK = `data:image/svg+xml;base64,${readFileSync(join(process.cwd(), "public/videodb-wordmark.svg")).toString("base64")}`;

export const alt = "VideoDB MCP Server — search, edit and stream video from Claude and any MCP client";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(800px 420px at 50% -10%, rgba(236,91,22,0.35), #000 70%)",
          color: "#f7f7f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <img src={WORDMARK} width={266} height={42} alt="VideoDB" />
          <div style={{ fontSize: 28, color: "#a3a3a3", paddingLeft: 22, borderLeft: "2px solid #404040" }}>MCP Server</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2.5, maxWidth: 1000 }}>
            A remote MCP server for your VideoDB account.
          </div>
          <div style={{ fontSize: 28, color: "#a3a3a3", lineHeight: 1.4, maxWidth: 960 }}>
            Upload, index, search, clip and stream your video library from Claude, Claude Code, Cursor and any MCP client.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "16px 24px",
              borderRadius: 12,
              background: "#171717",
              border: "1px solid #404040",
              fontSize: 26,
              color: "#f7f7f7",
              fontFamily: "monospace",
            }}
          >
            {SITE.endpoint}
          </div>
          <div style={{ display: "flex", gap: 14, fontSize: 22, color: "#a3a3a3" }}>
            <span>Claude</span>
            <span>·</span>
            <span>Claude Code</span>
            <span>·</span>
            <span>Cursor</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
