import type { ReactNode } from "react";
import { TOOLSETS } from "@/lib/mcp/registry";
import { CopyButton } from "./components/CopyButton";
import { SITE } from "./site";

// The landing page is fully static: rebuild to pick up catalog changes.
export const dynamic = "force-static";

/** One-line summary per toolset, used for structured data only. */
const TOOLSET_COVERS: Record<string, string> = {
  collections: "List, create, rename and delete collections. Account usage and invoices.",
  media: "Upload from URLs and YouTube, inspect videos, audio and images, thumbnails, transcode, delete.",
  transcripts: "Get, generate and translate transcripts, plain or timestamped.",
  indexing: "Spoken-word and scene indexes, analyzer runs, retrieval-ready indexes.",
  search: "Search moments or ask questions across one video or a whole collection.",
  streams: "Clips, supercuts, burned-in subtitles, highlight reels, reframes, MP4 renders.",
  editor: "Render a multi-track timeline of video, image, audio, text and caption clips.",
  rtstream: "Connect RTSP, RTMP or HLS feeds, index them live, define events, fire alerts.",
  meetings: "Send a recorder bot to Zoom, Google Meet or Microsoft Teams and index what was said.",
};

/* ---------------- Content ---------------- */

const STEPS = [
  {
    title: "Upload",
    body: "Point it at a public URL or a YouTube link. VideoDB pulls the media into a collection and hands back an ID and a playable stream.",
  },
  {
    title: "Index",
    body: "Transcribe speech, describe what is on screen, or run analyzers for objects, text, brands and activities. Then build a retrieval-ready index.",
  },
  {
    title: "Search and ask",
    body: "Find moments by meaning with start and end timestamps, or ask a question and get an answer with sources, across one video or a whole library.",
  },
  {
    title: "Cut and stream",
    body: "Clip, stitch, subtitle, reframe to vertical, render a timeline. Every result is a stream URL with a matching player link.",
  },
];

const RECIPES = [
  {
    title: "Highlight reel from a long video",
    prompt: "Upload this YouTube keynote, index the speech, then cut every moment where they demo the product into one reel.",
  },
  {
    title: "Ask questions of a recording",
    prompt: "Transcribe m-abc123 and set it up so I can ask questions. Start with: what pricing objections came up?",
  },
  {
    title: "Subtitled vertical clip for social",
    prompt: "From m-abc123 take 2:10 to 2:40, crop it to 9:16, burn in subtitles and give me an MP4.",
  },
  {
    title: "Search a whole library",
    prompt: "Index every video in “Customer calls”, then find every mention of the renewal discount.",
  },
  {
    title: "Live camera with alerts",
    prompt: "Connect rtsp://… as “Lobby cam”, watch for anyone entering after hours, and POST to my webhook when it happens.",
  },
  {
    title: "Record and search a meeting",
    prompt: "Send a recorder bot to this Google Meet. Once it is done, index it and tell me what we agreed on.",
  },
];

const FAQ: { q: string; a: ReactNode; plain: string }[] = [
  {
    q: "What is the VideoDB MCP Server?",
    plain:
      "A hosted remote MCP (Model Context Protocol) server at https://mcp.videodb.io/mcp that gives Claude and any other MCP client access to a VideoDB account: upload media, index it, search it, cut clips and get playable stream links from inside a conversation.",
    a: (
      <>
        A hosted remote <a href={SITE.links.mcpSpec}>MCP</a> server at <code>{SITE.endpoint}</code> that gives Claude and any other MCP client
        access to a VideoDB account: upload media, index it, search it, cut clips and get playable stream links from inside a conversation.
      </>
    ),
  },
  {
    q: "Which clients does it work with?",
    plain:
      "Claude on web, desktop and mobile (as a custom connector), Claude Code, Cursor, MCP Inspector, and any app that supports remote MCP servers. Team and Enterprise Claude admins add it under Organization settings → Connectors.",
    a: (
      <>
        Claude on web, desktop and mobile (as a custom connector), Claude Code, Cursor, MCP Inspector, and any app that supports remote MCP
        servers. Team and Enterprise Claude admins add it under Organization settings → Connectors.
      </>
    ),
  },
  {
    q: "Do I need a VideoDB account?",
    plain:
      "Yes. Sign up at console.videodb.io. When your client connects, you sign in to VideoDB once in a browser tab and click Authorize.",
    a: (
      <>
        Yes. Sign up at <a href={SITE.links.signup}>console.videodb.io</a>. When your client connects, you sign in to VideoDB once in a browser
        tab and click Authorize.
      </>
    ),
  },
  {
    q: "Do I have to install anything?",
    plain:
      "No. The server is hosted. Paste the URL into your client and sign in. Nothing runs on your machine and your API key never goes into a config file. A local stdio package, videodb-director-mcp, exists for clients that only support stdio.",
    a: (
      <>
        No. The server is hosted. Paste the URL into your client and sign in. Nothing runs on your machine and your API key never goes into a
        config file. A local stdio package, <code>videodb-director-mcp</code>, exists for clients that only support stdio; see the{" "}
        <a href={SITE.links.docsLocal}>local server docs</a>.
      </>
    ),
  },
  {
    q: "What does the server collect or store?",
    plain:
      "Only the arguments of the tool call being run. It reads no conversation content, chat history, memory or files, and it stores nothing: there is no database. Tool calls are forwarded to the VideoDB API only. Your media and the transcripts, indexes and streams built from it live in your VideoDB account until you delete them.",
    a: (
      <>
        Only the arguments of the tool call being run. It reads no conversation content, chat history, memory or files, and it stores nothing.
        Tool calls are forwarded to the VideoDB API only. Your media and the transcripts, indexes and streams built from it live in your
        VideoDB account until you delete them. Details in <a href={SITE.links.docsPrivacy}>Auth and Privacy</a>.
      </>
    ),
  },
  {
    q: "What can it not do?",
    plain:
      "It does not generate AI images, video, audio or music, and does not dub or clone voices. It does not upload local files (upload_media takes public URLs and YouTube links), and it does not capture your desktop. The VideoDB SDK and Agent Skills cover those.",
    a: (
      <>
        It does not generate AI images, video, audio or music, and does not dub or clone voices. It does not upload local files
        (<code>upload_media</code> takes public URLs and YouTube links), and it does not capture your desktop. The{" "}
        <a href={SITE.links.docsHome}>VideoDB SDK</a> and Agent Skills cover those.
      </>
    ),
  },
  {
    q: "Why did a tool return status: processing?",
    plain:
      "Uploads, indexing runs and renders can outlast a single request. The job keeps running on VideoDB; the response names the read tool to check with in its retry_with field. Ask your client to check with that tool instead of re-issuing the write, which would start a second job.",
    a: (
      <>
        Uploads, indexing runs and renders can outlast a single request. The job keeps running on VideoDB; the response names the read tool to
        check with in its <code>retry_with</code> field. Ask your client to check with that tool instead of re-issuing the write, which would
        start a second job.
      </>
    ),
  },
];

/* ---------------- Structured data ---------------- */

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    url: SITE.origin,
    description: SITE.description,
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Model Context Protocol server",
    operatingSystem: "Any",
    softwareVersion: "2.0.0",
    featureList: TOOLSETS.map((t) => `${t.name}: ${TOOLSET_COVERS[t.name] ?? t.description}`),
    author: { "@type": "Organization", name: "VideoDB", url: SITE.links.videodb },
    publisher: { "@type": "Organization", name: "VideoDB", url: SITE.links.videodb, logo: `${SITE.origin}/videodb-icon.png` },
    softwareHelp: { "@type": "CreativeWork", url: SITE.links.docs },
    installUrl: SITE.endpoint,
    image: `${SITE.origin}/opengraph-image`,
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Connect the VideoDB MCP Server to Claude",
    totalTime: "PT2M",
    step: [
      { "@type": "HowToStep", name: "Open connector settings", text: "In Claude, open Settings → Connectors → Add custom connector." },
      { "@type": "HowToStep", name: "Paste the server URL", text: `Paste ${SITE.endpoint} and click Connect.` },
      { "@type": "HowToStep", name: "Authorize", text: "A VideoDB page opens. Sign in or sign up, then click Authorize. Claude reconnects with the tools enabled." },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.plain } })),
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "VideoDB",
    url: SITE.links.videodb,
    logo: `${SITE.origin}/videodb-icon.png`,
    sameAs: ["https://x.com/videodb_io", "https://github.com/video-db", SITE.links.discord],
  },
];

/* ---------------- Page ---------------- */

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="nav">
        <div className="container nav-inner">
          <a className="nav-brand" href="/" aria-label="VideoDB MCP Server home">
            <img src="/videodb-wordmark.svg" alt="VideoDB" width={140} height={22} />
            <span className="nav-brand-tag">MCP Server</span>
          </a>
          <nav aria-label="Primary">
            <ul className="nav-links">
              <li><a href="#connect">Connect</a></li>
              <li><a href="#how">How it works</a></li>
              <li><a href="#workflows">Workflows</a></li>
              <li><a href="#faq">FAQ</a></li>
              <li><a href={SITE.links.docs}>Docs</a></li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* ---------- Hero ---------- */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="container">
            <h1 id="hero-title">A remote MCP server for your VideoDB account.</h1>
            <p className="lead">
              Connect Claude, Claude Code, Cursor or any MCP client to VideoDB. Upload media from a URL, index it, search for moments, cut clips
              and get playable stream links from inside a conversation. The server is hosted at one URL and you sign in with your VideoDB account.
            </p>

            <div className="endpoint">
              <code>{SITE.endpoint}</code>
              <CopyButton text={SITE.endpoint} />
            </div>

            <p className="hero-meta">
              Works with Claude, Claude Code, Cursor and other MCP clients. <a href={SITE.links.docs}>Read the docs</a>.
            </p>
          </div>
        </section>

        {/* ---------- Connect ---------- */}
        <section className="section" id="connect" aria-labelledby="connect-title">
          <div className="container">
            <div className="section-head">
              <h2 id="connect-title">Connect a client</h2>
              <p className="section-desc">
                Add <code>{SITE.endpoint}</code> as a remote server. On first use a VideoDB page opens; sign in and click Authorize. Full
                walkthrough in the <a href={SITE.links.docsConnect}>connection guide</a>.
              </p>
            </div>
            <div className="connect-grid">
              <article className="card">
                <div className="card-head">
                  <h3>Claude</h3>
                  <p className="card-sub">Web, desktop and mobile</p>
                </div>
                <div className="card-body">
                  <ol>
                    <li>Open <strong>Settings → Connectors → Add custom connector</strong>.</li>
                    <li>Paste the server URL and click <strong>Connect</strong>.</li>
                    <li>Sign in to VideoDB in the tab that opens and click <strong>Authorize</strong>.</li>
                  </ol>
                  <pre className="code"><code>{SITE.endpoint}</code></pre>
                  <p className="card-note">On Team and Enterprise plans an admin adds it under Organization settings → Connectors.</p>
                </div>
              </article>

              <article className="card">
                <div className="card-head">
                  <h3>Claude Code</h3>
                  <p className="card-sub">One command, then authorize with /mcp</p>
                </div>
                <div className="card-body">
                  <pre className="code"><code><span className="c"># add the server</span>{"\n"}claude mcp add --transport http videodb {SITE.endpoint}{"\n\n"}<span className="c"># inside Claude Code, authorize</span>{"\n"}/mcp</code></pre>
                </div>
              </article>

              <article className="card">
                <div className="card-head">
                  <h3>Cursor</h3>
                  <p className="card-sub">Settings → Cursor Settings → MCP</p>
                </div>
                <div className="card-body">
                  <pre className="code"><code>{"{\n  "}<span className="k">"mcpServers"</span>{": {\n    "}<span className="k">"videodb"</span>{": { "}<span className="k">"url"</span>{": "}<span className="s">"{SITE.endpoint}"</span>{" }\n  }\n}"}</code></pre>
                </div>
              </article>

              <article className="card">
                <div className="card-head">
                  <h3>Any MCP client</h3>
                  <p className="card-sub">Anything that supports remote MCP servers</p>
                </div>
                <div className="card-body">
                  <p>Add the URL as a remote MCP server. To inspect the tools without a client, use MCP Inspector:</p>
                  <pre className="code"><code>npx @modelcontextprotocol/inspector</code></pre>
                  <p className="card-note">Then ask: “list my videodb collections”. Your collections come back with IDs and names.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section className="section" id="how" aria-labelledby="how-title">
          <div className="container">
            <div className="section-head">
              <h2 id="how-title">How it works</h2>
              <p className="section-desc">
                VideoDB indexes speech and scenes at the moment level, so a client can ask for a specific moment in hours of footage without
                downloading or re-encoding anything. The full list of what the server can do is in the{" "}
                <a href={SITE.links.docsTools}>tool reference</a>.
              </p>
            </div>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li className="step" key={s.title}>
                  <span className="step-num">0{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Workflows ---------- */}
        <section className="section" id="workflows" aria-labelledby="workflows-title">
          <div className="container">
            <div className="section-head">
              <h2 id="workflows-title">Workflows</h2>
              <p className="section-desc">
                Describe the outcome and the client picks the right steps. More examples in the{" "}
                <a href={SITE.links.docsWorkflows}>workflows guide</a>.
              </p>
            </div>
            <div className="recipes">
              {RECIPES.map((r) => (
                <article className="recipe" key={r.title}>
                  <h3>{r.title}</h3>
                  <p className="recipe-prompt">“{r.prompt}”</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="section" id="faq" aria-labelledby="faq-title">
          <div className="container">
            <div className="section-head">
              <h2 id="faq-title">FAQ</h2>
            </div>
            <div className="faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>
                    {f.q}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </summary>
                  <div className="faq-body">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-brand">
            <img src="/videodb-wordmark.svg" alt="VideoDB" width={114} height={18} />
            <span>© {new Date().getFullYear()} Spext Labs Inc.</span>
          </div>
          <ul className="footer-links">
            <li><a href={SITE.links.videodb}>videodb.io</a></li>
            <li><a href={SITE.links.docsHome}>Docs</a></li>
            <li><a href={SITE.links.console}>Console</a></li>
            <li><a href={SITE.links.discord}>Discord</a></li>
            <li><a href={SITE.links.email}>hello@videodb.io</a></li>
            <li><a href={SITE.links.privacy}>Privacy</a></li>
            <li><a href={SITE.links.terms}>Terms</a></li>
          </ul>
        </div>
      </footer>
    </>
  );
}
