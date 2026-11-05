/**
 * The show_video view: one HTML page the host renders in a sandboxed iframe.
 * Built from the VideoDB UI component library (videodb-component-library.vercel.app): its tokens and the
 * Video Player, Player Controls, Timestamp, Icon Button, Button, Spinner, Card, Item and Duration Label parts,
 * translated to plain CSS because the view ships as a single inline page.
 * The inline script avoids template literals so this file can embed it as one.
 */

/** tokens.css usage tokens this view uses, light then dark. Primitives are only referenced from here. */
const TOKENS = `
  :root {
    --greyscale-0: #ffffff; --greyscale-50: #f7f7f7; --greyscale-100: #efefef; --greyscale-200: #e5e5e5; --greyscale-300: #d4d4d4;
    --greyscale-400: #a3a3a3; --greyscale-500: #737373; --greyscale-600: #525252; --greyscale-700: #404040; --greyscale-800: #262626;
    --greyscale-850: #1f1f1f; --greyscale-900: #171717; --greyscale-950: #0f0f0f; --greyscale-1000: #000000;
    --orange-50: #fff5ec; --orange-300: #ffad6d; --orange-400: #ff7e32; --orange-500: #ec5b16; --orange-600: #ff4000; --orange-700: #c14103; --orange-800: #821f0c;
    --red-50: #fbe9e9; --red-300: #ec7c7c; --red-600: #b31d1d;

    --color-background-neutral-primary: var(--greyscale-0);
    --color-background-neutral-secondary: var(--greyscale-100);
    --color-background-neutral-tertiary: var(--greyscale-200);
    --color-background-neutral-disabled: var(--greyscale-300);
    --color-background-neutral-hover: var(--greyscale-50);
    --color-background-neutral-pressed: var(--greyscale-100);
    --color-background-neutral-inverse-primary: var(--greyscale-1000);
    --color-background-neutral-inverse-secondary: var(--greyscale-800);
    --color-background-brand-primary: var(--orange-500);
    --color-background-brand-primary-hover: var(--orange-600);
    --color-background-brand-primary-pressed: var(--orange-700);
    --color-background-overlay-scrim: #00000080;
    --color-background-overlay-glass: #0000004d;
    --color-background-overlay-veil: #0000001f;
    --color-background-overlay-light: #ffffff4d;

    --color-text-neutral-primary: var(--greyscale-800);
    --color-text-neutral-tertiary: var(--greyscale-600);
    --color-text-neutral-disabled: var(--greyscale-400);
    --color-text-neutral-hover: var(--greyscale-900);
    --color-text-neutral-inverse-primary: var(--greyscale-50);
    --color-text-neutral-inverse-secondary: var(--greyscale-200);
    --color-text-neutral-inverse-tertiary: var(--greyscale-300);
    --color-text-brand-primary: var(--orange-700);
    --color-text-brand-hover: var(--orange-800);
    --color-text-brand-inverse: var(--orange-50);
    --color-text-error-primary: var(--red-600);

    --color-icon-neutral-secondary: var(--greyscale-700);
    --color-icon-neutral-inverse-primary: var(--greyscale-50);
    --color-icon-neutral-inverse-tertiary: var(--greyscale-300);

    --color-border-neutral-primary: var(--greyscale-100);
    --color-border-neutral-hover: var(--greyscale-300);
    --color-border-neutral-inverse-primary: var(--greyscale-600);
    --color-border-brand-primary: var(--orange-500);

    --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Menlo', monospace;
    --shadow-focus-ring: 0 0 0 2px var(--color-background-neutral-primary), 0 0 0 4px var(--color-border-brand-primary);
    --blur-sm: 10px;
    color-scheme: light;
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --color-background-neutral-primary: var(--greyscale-950);
    --color-background-neutral-secondary: var(--greyscale-800);
    --color-background-neutral-tertiary: var(--greyscale-700);
    --color-background-neutral-disabled: var(--greyscale-800);
    --color-background-neutral-hover: var(--greyscale-850);
    --color-background-neutral-pressed: var(--greyscale-800);
    --color-background-neutral-inverse-primary: var(--greyscale-600);
    --color-background-neutral-inverse-secondary: var(--greyscale-700);
    --color-text-neutral-primary: var(--greyscale-50);
    --color-text-neutral-tertiary: var(--greyscale-400);
    --color-text-neutral-disabled: var(--greyscale-600);
    --color-text-neutral-hover: var(--greyscale-0);
    --color-text-brand-primary: var(--orange-400);
    --color-text-brand-hover: var(--orange-300);
    --color-text-error-primary: var(--red-300);
    --color-icon-neutral-secondary: var(--greyscale-200);
    --color-border-neutral-primary: var(--greyscale-800);
    --color-border-neutral-hover: var(--greyscale-600);
  }
`;

export function playerHtml(extAppsUrl: string, hlsUrl: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,300,0..1,0&display=block">
<style>
  ${TOKENS}
  * { box-sizing: border-box; }
  body { margin: 0; background: transparent; color: var(--color-text-neutral-primary); font-family: var(--font-sans); font-size: 14px; line-height: 20px; -webkit-font-smoothing: antialiased; }
  button { font: inherit; color: inherit; border: 0; background: none; padding: 0; margin: 0; }
  p { margin: 0; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  [hidden] { display: none !important; }
  .icon { display: inline-block; flex-shrink: 0; overflow: hidden; line-height: 1; text-align: center; }

  /* Card, size sm (--card-spacing 16) */
  .card { position: relative; display: flex; flex-direction: column; gap: 16px; padding: 16px 0; border-radius: 16px; border: 1px solid var(--color-border-neutral-primary); background: var(--color-background-neutral-primary); color: var(--color-text-neutral-primary); }
  .card-header { padding: 0 16px; display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
  .card-heading { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 4px; }
  .card-title { font-size: 14px; line-height: 20px; font-weight: 600; }
  .card-description { font-size: 14px; line-height: 20px; color: var(--color-text-neutral-tertiary); }
  .card-actions { display: flex; align-items: center; gap: 12px; }
  .card-content { padding: 0 16px; display: flex; flex-direction: column; gap: 12px; }

  /* Video Player */
  .vp { position: relative; aspect-ratio: 16 / 9; width: 100%; overflow: hidden; border-radius: 16px; background: var(--color-background-neutral-inverse-secondary); outline: none; }
  .vp:focus-visible { box-shadow: var(--shadow-focus-ring); }
  .vp video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
  .vp-veil { pointer-events: none; position: absolute; inset: 0; background: var(--color-background-overlay-veil); }
  .vp-top { position: absolute; left: 12px; right: 12px; top: 12px; display: flex; align-items: flex-start; gap: 12px; }
  .vp-caption { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 2px; padding-left: 8px; }
  .vp-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 20px; font-weight: 500; color: var(--color-text-neutral-inverse-primary); }
  .vp-source { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--color-text-neutral-inverse-tertiary); }
  .vp-actions { display: flex; flex-shrink: 0; gap: 4px; }
  .vp-centre { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
  .vp-bottom { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 8px; }
  .vp-error { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; background: var(--color-background-overlay-scrim); text-align: center; color: var(--color-icon-neutral-inverse-primary); }
  .vp-error p { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--color-text-neutral-inverse-primary); }

  /* Icon Button, inverse hierarchy, circle */
  .icon-btn { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 9999px; cursor: pointer; outline: none; transition: background-color .15s, color .15s; background: var(--color-background-overlay-glass); color: var(--color-icon-neutral-inverse-primary); -webkit-backdrop-filter: blur(var(--blur-sm)); backdrop-filter: blur(var(--blur-sm)); }
  .icon-btn:hover { background: var(--color-background-overlay-scrim); }
  .icon-btn:focus-visible { box-shadow: var(--shadow-focus-ring); }
  .icon-btn.sm { width: 36px; height: 36px; }
  .icon-btn.lg { width: 44px; height: 44px; }

  /* Player Controls: glass groups of 36px Player Buttons */
  .controls { display: flex; width: 100%; align-items: center; gap: 8px; }
  .glass { display: flex; align-items: center; gap: 4px; border-radius: 9999px; background: var(--color-background-overlay-glass); padding: 4px; -webkit-backdrop-filter: blur(var(--blur-sm)); backdrop-filter: blur(var(--blur-sm)); }
  .glass.sound { padding-right: 16px; }
  .spacer { flex: 1; }
  .player-btn { display: flex; width: 36px; height: 36px; flex-shrink: 0; cursor: pointer; align-items: center; justify-content: center; border-radius: 9999px; color: var(--color-icon-neutral-inverse-primary); outline: none; transition: background-color .15s; }
  .player-btn:hover { background: color-mix(in oklab, var(--color-background-overlay-light) 50%, transparent); }
  .player-btn:active { background: var(--color-background-overlay-light); }
  .player-btn:focus-visible { box-shadow: var(--shadow-focus-ring); }

  /* Timestamp, sm, inverse tone */
  .timestamp { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-weight: 500; font-variant-numeric: tabular-nums; font-size: 12px; line-height: 16px; }
  .timestamp .elapsed { color: var(--color-text-neutral-inverse-primary); }
  .timestamp .sep { color: var(--color-text-neutral-inverse-tertiary); }
  .timestamp .total { color: var(--color-text-neutral-inverse-secondary); }

  /* Timeline Scrubber, inverse tone */
  .scrub { position: relative; display: flex; height: 24px; width: 100%; cursor: pointer; touch-action: none; align-items: center; user-select: none; }
  .track { position: relative; height: 4px; flex-grow: 1; overflow: hidden; border-radius: 9999px; background: var(--color-background-overlay-light); }
  .range { position: absolute; left: 0; height: 100%; border-radius: 9999px; background: var(--color-background-brand-primary); }
  .thumb { position: absolute; top: 50%; display: block; width: 8px; height: 8px; border-radius: 9999px; border: 1px solid var(--color-icon-neutral-inverse-primary); background: var(--color-background-brand-primary); outline: none; transform: translate(-50%, -50%); transition: width .1s, height .1s; }
  .thumb::after { content: ""; position: absolute; inset: -8px; border-radius: 9999px; }
  .scrub:hover .thumb, .thumb:focus-visible { width: 12px; height: 12px; }
  .scrub.drag .thumb { width: 14px; height: 14px; }
  .thumb:focus-visible { box-shadow: var(--shadow-focus-ring); }

  /* Spinner */
  .spinner { display: inline-flex; flex-shrink: 0; }
  .spinner svg { animation: spin 1s linear infinite; }
  .spinner.inverse .t { stroke: var(--color-border-neutral-inverse-primary); }
  .spinner.inverse .a { stroke: var(--color-icon-neutral-inverse-primary); }
  .spinner.current .t { stroke: currentColor; opacity: .25; }
  .spinner.current .a { stroke: currentColor; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Button, size sm */
  .btn { display: inline-flex; flex-shrink: 0; cursor: pointer; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; border-radius: 8px; font-weight: 600; transition: background-color .15s, border-color .15s, color .15s; outline: none; height: 36px; padding: 0 12px; font-size: 14px; line-height: 20px; }
  .btn:focus-visible { box-shadow: var(--shadow-focus-ring); }
  .btn.primary { background: var(--color-background-brand-primary); color: var(--color-text-brand-inverse); }
  .btn.primary:not([aria-disabled="true"]):hover { background: var(--color-background-brand-primary-hover); }
  .btn.primary:not([aria-disabled="true"]):active { background: var(--color-background-brand-primary-pressed); }
  .btn.primary[aria-disabled="true"] { background: var(--color-background-neutral-disabled); color: var(--color-text-neutral-disabled); cursor: not-allowed; }
  .btn.secondary { border: 1px solid var(--color-border-neutral-primary); background: var(--color-background-neutral-primary); color: var(--color-text-neutral-primary); }
  .btn.secondary:hover { border-color: var(--color-border-neutral-hover); background: var(--color-background-neutral-hover); color: var(--color-text-neutral-hover); }
  .btn.secondary:active { background: var(--color-background-neutral-pressed); }
  .link { cursor: pointer; font-weight: 600; color: var(--color-text-brand-primary); outline: none; border-radius: 4px; }
  .link:hover { color: var(--color-text-brand-hover); }
  .link:focus-visible { box-shadow: var(--shadow-focus-ring); }

  /* Item group: Item size sm, default variant, rendered as a button; selection is grey */
  .items { display: flex; width: 100%; flex-direction: column; margin: 0; padding: 0; list-style: none; }
  .items li { display: flex; }
  /* 4px + the item's 12px padding lines item text up with the card's 16px content edge. */
  .card > .items { padding: 0 4px; }
  .item { display: flex; width: 100%; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; border: 1px solid transparent; text-align: left; font-size: 14px; line-height: 20px; color: var(--color-text-neutral-primary); cursor: pointer; outline: none; transition: background-color .15s; }
  .item:hover { background: var(--color-background-neutral-hover); }
  .item[aria-current="true"] { background: var(--color-background-neutral-secondary); }
  .item:focus-visible { box-shadow: var(--shadow-focus-ring); }
  .item-media { display: flex; flex-shrink: 0; align-items: center; justify-content: center; align-self: flex-start; width: 40px; height: 40px; border-radius: 8px; background: var(--color-background-neutral-secondary); color: var(--color-icon-neutral-secondary); font-family: var(--font-mono); font-weight: 500; font-size: 12px; }
  .item[aria-current="true"] .item-media { background: var(--color-background-neutral-tertiary); }
  .item-content { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
  .item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 20px; font-weight: 500; color: var(--color-text-neutral-primary); }
  .item-description { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--color-text-neutral-tertiary); }
  .item-description .mono, .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

  /* Duration Label, sm, solid */
  .duration { display: inline-flex; width: fit-content; flex-shrink: 0; align-items: center; height: 22px; padding: 0 8px; border-radius: 4px; font-size: 12px; line-height: 18px; font-weight: 500; font-variant-numeric: tabular-nums; background: var(--color-background-neutral-inverse-primary); color: var(--color-text-neutral-inverse-primary); }

  /* Reel strip: one segment per clip, sized by its length; progress uses the timeline's brand fill */
  .strip { display: flex; gap: 4px; height: 28px; }
  .seg { position: relative; min-width: 24px; overflow: hidden; cursor: pointer; border-radius: 4px; background: var(--color-background-neutral-secondary); color: var(--color-text-neutral-tertiary); font-family: var(--font-mono); font-size: 12px; font-weight: 500; outline: none; transition: background-color .15s, color .15s; }
  .seg:hover { background: var(--color-background-neutral-tertiary); color: var(--color-text-neutral-primary); }
  .seg[aria-current="true"] { background: var(--color-background-neutral-tertiary); color: var(--color-text-neutral-primary); }
  .seg::after { content: ""; position: absolute; left: 0; bottom: 0; height: 4px; width: var(--p, 0); background: var(--color-background-brand-primary); }
  .seg:focus-visible { box-shadow: var(--shadow-focus-ring); }
  .status { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--color-text-neutral-tertiary); }
  .status.error { color: var(--color-text-error-primary); }

  .empty { padding: 40px 16px; text-align: center; color: var(--color-text-neutral-tertiary); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    .spinner svg { animation-duration: 2s !important; animation-iteration-count: infinite !important; }
  }
</style>
</head>
<body>
<div id="root">
  <div class="card" id="card">
    <div class="card-header" id="reel-head" hidden>
      <div class="card-heading"><p class="card-title" id="rtitle"></p><p class="card-description" id="rmeta"></p></div>
      <div class="card-actions">
        <button class="btn secondary" id="edit" type="button"></button>
        <button class="btn primary" id="dl" type="button"></button>
      </div>
    </div>
    <div class="card-content">
      <div class="vp" id="vp" tabindex="0" role="region" aria-label="Video player">
        <video id="v" playsinline preload="metadata"></video>
        <div class="vp-veil" aria-hidden="true"></div>
        <div class="vp-top">
          <div class="vp-caption"><p class="vp-title" id="title"></p><p class="vp-source" id="source"></p></div>
          <div class="vp-actions"><button class="icon-btn sm" id="open" type="button" aria-label="Open on VideoDB" title="Open on VideoDB"></button></div>
        </div>
        <div class="vp-error" id="err" role="alert" hidden></div>
        <span class="vp-centre" id="spin" hidden></span>
        <button class="icon-btn lg vp-centre" id="big" type="button" tabindex="-1" aria-hidden="true"></button>
        <p role="status" class="sr-only" id="buffering"></p>
        <div class="vp-bottom" id="bottom">
          <div class="scrub" id="scrub">
            <div class="track"><div class="range" id="range"></div></div>
            <span class="thumb" id="thumb" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0"></span>
          </div>
          <div class="controls">
            <div class="glass"><button class="player-btn" id="pp" type="button"></button></div>
            <div class="glass sound"><button class="player-btn" id="mute" type="button"></button><span class="timestamp" id="time"></span></div>
            <div class="spacer"></div>
            <div class="glass"><button class="player-btn" id="pip" type="button" aria-label="Picture in picture" title="Picture in picture" hidden></button><button class="player-btn" id="fs" type="button"></button></div>
          </div>
        </div>
      </div>
      <div class="strip" id="strip" hidden></div>
      <p class="status" id="note" hidden></p>
    </div>
    <ul class="items" id="list" role="list" hidden></ul>
  </div>
</div>
<script src="${hlsUrl}"></script>
<script type="module">
import { App, applyDocumentTheme } from "${extAppsUrl}";

const $ = (id) => document.getElementById(id);
const video = $("v"), vp = $("vp"), list = $("list"), strip = $("strip"), card = $("card");
const app = new App({ name: "VideoDB player", version: "1.0.0" });
let items = [], cur = -1, hls = null, src = "", lastT = 0, dragging = false;
// Reel mode: the clips play back to back and the timeline and clock count reel time, not source time.
let reel = false, reelTitle = "", offs = [], total = 0;

/** Icon: Material Symbols Outlined, weight 300, optical size following the rendered size. */
function icon(name, size, filled) {
  return '<span class="material-symbols-outlined icon" aria-hidden="true" style="font-size:' + size + 'px;width:' + size + 'px;height:' + size + 'px;font-variation-settings:\\'FILL\\' ' + (filled ? 1 : 0) + ', \\'wght\\' 300, \\'GRAD\\' 0, \\'opsz\\' ' + Math.min(48, Math.max(20, size)) + '">' + name + '</span>';
}
/** Spinner: a ring with a 225° arc. */
function spinner(size, tone) {
  const r = 10.32, c = 2 * Math.PI * r;
  return '<span class="spinner ' + tone + '" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" width="' + size + '" height="' + size + '"><circle class="t" cx="12" cy="12" r="' + r + '" stroke-width="3.36"/><circle class="a" cx="12" cy="12" r="' + r + '" stroke-width="3.36" stroke-dasharray="' + (c * 0.625) + ' ' + c + '" transform="rotate(-90 12 12)"/></svg></span>';
}
const setBtn = (el, ic, label) => { el.innerHTML = icon(ic, 16); el.ariaLabel = label; el.title = label; };

// Duration Label / Timestamp format: mm:ss, or h:mm:ss from one hour.
const fmt = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? h + ":" + String(m).padStart(2, "0") + ":" + sec : String(m).padStart(2, "0") + ":" + sec;
};
const spoken = (s) => { s = Math.floor(s || 0); const m = Math.floor(s / 60), r = s % 60; return (m ? m + (m > 1 ? " minutes " : " minute ") : "") + r + (r === 1 ? " second" : " seconds"); };
const pct = (x) => (Math.max(0, Math.min(1, x)) * 100) + "%";
const hasRange = (it) => it.start != null || it.end != null;
const rangeText = (it) => fmt(it.start || 0) + " – " + (it.end != null ? fmt(it.end) : "end");
const len = (it) => it.end - it.start;

function showState() {
  const failed = !$("err").hidden, playing = !video.paused;
  $("spin").hidden = failed || !(loading && playing);
  $("big").hidden = failed || playing;
  $("bottom").hidden = failed;
  $("buffering").textContent = loading && playing && !failed ? "Buffering" : "";
  setBtn($("pp"), playing ? "pause" : "play_arrow", playing ? "Pause" : "Play");
}
let loading = false;

function load(i, autoplay, at) {
  const it = items[i];
  cur = i; lastT = at != null ? at : (it.start || 0);
  $("err").hidden = true;
  [...list.children].forEach((li, j) => li.firstChild.setAttribute("aria-current", String(j === i)));
  [...strip.children].forEach((s, j) => { s.setAttribute("aria-current", String(j === i)); if (j !== i) s.style.setProperty("--p", j < i ? "100%" : "0"); });
  $("title").textContent = reel ? (it.title || "Clip " + (i + 1)) : (it.title || "Video");
  const source = reel ? ["Clip " + (i + 1) + " of " + items.length, rangeText(it) + " of source"] : [];
  if (!reel && hasRange(it)) source.push(rangeText(it));
  if (!reel && items.length > 1) source.push((i + 1) + " of " + items.length);
  $("source").textContent = source.join("  ·  ");
  $("source").hidden = !source.length;
  vp.ariaLabel = "Video: " + $("title").textContent;
  const seek = () => { video.currentTime = lastT; if (autoplay) video.play().catch(() => {}); };
  // Clips of the same video reuse the loaded stream, so moving between them is a seek, not a reload.
  if (src === it.stream_url && video.readyState >= 1) { seek(); paint(); return; }
  src = it.stream_url;
  hls?.destroy(); hls = null;
  if (it.stream_url.includes(".m3u8") && !video.canPlayType("application/vnd.apple.mpegurl") && window.Hls?.isSupported()) {
    hls = new Hls();
    hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail(); });
    hls.loadSource(it.stream_url); hls.attachMedia(video);
  } else video.src = it.stream_url;
  video.addEventListener("loadedmetadata", seek, { once: true });
}

/** Reel seconds → the clip that holds them, played from that point. */
function seekReel(r, autoplay) {
  r = Math.max(0, Math.min(total - 0.05, r));
  let i = 0;
  while (i < items.length - 1 && r >= offs[i] + len(items[i])) i++;
  load(i, autoplay, items[i].start + (r - offs[i]));
}
const reelNow = () => offs[cur] + Math.max(0, Math.min(len(items[cur]), video.currentTime - items[cur].start));
/** Position and length on the timeline: reel time in a reel, source time otherwise. */
const now = () => (reel ? reelNow() : video.currentTime);
const span = () => (reel ? total : (isFinite(video.duration) ? video.duration : 0));
function seekTo(t) {
  if (reel) seekReel(t, !video.paused);
  else if (video.duration) { video.currentTime = Math.max(0, Math.min(video.duration, t)); lastT = video.currentTime; }
}

function fail() { loading = false; $("err").hidden = false; showState(); }

function paint(x) {
  const d = span(), t = x != null ? x * d : now();
  if (!d) return;
  $("range").style.width = pct(t / d); $("thumb").style.left = pct(t / d);
  $("thumb").setAttribute("aria-valuemax", String(Math.round(d)));
  $("thumb").setAttribute("aria-valuenow", String(Math.round(t)));
  $("thumb").setAttribute("aria-valuetext", spoken(t) + " of " + spoken(d));
  $("time").innerHTML = '<span class="elapsed">' + fmt(t) + '</span><span class="sep" aria-hidden="true">/</span><span class="sr-only">of</span><span class="total">' + fmt(d) + "</span>";
  if (reel && x == null) strip.children[cur]?.style.setProperty("--p", pct((t - offs[cur]) / len(items[cur])));
}

// A range ends when playback crosses its end; seeking past it on purpose doesn't count.
video.addEventListener("timeupdate", () => {
  const it = items[cur], t = video.currentTime;
  if (it?.end != null && !dragging && lastT < it.end && t >= it.end && t - lastT < 1.5) {
    video.pause();
    if (cur + 1 < items.length) load(cur + 1, true);
  }
  lastT = t;
  if (!dragging) paint();
});
["durationchange", "loadedmetadata", "seeked"].forEach((e) => video.addEventListener(e, () => paint()));
video.addEventListener("ended", () => { if (cur + 1 < items.length) load(cur + 1, true); });
video.addEventListener("error", fail);
video.addEventListener("waiting", () => { loading = true; showState(); });
["playing", "canplay"].forEach((e) => video.addEventListener(e, () => { loading = false; showState(); }));
["play", "pause"].forEach((e) => video.addEventListener(e, () => { if (e === "pause") loading = false; showState(); }));
video.addEventListener("volumechange", () => setBtn($("mute"), video.muted ? "volume_off" : "volume_up", video.muted ? "Unmute" : "Mute"));

const toggle = () => (video.paused ? video.play().catch(() => {}) : video.pause());
const open = () => items[cur] && app.openLink({ url: items[cur].player_url });

// Timeline Scrubber: drag anywhere on the bar; the thumb is the slider for the keyboard.
const scrub = $("scrub");
const ratioAt = (e) => { const r = scrub.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
scrub.addEventListener("pointerdown", (e) => { dragging = true; scrub.classList.add("drag"); scrub.setPointerCapture(e.pointerId); paint(ratioAt(e)); });
scrub.addEventListener("pointermove", (e) => { if (dragging) paint(ratioAt(e)); });
scrub.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false; scrub.classList.remove("drag");
  seekTo(ratioAt(e) * span());
});
// Arrow keys seek 5 s (10 s with Shift), Page Up / Page Down 10 s, Home and End jump to the ends.
$("thumb").addEventListener("keydown", (e) => {
  const arrow = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
  const page = { PageUp: 1, PageDown: -1 }[e.key];
  let to = null;
  if (arrow || page) to = now() + (arrow ? arrow * (e.shiftKey ? 10 : 5) : page * 10);
  else if (e.key === "Home") to = 0;
  else if (e.key === "End") to = span();
  if (to == null) return;
  e.preventDefault(); e.stopPropagation();
  seekTo(to);
});

video.addEventListener("click", toggle);
$("big").onclick = toggle;
$("pp").onclick = toggle;
$("mute").onclick = () => { video.muted = !video.muted; };
$("open").onclick = open;
const toggleFullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : vp.requestFullscreen());
if (document.fullscreenEnabled) {
  $("fs").onclick = toggleFullscreen;
  document.addEventListener("fullscreenchange", () => {
    const on = document.fullscreenElement === vp;
    setBtn($("fs"), on ? "fullscreen_exit" : "fullscreen", on ? "Exit full screen" : "Full screen");
  });
} else $("fs").hidden = true;
if ("pictureInPictureEnabled" in document && document.pictureInPictureEnabled) {
  $("pip").hidden = false;
  $("pip").onclick = () => (document.pictureInPictureElement ? document.exitPictureInPicture() : video.requestPictureInPicture());
}

// Space / K play-pause, ← → skip 5 s, M mute, F fullscreen — while the player has focus, not inside a control.
vp.addEventListener("keydown", (e) => {
  if (!$("err").hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches("button, [role=slider]")) return;
  const k = e.key.toLowerCase();
  const keys = { " ": toggle, k: toggle, arrowleft: () => seekTo(now() - 5), arrowright: () => seekTo(now() + 5), m: () => { video.muted = !video.muted; }, f: toggleFullscreen };
  if (keys[k]) { e.preventDefault(); keys[k](); }
});

// Reel export: export_reel joins the clips and renders the MP4; the view polls it until the file exists.
let exporting = false, mp4 = "";
const fileName = () => (reelTitle.replace(/[^\\w\\- ]+/g, "").trim().replace(/\\s+/g, "-").toLowerCase() || "reel") + ".mp4";

function note(text, tone, action) {
  const n = $("note");
  n.hidden = !text; n.className = "status" + (tone === "error" ? " error" : ""); n.textContent = text || "";
  if (action) { const b = document.createElement("button"); b.type = "button"; b.className = "link"; b.textContent = action.label; b.onclick = action.run; n.append(" ", b); }
}
/** Download button: its label says the state; while working it shows a spinner and is aria-disabled. */
function setDl(label, busy) {
  const b = $("dl");
  b.innerHTML = (busy ? spinner(16, "current") : icon("download", 16)) + "<span>" + label + "</span>";
  b.setAttribute("aria-disabled", String(busy)); b.setAttribute("aria-busy", String(busy));
}

async function step(args) {
  const res = await app.callServerTool({ name: "export_reel", arguments: Object.assign({ name: fileName() }, args) });
  if (res.isError) throw new Error((res.content?.[0]?.text || "The export failed.").replace(/^Error: /, ""));
  return res.structuredContent;
}

async function save() {
  // Hosts that can save files fetch the MP4 themselves; elsewhere the link opens in the browser.
  if (app.getHostCapabilities()?.downloadFile) {
    const r = await app.downloadFile({ contents: [{ type: "resource_link", uri: mp4, name: fileName(), mimeType: "video/mp4" }] }).catch(() => ({ isError: true }));
    if (!r.isError) return;
  }
  app.openLink({ url: mp4 });
}

async function exportReel() {
  if (exporting) return;
  if (mp4) return save();
  exporting = true; note("");
  try {
    setDl("Joining clips", true);
    let r = await step({ clips: items.map((c) => ({ video_id: c.video_id, collection_id: c.collection_id || "default", start: c.start, end: c.end })) });
    while (r.stage === "joining" || r.stage === "rendering") {
      setDl(r.stage === "joining" ? "Joining clips" : "Rendering MP4", true);
      await new Promise((ok) => setTimeout(ok, 4000));
      r = await step({ stage: r.stage, output_url: r.output_url });
    }
    if (r.stage === "blocked") {
      setDl("Download MP4", false);
      note("There aren't enough VideoDB credits to export this reel. No subscription is needed.", "error", { label: "Add credits", run: () => app.openLink({ url: r.console_url }) });
      return;
    }
    mp4 = r.download_url;
    setDl("Save MP4", false);
    note("Your MP4 is ready: " + fmt(total) + ", " + items.length + (items.length > 1 ? " clips." : " clip."), "", { label: "Open link", run: () => app.openLink({ url: mp4 }) });
    app.updateModelContext({ content: [{ type: "text", text: "The user exported the reel \\"" + reelTitle + "\\" to an MP4: " + mp4 }] }).catch(() => {});
    await save();
  } catch (e) {
    setDl("Download MP4", false);
    note((e.message || "The export failed.") + " Try again.", "error");
  } finally { exporting = false; }
}

function editInEditor() {
  const clips = items.map((c, i) => (i + 1) + ". " + c.video_id + " " + c.start + "s–" + c.end + "s" + (c.title ? " (" + c.title + ")" : ""));
  app.sendMessage({ role: "user", content: [{ type: "text", text: "Open this reel in the VideoDB video editor so I can fine-tune it:\\n" + clips.join("\\n") }] }).catch(() => {});
}

function renderReel(data) {
  reelTitle = data.title || "Highlight reel";
  offs = []; total = 0;
  items.forEach((it) => { offs.push(total); total += len(it); });
  const videos = new Set(items.map((it) => it.video_id)).size;
  $("rtitle").textContent = reelTitle;
  $("rmeta").textContent = [fmt(total), items.length + (items.length > 1 ? " clips" : " clip"), videos + (videos > 1 ? " videos" : " video")].join(" · ");
  strip.innerHTML = "";
  items.forEach((it, i) => {
    const s = document.createElement("button");
    s.type = "button"; s.className = "seg"; s.style.flex = String(len(it)); s.textContent = i + 1;
    s.ariaLabel = "Play clip " + (i + 1) + ", " + (it.title || "") + ", " + spoken(len(it));
    s.title = (it.title || "Clip " + (i + 1)) + " · " + fmt(len(it));
    s.onclick = () => load(i, true);
    strip.appendChild(s);
  });
  $("edit").innerHTML = icon("edit", 16) + "<span>Edit in editor</span>";
  $("edit").onclick = editInEditor;
  setDl("Download MP4", false);
  $("dl").onclick = exportReel;
  $("reel-head").hidden = false;
  strip.hidden = false;
  $("open").hidden = true;
}

function render(data) {
  items = data?.items ?? [];
  if (!items.length) { card.innerHTML = '<p class="empty">Nothing to play.</p>'; return; }
  reel = data.layout === "reel";
  if (reel) renderReel(data);
  // A single video is the bare Video Player; a playlist or reel sits in a Card with its clip list.
  if (!reel && items.length < 2) { card.style.cssText = "padding:0;border:0;background:transparent"; card.firstElementChild.nextElementSibling.style.padding = "0"; }
  list.innerHTML = "";
  list.hidden = items.length < 2;
  list.ariaLabel = reel ? "Clips in this reel" : "Videos";
  items.forEach((it, i) => {
    const li = document.createElement("li");
    li.innerHTML = '<button class="item" type="button"><span class="item-media"></span><span class="item-content"><span class="item-title"></span><span class="item-description"></span></span></button>';
    const b = li.firstChild;
    b.querySelector(".item-media").textContent = String(i + 1);
    b.querySelector(".item-title").textContent = it.title || "Clip " + (i + 1);
    const desc = b.querySelector(".item-description");
    if (reel) desc.innerHTML = '<span class="mono">' + fmt(offs[i]) + "</span> in reel · <span class=\\"mono\\">" + rangeText(it) + "</span> of source";
    else if (hasRange(it)) desc.innerHTML = '<span class="mono">' + rangeText(it) + "</span>";
    else desc.remove();
    if (reel) {
      const d = document.createElement("time");
      d.className = "duration"; d.dateTime = "PT" + Math.round(len(it)) + "S"; d.textContent = fmt(len(it));
      b.appendChild(d);
    }
    b.onclick = () => load(i, true);
    list.appendChild(li);
  });
  load(0, false);
}

$("big").innerHTML = icon("play_arrow", 24, true);
$("spin").innerHTML = spinner(24, "inverse");
$("open").innerHTML = icon("open_in_new", 16);
$("err").innerHTML = icon("error", 24) + "<p>This video can't be played</p>";
setBtn($("mute"), "volume_up", "Mute");
setBtn($("fs"), "fullscreen", "Full screen");
$("pip").innerHTML = icon("picture_in_picture", 16);
showState();

app.ontoolresult = (res) => render(res.structuredContent);
app.onhostcontextchanged = (ctx) => ctx.theme && applyDocumentTheme(ctx.theme);
if (window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.setAttribute("data-theme", "dark");
await app.connect();
const theme = app.getHostContext()?.theme;
if (theme) applyDocumentTheme(theme);
</script>
</body>
</html>`;
}
