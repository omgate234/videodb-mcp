/**
 * The show_video view: one HTML page the host renders in a sandboxed iframe.
 * Same vocabulary as player.videodb.io (dark stage, glass pill controls, orange progress, Geist),
 * plus what a chat needs: the moment's range drawn on the scrubber and a chapter list for several items.
 * The inline script avoids template literals so this file can embed it as one.
 */

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.1-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect fill="currentColor" x="6" y="5" width="4" height="14" rx="1.2"/><rect fill="currentColor" x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 5.5 6.6 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.6l4.4 3.5a.6.6 0 0 0 1-.47V5.97a.6.6 0 0 0-1-.47z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  muted: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 5.5 6.6 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.6l4.4 3.5a.6.6 0 0 0 1-.47V5.97a.6.6 0 0 0-1-.47z"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="m16 9.5 5 5m0-5-5 5"/></svg>',
  expand: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/></svg>',
  shrink: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M8 4v4H4M16 4v4h4M8 20v-4H4M16 20v-4h4"/></svg>',
  open: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M8 16 16 8M9.5 8H16v6.5"/></svg>',
};

export function playerHtml(extAppsUrl: string, hlsUrl: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  /* Match the host's scheme so Chrome keeps the frame transparent around the card's rounded corners. */
  :root { color-scheme: light; --accent: #f2611d; --ink: #fff; --ink-2: rgba(255,255,255,.72); --ink-3: rgba(255,255,255,.48); --glass: rgba(255,255,255,.08); --glass-hover: rgba(255,255,255,.16); --surface: #0c0c0c; }
  :root[data-theme="dark"] { color-scheme: dark; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme]) { color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: transparent; font: 14px/1.4 Geist, ui-sans-serif, system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
  button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; }
  svg { width: 20px; height: 20px; display: block; }

  .card { position: relative; background: var(--surface); color: var(--ink); border-radius: 16px; overflow: hidden; }
  .card::after { content: ""; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px rgba(255,255,255,.07); pointer-events: none; z-index: 5; }

  /* Fixed 16:9 stage: the host sizes the iframe from our content, so the box must not wait on video metadata. */
  .stage { position: relative; aspect-ratio: 16 / 9; background: #000; overflow: hidden; container-type: inline-size; }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }

  .shade { position: absolute; inset-inline: 0; pointer-events: none; transition: opacity .25s ease; }
  .shade.top { top: 0; height: 96px; background: linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,0)); }
  .shade.bottom { bottom: 0; height: 128px; background: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.7)); }
  .head { position: absolute; top: 0; inset-inline: 0; padding: 14px 16px; display: grid; gap: 2px; transition: opacity .25s ease; pointer-events: none; }
  .title { font-weight: 600; font-size: 15px; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; }

  .controls { position: absolute; bottom: 0; inset-inline: 0; padding: 0 12px 12px; transition: opacity .25s ease; }
  .idle .controls, .idle .shade, .idle .head { opacity: 0; }
  .idle { cursor: none; }

  .scrub { position: relative; height: 18px; display: flex; align-items: center; cursor: pointer; touch-action: none; margin: 0 4px 6px; }
  .track { position: relative; width: 100%; height: 4px; border-radius: 4px; background: rgba(255,255,255,.18); overflow: hidden; transition: height .15s ease; }
  .scrub:hover .track, .scrub.drag .track { height: 6px; }
  .track > div { position: absolute; top: 0; bottom: 0; left: 0; }
  .band { background: rgba(242,97,29,.42); }
  .fill { background: var(--accent); }
  .knob { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #fff; transform: scale(0); transition: transform .15s ease; pointer-events: none; }
  .scrub:hover .knob, .scrub.drag .knob { transform: scale(1); }
  .tip { position: absolute; bottom: 22px; padding: 3px 8px; border-radius: 6px; background: rgba(0,0,0,.8); font-size: 12px; font-variant-numeric: tabular-nums; transform: translateX(-50%); opacity: 0; pointer-events: none; transition: opacity .15s ease; }
  .scrub:hover .tip, .scrub.drag .tip { opacity: 1; }

  .row { display: flex; align-items: center; gap: 6px; }
  .btn { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); transition: background .15s ease; }
  .btn:hover, .pill:hover { background: var(--glass-hover); }
  .pill { height: 36px; padding: 0 14px; border-radius: 18px; background: var(--glass); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; transition: background .15s ease; }
  .btn:focus-visible, .pill:focus-visible, .big:focus-visible, .chapter:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .time { margin-left: 8px; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--ink); white-space: nowrap; }
  .time span { color: var(--ink-3); }
  .grow { flex: 1; }

  .big { position: absolute; top: 50%; left: 50%; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.14); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); transition: transform .2s ease, background .2s ease, opacity .2s ease; }
  .big svg { width: 28px; height: 28px; margin-left: 3px; }
  .big:hover { transform: scale(1.06); background: rgba(255,255,255,.2); }
  .playing .big, .loading .big, .failed .big { opacity: 0; pointer-events: none; transform: scale(.9); }

  .spin { position: absolute; top: 50%; left: 50%; width: 32px; height: 32px; margin: -16px 0 0 -16px; border-radius: 50%; border: 3px solid rgba(255,255,255,.2); border-top-color: #fff; animation: spin .8s linear infinite; opacity: 0; transition: opacity .2s ease; pointer-events: none; }
  .loading .spin { opacity: 1; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .fail { position: absolute; inset: 0; display: none; place-content: center; justify-items: center; gap: 14px; text-align: center; padding: 24px; background: rgba(0,0,0,.6); }
  .failed .fail { display: grid; }
  .fail p { margin: 0; color: var(--ink-2); }

  .chapters { list-style: none; margin: 0; padding: 6px; max-height: 238px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
  .chapter { width: 100%; height: 44px; padding: 0 12px; border-radius: 10px; display: grid; grid-template-columns: 20px 1fr auto; align-items: center; gap: 12px; text-align: left; color: var(--ink-2); transition: background .15s ease, color .15s ease; }
  .chapter:hover { background: rgba(255,255,255,.05); color: var(--ink); }
  .chapter.on { background: rgba(255,255,255,.08); color: var(--ink); }
  .chapter .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
  .chapter .range { font-size: 12px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
  .chapter .n { font-size: 12px; color: var(--ink-3); font-variant-numeric: tabular-nums; text-align: center; }
  .eq { display: none; height: 12px; align-items: flex-end; justify-content: center; gap: 2px; }
  .eq i { width: 3px; height: 100%; border-radius: 1px; background: var(--accent); transform-origin: bottom; transform: scaleY(.55); }
  .eq i:nth-child(2) { transform: scaleY(1); }
  .eq i:nth-child(3) { transform: scaleY(.75); }
  .chapter.on .n { display: none; }
  .chapter.on .eq { display: flex; }
  .playing .chapter.on .eq i { animation: eq .9s ease-in-out infinite; }
  .playing .chapter.on .eq i:nth-child(2) { animation-delay: -.3s; }
  .playing .chapter.on .eq i:nth-child(3) { animation-delay: -.6s; }
  @keyframes eq { 0%, 100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
  @container (max-width: 520px) {
    .btn { width: 32px; height: 32px; } .btn svg { width: 18px; height: 18px; }
    #speed { display: none; }
    .controls { padding: 0 8px 8px; } .head { padding: 10px 12px; } .title { font-size: 14px; }
    .big { width: 52px; height: 52px; margin: -26px 0 0 -26px; } .big svg { width: 22px; height: 22px; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  .empty { padding: 40px 16px; text-align: center; color: var(--ink-2); }
</style>
</head>
<body>
<div class="card" id="card">
  <div class="stage loading" id="stage">
    <video id="v" playsinline preload="metadata"></video>
    <div class="shade top"></div>
    <div class="shade bottom"></div>
    <div class="head"><div class="title" id="title"></div><div class="meta" id="meta"></div></div>
    <div class="spin"></div>
    <button class="big" id="big" aria-label="Play">${ICON.play}</button>
    <div class="fail"><p>This video can't play here.</p><button class="pill" id="fail-open">Open on VideoDB</button></div>
    <div class="controls">
      <div class="scrub" id="scrub" role="slider" aria-label="Seek" tabindex="-1">
        <div class="track"><div class="band" id="band"></div><div class="fill" id="fill"></div></div>
        <div class="knob" id="knob"></div>
        <div class="tip" id="tip">0:00</div>
      </div>
      <div class="row">
        <button class="btn" id="pp" aria-label="Play">${ICON.play}</button>
        <button class="btn" id="mute" aria-label="Mute">${ICON.sound}</button>
        <div class="time" id="time">0:00 <span>/ 0:00</span></div>
        <div class="grow"></div>
        <button class="pill" id="speed" aria-label="Playback speed">1×</button>
        <button class="btn" id="open" aria-label="Open on VideoDB" title="Open on VideoDB">${ICON.open}</button>
        <button class="btn" id="fs" aria-label="Full screen">${ICON.expand}</button>
      </div>
    </div>
  </div>
  <ol class="chapters" id="list" hidden></ol>
</div>
<script src="${hlsUrl}"></script>
<script type="module">
import { App, applyDocumentTheme } from "${extAppsUrl}";

const ICON = ${JSON.stringify(ICON)};
const $ = (id) => document.getElementById(id);
const video = $("v"), stage = $("stage"), list = $("list"), card = $("card");
const app = new App({ name: "VideoDB player", version: "1.0.0" });
const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
let items = [], cur = -1, hls = null, lastT = 0, idleTimer = 0, dragging = false;

const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60); return m + ":" + String(s % 60).padStart(2, "0"); };
const pct = (x) => (Math.max(0, Math.min(1, x)) * 100) + "%";
const hasRange = (it) => it.start != null || it.end != null;
const rangeText = (it) => fmt(it.start || 0) + " – " + (it.end != null ? fmt(it.end) : "end");

function load(i, autoplay) {
  const it = items[i];
  cur = i; lastT = it.start || 0;
  stage.classList.remove("failed");
  stage.classList.add("loading");
  [...list.children].forEach((li, j) => li.firstChild.classList.toggle("on", j === i));
  $("title").textContent = it.title || "Video";
  const meta = [];
  if (hasRange(it)) meta.push(rangeText(it));
  if (items.length > 1) meta.push((i + 1) + " of " + items.length);
  $("meta").textContent = meta.join("  ·  ");
  hls?.destroy(); hls = null;
  if (it.stream_url.includes(".m3u8") && !video.canPlayType("application/vnd.apple.mpegurl") && window.Hls?.isSupported()) {
    hls = new Hls();
    hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail(); });
    hls.loadSource(it.stream_url); hls.attachMedia(video);
  } else video.src = it.stream_url;
  video.addEventListener("loadedmetadata", () => {
    if (it.start) video.currentTime = it.start;
    if (autoplay) video.play().catch(() => {});
  }, { once: true });
}

function fail() { stage.classList.remove("loading"); stage.classList.add("failed"); }
const next = () => { if (cur + 1 < items.length) load(cur + 1, true); };
const toggle = () => (video.paused ? video.play().catch(() => {}) : video.pause());
const open = () => items[cur] && app.openLink({ url: items[cur].player_url });

function paint() {
  const d = video.duration, t = video.currentTime;
  if (!d || !isFinite(d)) return;
  if (!dragging) { $("fill").style.width = pct(t / d); $("knob").style.left = pct(t / d); }
  const it = items[cur];
  // The band marks a moment inside a longer stream; a range spanning the whole stream marks nothing.
  const s = it?.start || 0, e = it?.end != null ? Math.min(it.end, d) : d;
  const isSlice = it && hasRange(it) && (e - s) / d < 0.97;
  $("band").style.left = pct(s / d); $("band").style.width = isSlice ? pct((e - s) / d) : "0";
  $("time").innerHTML = fmt(t) + " <span>/ " + fmt(d) + "</span>";
}

// A range ends when playback crosses its end; scrubbing past it on purpose doesn't count.
video.addEventListener("timeupdate", () => {
  const it = items[cur], t = video.currentTime;
  if (it?.end != null && !dragging && lastT < it.end && t >= it.end && t - lastT < 1.5) {
    video.pause();
    if (cur + 1 < items.length) next();
  }
  lastT = t;
  paint();
});
["durationchange", "progress", "seeked"].forEach((e) => video.addEventListener(e, paint));
video.addEventListener("ended", next);
video.addEventListener("error", fail);
video.addEventListener("waiting", () => stage.classList.add("loading"));
["canplay", "playing", "loadeddata"].forEach((e) => video.addEventListener(e, () => stage.classList.remove("loading")));
video.addEventListener("play", () => { stage.classList.add("playing"); card.classList.add("playing"); $("pp").innerHTML = ICON.pause; $("pp").ariaLabel = "Pause"; wake(); });
video.addEventListener("pause", () => { stage.classList.remove("playing", "idle"); card.classList.remove("playing"); $("pp").innerHTML = ICON.play; $("pp").ariaLabel = "Play"; });
video.addEventListener("volumechange", () => { $("mute").innerHTML = video.muted ? ICON.muted : ICON.sound; });

// Controls fade out while playing and the pointer is still.
function wake() {
  stage.classList.remove("idle");
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!video.paused && !dragging) stage.classList.add("idle"); }, 2400);
}
stage.addEventListener("pointermove", wake);
stage.addEventListener("pointerleave", () => { if (!video.paused) stage.classList.add("idle"); });

const scrub = $("scrub");
const ratioAt = (e) => { const r = scrub.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
scrub.addEventListener("pointermove", (e) => {
  const x = ratioAt(e);
  $("tip").style.left = pct(x); $("tip").textContent = fmt(x * (video.duration || 0));
  if (dragging) { $("fill").style.width = pct(x); $("knob").style.left = pct(x); }
});
scrub.addEventListener("pointerdown", (e) => { dragging = true; scrub.classList.add("drag"); scrub.setPointerCapture(e.pointerId); $("fill").style.width = pct(ratioAt(e)); $("knob").style.left = pct(ratioAt(e)); });
scrub.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false; scrub.classList.remove("drag");
  if (video.duration) { video.currentTime = ratioAt(e) * video.duration; lastT = video.currentTime; }
});

video.addEventListener("click", toggle);
$("big").onclick = toggle;
$("pp").onclick = toggle;
$("mute").onclick = () => { video.muted = !video.muted; };
$("speed").onclick = () => {
  const s = SPEEDS[(SPEEDS.indexOf(video.playbackRate) + 1) % SPEEDS.length];
  video.playbackRate = s; $("speed").textContent = s + "×";
};
$("open").onclick = open;
$("fail-open").onclick = open;
if (document.fullscreenEnabled) {
  $("fs").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen());
  document.addEventListener("fullscreenchange", () => { $("fs").innerHTML = document.fullscreenElement ? ICON.shrink : ICON.expand; });
  video.addEventListener("dblclick", () => $("fs").click());
} else $("fs").hidden = true;

document.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("button") && (e.key === " " || e.key === "Enter")) return;
  const k = e.key.toLowerCase();
  if (k === " " || k === "k") { e.preventDefault(); toggle(); }
  else if (k === "arrowright") video.currentTime += 5;
  else if (k === "arrowleft") video.currentTime -= 5;
  else if (k === "m") video.muted = !video.muted;
  else if (k === "f" && document.fullscreenEnabled) $("fs").click();
  else return;
  wake();
});

function render(data) {
  items = data?.items ?? [];
  if (!items.length) { $("card").innerHTML = '<div class="empty">Nothing to play.</div>'; return; }
  list.innerHTML = "";
  list.hidden = items.length < 2;
  items.forEach((it, i) => {
    const li = document.createElement("li");
    li.innerHTML = '<button class="chapter"><span class="n"></span><span class="eq"><i></i><i></i><i></i></span><span class="label"></span><span class="range"></span></button>';
    const b = li.firstChild;
    b.querySelector(".n").textContent = i + 1;
    b.querySelector(".label").textContent = it.title || "Clip " + (i + 1);
    b.querySelector(".range").textContent = hasRange(it) ? rangeText(it) : "";
    b.onclick = () => load(i, true);
    list.appendChild(li);
  });
  load(0, false);
}

app.ontoolresult = (res) => render(res.structuredContent);
app.onhostcontextchanged = (ctx) => ctx.theme && applyDocumentTheme(ctx.theme);
await app.connect();
const theme = app.getHostContext()?.theme;
if (theme) applyDocumentTheme(theme);
</script>
</body>
</html>`;
}
