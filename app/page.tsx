import type { ReactNode } from "react";
import { TOOLSETS, allTools } from "@/lib/mcp/registry";
import type { ToolKind } from "@/lib/mcp/tool";
import { CopyButton } from "./components/CopyButton";
import { SITE } from "./site";

// The landing page is fully static: rebuild to pick up catalog changes.
export const dynamic = "force-static";

/* ---------------- Catalog (built from the same registry the server registers) ---------------- */

const tools = allTools();
const total = tools.length;
const byKind = tools.reduce<Record<ToolKind, number>>(
  (m, t) => ((m[t.kind] += 1), m),
  { read: 0, create: 0, update: 0, destructive: 0 },
);

/** Marketing copy per toolset. Tool names, counts and descriptions come from the registry. */
const TOOLSET_COPY: Record<string, { covers: string; icon: ReactNode }> = {
  collections: {
    covers: "List, create, rename and delete collections. Account usage and invoices.",
    icon: <Icon d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  },
  media: {
    covers: "Upload from URLs and YouTube, inspect videos, audio and images, thumbnails, transcode, delete.",
    icon: <Icon d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM10 9l5 3-5 3z" />,
  },
  transcripts: {
    covers: "Get, generate and translate transcripts, plain or timestamped.",
    icon: <Icon d="M4 6h16M4 12h16M4 18h10" />,
  },
  indexing: {
    covers: "Spoken-word and scene indexes, analyzer runs, retrieval-ready indexes.",
    icon: <Icon d="M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z" />,
  },
  search: {
    covers: "Search moments or ask questions across one video or a whole collection.",
    icon: <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />,
  },
  streams: {
    covers: "Clips, supercuts, burned-in subtitles, highlight reels, reframes, MP4 renders.",
    icon: <Icon d="M6 4h12M6 20h12M8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4" />,
  },
  editor: {
    covers: "Render a multi-track timeline of video, image, audio, text and caption clips.",
    icon: <Icon d="M3 8h18M3 12h18M3 16h18M7 8v8M13 12v4M17 8v4" />,
  },
  rtstream: {
    covers: "Connect RTSP, RTMP or HLS feeds, index them live, define events, fire alerts.",
    icon: <Icon d="M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />,
  },
  meetings: {
    covers: "Send a recorder bot to Zoom, Google Meet or Microsoft Teams and index what was said.",
    icon: <Icon d="M15 10l4.5-3v10L15 14M3 7h12v10H3z" />,
  },
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/* ---------------- Content ---------------- */

const STEPS = [
  {
    title: "Upload",
    body: "Point it at a public URL or a YouTube link. VideoDB pulls the media into a collection and hands back an ID and a playable stream.",
    tools: ["upload_media", "search_youtube", "record_meeting", "connect_rtstream"],
  },
  {
    title: "Index",
    body: "Transcribe speech, describe what is on screen, or run analyzers for objects, text, brands and activities. Then build a retrieval-ready index.",
    tools: ["index_spoken_words", "index_scenes", "understand_video", "create_index"],
  },
  {
    title: "Search & ask",
    body: "Find moments by meaning with start and end timestamps, or ask a question and get an answer with sources, across one video or a whole library.",
    tools: ["search_video", "search_collection", "ask_video", "semantic_search"],
  },
  {
    title: "Cut & stream",
    body: "Clip, stitch, subtitle, reframe to vertical, render a timeline. Every result is a stream URL with a matching player link.",
    tools: ["generate_clip", "compile_clips", "add_subtitles", "download_stream"],
  },
];

const RECIPES = [
  {
    title: "Highlight reel from a long video",
    prompt: "Upload this YouTube keynote, index the speech, then cut every moment where they demo the product into one reel.",
    chain: ["upload_media", "index_spoken_words", "create_highlight_clip"],
  },
  {
    title: "Ask questions of a recording",
    prompt: "Transcribe m-abc123 and set it up so I can ask questions. Start with: what pricing objections came up?",
    chain: ["generate_transcript", "understand_video", "create_index", "ask_video"],
  },
  {
    title: "Subtitled vertical clip for social",
    prompt: "From m-abc123 take 2:10 to 2:40, crop it to 9:16, burn in subtitles and give me an MP4.",
    chain: ["reframe_video", "index_spoken_words", "add_subtitles", "download_stream"],
  },
  {
    title: "Search a whole library",
    prompt: "Index every video in “Customer calls”, then find every mention of the renewal discount.",
    chain: ["list_collections", "list_videos", "index_spoken_words", "search_collection"],
  },
  {
    title: "Live camera with alerts",
    prompt: "Connect rtsp://… as “Lobby cam”, watch for anyone entering after hours, and POST to my webhook when it happens.",
    chain: ["connect_rtstream", "index_rtstream_scenes", "create_event", "create_rtstream_alert"],
  },
  {
    title: "Record and search a meeting",
    prompt: "Send a recorder bot to this Google Meet. Once it is done, index it and tell me what we agreed on.",
    chain: ["record_meeting", "get_meeting", "index_spoken_words", "search_video"],
  },
];

const FAQ: { q: string; a: ReactNode; plain: string }[] = [
  {
    q: "What is the VideoDB MCP Server?",
    plain:
      "A hosted remote MCP (Model Context Protocol) server at https://mcp.videodb.io/mcp that gives Claude and any other MCP client access to a VideoDB account: upload media, index it, search it, cut clips and get playable stream links from inside a conversation. It speaks Streamable HTTP and uses OAuth 2.1 for sign-in.",
    a: (
      <>
        A hosted remote <a href={SITE.links.mcpSpec}>MCP</a> server at <code>{SITE.endpoint}</code> that gives Claude and any other MCP client
        access to a VideoDB account: upload media, index it, search it, cut clips and get playable stream links from inside a conversation.
        It speaks Streamable HTTP and uses OAuth 2.1 for sign-in.
      </>
    ),
  },
  {
    q: "Which clients does it work with?",
    plain:
      "Claude on web, desktop and mobile (as a custom connector), Claude Code, Cursor, MCP Inspector, and any client that supports remote MCP servers over Streamable HTTP. Team and Enterprise Claude admins add it under Organization settings → Connectors.",
    a: (
      <>
        Claude on web, desktop and mobile (as a custom connector), Claude Code, Cursor, MCP Inspector, and any client that supports remote MCP
        servers over Streamable HTTP. Team and Enterprise Claude admins add it under Organization settings → Connectors.
      </>
    ),
  },
  {
    q: "Do I need a VideoDB account? Is it free?",
    plain:
      "Yes, you need a VideoDB account, and signing up at console.videodb.io is free with no credit card required. New accounts get free credits. When your client connects, you sign in to VideoDB once in a browser tab and click Authorize.",
    a: (
      <>
        Yes. Sign up free at <a href={SITE.links.signup}>console.videodb.io</a>, no credit card required, and new accounts get free credits. When
        your client connects, you sign in to VideoDB once in a browser tab and click Authorize.
      </>
    ),
  },
  {
    q: "Do I have to install anything?",
    plain:
      "No. The server is hosted. Paste the URL into your client and sign in. Nothing runs on your machine, there is no Python or Node to set up, and your API key never goes into a config file. A local stdio package, videodb-director-mcp, exists for clients that only support stdio.",
    a: (
      <>
        No. The server is hosted. Paste the URL into your client and sign in. Nothing runs on your machine, and your API key never goes into a
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
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free VideoDB account, no credit card required" },
    featureList: TOOLSETS.map((t) => `${t.name}: ${TOOLSET_COPY[t.name]?.covers ?? t.description}`),
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
              <li><a href="#how">How it works</a></li>
              <li><a href="#connect">Connect</a></li>
              <li><a href="#tools">Tools</a></li>
              <li><a href="#faq">FAQ</a></li>
              <li><a href={SITE.links.docs}>Docs</a></li>
              <li><a className="nav-cta" href={SITE.links.signup}>Get API access</a></li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* ---------- Hero ---------- */}
        <section className="hero" aria-labelledby="hero-title">
          <div className="container">
            <div className="hero-inner">
              <div>
                <span className="eyebrow">
                  <span className="eyebrow-dot" aria-hidden />
                  Remote MCP server · Streamable HTTP · OAuth 2.1
                </span>
                <h1 id="hero-title">
                  Search, cut and stream video <span className="accent">from Claude.</span>
                </h1>
                <p className="lead">
                  The VideoDB MCP Server connects Claude, Claude Code, Cursor and any MCP client to your video library.{" "}
                  <strong>Upload from a URL, index it, find the exact moment, clip it, and get a link you can watch</strong>, all inside the
                  conversation. Nothing to install.
                </p>

                <div className="endpoint">
                  <span className="endpoint-label">Endpoint</span>
                  <code>{SITE.endpoint}</code>
                  <CopyButton text={SITE.endpoint} />
                </div>

                <div className="hero-actions">
                  <a className="btn btn-primary" href="#connect">
                    Connect in 2 minutes
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </a>
                  <a className="btn btn-secondary" href={SITE.links.docs}>
                    Read the docs
                  </a>
                </div>
                <p className="hero-meta">
                  Free VideoDB account, no credit card. <a href={SITE.links.signup}>Sign up at console.videodb.io</a>.
                </p>
              </div>

              <aside className="demo" aria-label="Example conversation">
                <div className="demo-bar">
                  <div className="dots" aria-hidden>
                    <span /><span /><span />
                  </div>
                  <span className="title">Claude · VideoDB connector</span>
                </div>
                <div className="demo-body">
                  <div className="bubble bubble-user">
                    Upload this keynote from YouTube, index it, and find every moment where they demo the product. Then cut those into one
                    highlight reel.
                  </div>
                  <div className="trace" role="list" aria-label="Tools called">
                    <TraceRow tool="upload_media" note="m-9f2c… · 47:12" />
                    <TraceRow tool="index_spoken_words" note="transcribed + indexed" />
                    <TraceRow tool="search_video" note="6 moments · 0.81–0.94" />
                    <TraceRow tool="compile_clips" note="3:42 reel" />
                  </div>
                  <div className="bubble bubble-assistant">
                    Found six demo segments and stitched them into a 3:42 reel, starting with the on-stage walkthrough at 12:04.
                    <span className="link">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M10 14 21 3M15 3h6v6M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                      </svg>
                      player.videodb.io/player?url=…
                    </span>
                  </div>
                </div>
              </aside>
            </div>

            <dl className="stats" aria-label="At a glance">
              <Stat value={String(total)} label="tools" />
              <Stat value={String(TOOLSETS.length)} label="toolsets" />
              <Stat value="OAuth 2.1" label="sign in once, in your browser" />
              <Stat value="Zero" label="install, config files or API keys to paste" />
              <Stat value="Hosted" label="Streamable HTTP, same URL for everyone" />
            </dl>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section className="section" id="how" aria-labelledby="how-title">
          <div className="container">
            <div className="section-head">
              <p className="section-kicker">How it works</p>
              <h2 id="how-title">Video becomes a database your agent can query.</h2>
              <p className="section-desc">
                VideoDB indexes speech and scenes at the moment level, so a client can ask for a specific moment in hours of footage without
                downloading or re-encoding anything. The connector exposes that pipeline as plain tools.
              </p>
            </div>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li className="step" key={s.title}>
                  <span className="step-num">0{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  <div className="step-tools">
                    {s.tools.map((t) => (
                      <code className="chip" key={t}>{t}</code>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Connect ---------- */}
        <section className="section" id="connect" aria-labelledby="connect-title">
          <div className="container">
            <div className="section-head">
              <p className="section-kicker">Connect</p>
              <h2 id="connect-title">One URL. Every client.</h2>
              <p className="section-desc">
                Add <code>{SITE.endpoint}</code> as a remote server. On first use a VideoDB page opens; sign in and click Authorize. Full
                walkthrough in the <a href={SITE.links.docsConnect}>connection guide</a>.
              </p>
            </div>
            <div className="connect-grid">
              <article className="card">
                <div className="card-head">
                  <span className="card-icon"><Icon d="M12 3l9 16H3zM12 10v4M12 17v.5" /></span>
                  <div>
                    <h3>Claude</h3>
                    <p className="card-sub">Web, desktop and mobile</p>
                  </div>
                </div>
                <div className="card-body">
                  <ol>
                    <li>Open <strong>Settings → Connectors → Add custom connector</strong>.</li>
                    <li>Paste the server URL and click <strong>Connect</strong>.</li>
                    <li>Sign in to VideoDB in the tab that opens and click <strong>Authorize</strong>.</li>
                  </ol>
                  <pre className="code"><code>{SITE.endpoint}</code></pre>
                  <p style={{ marginTop: 12 }}>On Team and Enterprise plans an admin adds it under Organization settings → Connectors.</p>
                </div>
              </article>

              <article className="card">
                <div className="card-head">
                  <span className="card-icon"><Icon d="M4 17l6-6-6-6M12 19h8" /></span>
                  <div>
                    <h3>Claude Code</h3>
                    <p className="card-sub">One command, then authorize with /mcp</p>
                  </div>
                </div>
                <div className="card-body">
                  <pre className="code"><code><span className="c"># add the server</span>{"\n"}claude mcp add --transport http videodb {SITE.endpoint}{"\n\n"}<span className="c"># inside Claude Code, authorize</span>{"\n"}/mcp</code></pre>
                </div>
              </article>

              <article className="card">
                <div className="card-head">
                  <span className="card-icon"><Icon d="M4 4h16v16H4zM4 9h16M9 9v11" /></span>
                  <div>
                    <h3>Cursor</h3>
                    <p className="card-sub">Settings → Cursor Settings → MCP</p>
                  </div>
                </div>
                <div className="card-body">
                  <pre className="code"><code>{"{\n  "}<span className="k">"mcpServers"</span>{": {\n    "}<span className="k">"videodb"</span>{": { "}<span className="k">"url"</span>{": "}<span className="s">"{SITE.endpoint}"</span>{" }\n  }\n}"}</code></pre>
                </div>
              </article>

              <article className="card">
                <div className="card-head">
                  <span className="card-icon"><Icon d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></span>
                  <div>
                    <h3>Any MCP client</h3>
                    <p className="card-sub">Remote server over Streamable HTTP</p>
                  </div>
                </div>
                <div className="card-body">
                  <p>
                    Add the URL as a remote Streamable HTTP server. There is nothing else to configure. To inspect the tools without a
                    client, use MCP Inspector:
                  </p>
                  <pre className="code"><code>npx @modelcontextprotocol/inspector</code></pre>
                  <p style={{ marginTop: 12 }}>Then ask: <strong>“list my videodb collections”</strong>. Your collections come back with IDs and names.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ---------- Tools ---------- */}
        <section className="section" id="tools" aria-labelledby="tools-title">
          <div className="container">
            <div className="section-head">
              <p className="section-kicker">Tool catalog</p>
              <h2 id="tools-title">{total} tools, grouped by what they touch.</h2>
              <p className="section-desc">
                Every tool carries MCP annotations, so your client knows whether a call reads, creates, updates or deletes before it runs it.
                Inputs, prerequisites and defaults are in the <a href={SITE.links.docsTools}>tool reference</a>.
              </p>
            </div>

            <div className="tools-summary" aria-label="Tools by kind">
              <span className="kind kind-total">{total} total</span>
              <span className="kind kind-read">{byKind.read} read</span>
              <span className="kind kind-create">{byKind.create} create</span>
              <span className="kind kind-update">{byKind.update} update</span>
              <span className="kind kind-destructive">{byKind.destructive} destructive</span>
            </div>

            <div className="toolsets">
              {TOOLSETS.map((ts, i) => (
                <details className="toolset" key={ts.name} id={`toolset-${ts.name}`} open={i === 0}>
                  <summary>
                    <span className="toolset-icon">{TOOLSET_COPY[ts.name]?.icon ?? <Icon d="M4 4h16v16H4z" />}</span>
                    <span className="toolset-title">
                      <h3>{ts.name}</h3>
                      <p>{TOOLSET_COPY[ts.name]?.covers ?? ts.description}</p>
                    </span>
                    <span className="toolset-count">{ts.tools.length} tools</span>
                    <svg className="toolset-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="toolset-body">
                    <table className="tool-table">
                      <thead>
                        <tr>
                          <th scope="col">Tool</th>
                          <th scope="col">Kind</th>
                          <th scope="col">What it does</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ts.tools.map((t) => (
                          <tr key={t.name}>
                            <td><code>{t.name}</code></td>
                            <td><span className={`kind kind-${t.kind}`}>{t.kind}</span></td>
                            <td>{firstSentence(t.description)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Workflows ---------- */}
        <section className="section" id="workflows" aria-labelledby="workflows-title">
          <div className="container">
            <div className="section-head">
              <p className="section-kicker">Workflows</p>
              <h2 id="workflows-title">Say what you want. The client picks the tools.</h2>
              <p className="section-desc">
                Each recipe pairs the prompt you type with the chain it runs, so you know what to expect and what to fix when a step is
                missing.
              </p>
            </div>
            <div className="recipes">
              {RECIPES.map((r) => (
                <article className="recipe" key={r.title}>
                  <h3>{r.title}</h3>
                  <p className="recipe-prompt">{r.prompt}</p>
                  <ol className="recipe-chain" aria-label="Tools that run">
                    {r.chain.map((t) => (
                      <li key={t}><code>{t}</code></li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
            <p className="recipe-more">
              More recipes, including long-job handling and ID conventions, in the <a href={SITE.links.docsWorkflows}>workflows guide</a>.
            </p>
          </div>
        </section>

        {/* ---------- Privacy ---------- */}
        <section className="section" id="privacy" aria-labelledby="privacy-title">
          <div className="container">
            <div className="split">
              <div>
                <p className="section-kicker">Auth and privacy</p>
                <h2 id="privacy-title" style={{ marginTop: 12 }}>A bridge, not a store.</h2>
                <div className="prose" style={{ marginTop: 16 }}>
                  <p>
                    You sign in to VideoDB once, in your browser, and click Authorize. Your client holds a token from then on and sends it
                    with every tool call. <strong>No API key goes into a config file.</strong>
                  </p>
                  <p>
                    The server forwards each tool call to the VideoDB API and returns the result. It keeps nothing between requests. Read the
                    full <a href={SITE.links.docsPrivacy}>Auth and Privacy</a> page or the <a href={SITE.links.privacy}>VideoDB privacy policy</a>.
                  </p>
                </div>
              </div>
              <dl className="facts">
                <div className="fact">
                  <dt>Collected</dt>
                  <dd>The arguments of the tool call being run, and nothing else.</dd>
                </div>
                <div className="fact">
                  <dt>Not read or stored</dt>
                  <dd>Conversation content, chat history, memory, your files.</dd>
                </div>
                <div className="fact">
                  <dt>Sent to</dt>
                  <dd>The VideoDB API (<code>api.videodb.io</code>) only. Nothing goes anywhere else.</dd>
                </div>
                <div className="fact">
                  <dt>Your media</dt>
                  <dd>
                    Videos, transcripts, indexes and streams live in your VideoDB account until you delete them, with <code>delete_video</code>,{" "}
                    <code>delete_index</code>, <code>delete_collection</code> or <code>remove_video_storage</code>.
                  </dd>
                </div>
                <div className="fact">
                  <dt>Revoking access</dt>
                  <dd>
                    Disconnect the connector in your client, or rotate your API key at <a href={SITE.links.console}>console.videodb.io</a>.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="section" id="faq" aria-labelledby="faq-title">
          <div className="container">
            <div className="section-head">
              <p className="section-kicker">FAQ</p>
              <h2 id="faq-title">Questions people ask before connecting.</h2>
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

        {/* ---------- CTA ---------- */}
        <section className="cta" aria-labelledby="cta-title">
          <div className="container cta-inner">
            <h2 id="cta-title">Give your agent a video library it can actually use.</h2>
            <p>Create a free VideoDB account, paste one URL into your client, and start asking about your footage.</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={SITE.links.signup}>Create a free account</a>
              <a className="btn btn-secondary" href="#connect">Connect a client</a>
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

/* ---------------- Small pieces ---------------- */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <dt className="stat-label" style={{ order: 2 }}>{label}</dt>
      <dd className="stat-value" style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}

function TraceRow({ tool, note }: { tool: string; note: string }) {
  return (
    <div className="trace-row" role="listitem">
      <svg className="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <code>{tool}</code>
      <span className="arrow">{note}</span>
    </div>
  );
}

/** First sentence of a tool description; does not break on "e.g." / "i.e.". */
function firstSentence(s: string): string {
  const re = /\.\s+(?=[A-Z(`])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const head = s.slice(0, m.index);
    if (!/\b(e\.g|i\.e|etc|vs)$/i.test(head)) return head + ".";
  }
  return s;
}
