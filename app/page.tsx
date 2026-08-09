const styles = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(1200px 600px at 50% -10%, #16231b 0%, #0b0f0d 60%)",
    color: "#e8ede9",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: { maxWidth: 620, width: "100%", padding: "48px 8px" },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "#baf75c",
    color: "#0b0f0d",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 17,
    marginRight: 12,
    verticalAlign: "middle",
  },
  h1: { fontSize: 28, fontWeight: 700, margin: "24px 0 12px" },
  p: { color: "#9fb0a5", lineHeight: 1.7, fontSize: 15, margin: "0 0 14px" },
  code: {
    display: "inline-block",
    background: "#0c110e",
    border: "1px solid #2c372f",
    borderRadius: 8,
    padding: "10px 14px",
    fontFamily: "ui-monospace, monospace",
    fontSize: 14,
    color: "#baf75c",
    margin: "6px 0 18px",
  },
  a: { color: "#baf75c", textDecoration: "none" },
} as const;

export default function Home() {
  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div>
          <span style={styles.mark}>▶</span>
          <span style={{ fontWeight: 700, fontSize: 19, verticalAlign: "middle" }}>VideoDB</span>
        </div>
        <h1 style={styles.h1}>VideoDB MCP Server</h1>
        <p style={styles.p}>
          Connect Claude to your video library. Upload and index videos, search inside them by
          meaning, pull transcripts, cut clips, compile highlight reels, and get instantly
          streamable links — all from a conversation.
        </p>
        <p style={styles.p}>
          <strong style={{ color: "#e8ede9" }}>To connect:</strong> in Claude, open{" "}
          <em>Settings → Connectors → Add custom connector</em> and paste this server&apos;s URL:
        </p>
        <span style={styles.code}>{"https://<this-domain>/mcp"}</span>
        <p style={styles.p}>
          You&apos;ll be asked to sign in with your VideoDB API key from the{" "}
          <a style={styles.a} href="https://console.videodb.io">
            VideoDB console
          </a>
          . New accounts get free credits — no credit card required.
        </p>
        <p style={{ ...styles.p, fontSize: 13, color: "#5f6e64" }}>
          <a style={{ color: "#7e8f84" }} href="https://videodb.io">
            videodb.io
          </a>{" "}
          ·{" "}
          <a style={{ color: "#7e8f84" }} href="https://docs.videodb.io">
            docs
          </a>{" "}
          ·{" "}
          <a style={{ color: "#7e8f84" }} href="https://videodb.io/privacy-policy">
            privacy
          </a>
        </p>
      </div>
    </main>
  );
}
