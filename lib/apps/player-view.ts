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
    --red-50: #fbe9e9; --red-300: #ec7c7c; --red-400: #e65050; --red-600: #b31d1d; --red-900: #3a1515;
    --orange-100: #ffe9d3; --orange-950: #2a1308;
    --green-50: #e6f1ee; --green-300: #69af99; --green-500: #057a55; --green-600: #046244; --green-900: #0d2a1f;
    --blue-300: #66acff; --blue-500: #0075ff;
    --yellow-50: #fefce8; --yellow-400: #facc15; --yellow-500: #eab308; --yellow-700: #a16207; --yellow-900: #2b2208;

    --color-background-neutral-primary: var(--greyscale-0);
    --color-background-neutral-secondary: var(--greyscale-100);
    --color-background-neutral-tertiary: var(--greyscale-200);
    --color-background-neutral-disabled: var(--greyscale-300);
    --color-background-neutral-hover: var(--greyscale-50);
    --color-background-neutral-subtle: var(--greyscale-50);
    --color-background-neutral-control: var(--greyscale-300);
    --color-background-neutral-pressed: var(--greyscale-100);
    --color-background-neutral-inverse-primary: var(--greyscale-1000);
    --color-background-neutral-inverse-secondary: var(--greyscale-800);
    --color-background-brand-primary: var(--orange-500);
    --color-background-brand-primary-hover: var(--orange-600);
    --color-background-brand-primary-pressed: var(--orange-700);
    --color-background-brand-secondary: var(--orange-300);
    --color-background-brand-tertiary: var(--orange-50);
    --color-background-success-subtle: var(--green-50);
    --color-background-warning-subtle: var(--yellow-50);
    --color-background-error-subtle: var(--red-50);
    --color-background-overlay-scrim: #00000080;
    --color-background-overlay-glass: #0000004d;
    --color-background-overlay-veil: #0000001f;
    --color-background-overlay-light: #ffffff4d;

    --color-text-neutral-primary: var(--greyscale-800);
    --color-text-neutral-secondary: var(--greyscale-700);
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
    --color-text-success-primary: var(--green-600);
    --color-text-warning-primary: var(--yellow-700);
    --color-icon-success-primary: var(--green-600);
    --color-icon-error-primary: var(--red-600);

    --color-icon-neutral-primary: var(--greyscale-800);
    --color-icon-neutral-secondary: var(--greyscale-700);
    --color-icon-neutral-tertiary: var(--greyscale-600);
    --color-icon-neutral-disabled: var(--greyscale-400);
    --color-icon-brand-inverse: var(--orange-50);
    --color-icon-neutral-inverse-primary: var(--greyscale-50);
    --color-icon-neutral-inverse-tertiary: var(--greyscale-300);

    --color-border-neutral-primary: var(--greyscale-100);
    --color-border-neutral-hover: var(--greyscale-300);
    --color-border-neutral-inverse-primary: var(--greyscale-600);
    --color-border-brand-primary: var(--orange-500);

    --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', 'Menlo', monospace;
    --vdb-shadow-xxs-1: #00000014;
    --shadow-xxs: 0 1px 2px 0 var(--vdb-shadow-xxs-1);
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
    --color-background-neutral-subtle: var(--greyscale-900);
    --color-background-neutral-control: var(--greyscale-500);
    --color-background-neutral-inverse-primary: var(--greyscale-600);
    --color-background-neutral-inverse-secondary: var(--greyscale-700);
    --color-text-neutral-primary: var(--greyscale-50);
    --color-text-neutral-secondary: var(--greyscale-200);
    --color-text-neutral-tertiary: var(--greyscale-400);
    --color-text-neutral-disabled: var(--greyscale-600);
    --color-text-neutral-hover: var(--greyscale-0);
    --color-text-brand-primary: var(--orange-400);
    --color-text-brand-hover: var(--orange-300);
    --color-text-error-primary: var(--red-300);
    --color-text-success-primary: var(--green-300);
    --color-text-warning-primary: var(--yellow-400);
    --color-icon-success-primary: var(--green-300);
    --color-icon-error-primary: var(--red-400);
    --color-background-brand-tertiary: var(--orange-950);
    --color-background-success-subtle: var(--green-900);
    --color-background-warning-subtle: var(--yellow-900);
    --color-background-error-subtle: var(--red-900);
    --color-icon-neutral-primary: var(--greyscale-50);
    --color-icon-neutral-secondary: var(--greyscale-200);
    --color-icon-neutral-tertiary: var(--greyscale-400);
    --color-icon-neutral-disabled: var(--greyscale-600);
    --vdb-shadow-xxs-1: #00000066;
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
  /* The page sizes itself. If the host frame is a pixel short, a page scrollbar would narrow the 16:9 player,
     shrink the reported height and stay stuck, so the page never scrolls. */
  html, body { overflow: hidden; }
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

  /* Icon Button, circle: inverse on media, primary and secondary on surfaces */
  .icon-btn { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 9999px; cursor: pointer; outline: none; transition: background-color .15s, border-color .15s, color .15s; }
  .icon-btn:focus-visible { box-shadow: var(--shadow-focus-ring); }
  .icon-btn:disabled { cursor: not-allowed; }
  .icon-btn.sm { width: 36px; height: 36px; }
  .icon-btn.md { width: 40px; height: 40px; }
  .icon-btn.lg { width: 44px; height: 44px; }
  .icon-btn.xl { width: 56px; height: 56px; }
  .icon-btn.inverse { background: var(--color-background-overlay-glass); color: var(--color-icon-neutral-inverse-primary); -webkit-backdrop-filter: blur(var(--blur-sm)); backdrop-filter: blur(var(--blur-sm)); }
  .icon-btn.inverse:hover { background: var(--color-background-overlay-scrim); }
  .icon-btn.primary { background: var(--color-background-brand-primary); color: var(--color-icon-brand-inverse); }
  .icon-btn.primary:not(:disabled):hover { background: var(--color-background-brand-primary-hover); }
  .icon-btn.primary:not(:disabled):active { background: var(--color-background-brand-primary-pressed); }
  .icon-btn.primary:disabled { background: var(--color-background-neutral-disabled); color: var(--color-icon-neutral-disabled); }
  .icon-btn.secondary { border: 1px solid var(--color-border-neutral-primary); background: var(--color-background-neutral-primary); color: var(--color-icon-neutral-primary); }
  .icon-btn.secondary:not(:disabled):hover { border-color: var(--color-border-neutral-hover); background: var(--color-background-neutral-hover); }
  .icon-btn.secondary:not(:disabled):active { background: var(--color-background-neutral-pressed); }
  .icon-btn.secondary:disabled { color: var(--color-icon-neutral-disabled); }

  /* Player Controls: glass groups of Player Buttons, a size up from the library's 36px so they read at chat width */
  .controls { display: flex; width: 100%; align-items: center; gap: 8px; }
  .glass { display: flex; align-items: center; gap: 4px; border-radius: 9999px; background: var(--color-background-overlay-glass); padding: 4px; -webkit-backdrop-filter: blur(var(--blur-sm)); backdrop-filter: blur(var(--blur-sm)); }
  .glass.sound { padding-right: 16px; }
  .spacer { flex: 1; }
  .player-btn { display: flex; width: 40px; height: 40px; flex-shrink: 0; cursor: pointer; align-items: center; justify-content: center; border-radius: 9999px; color: var(--color-icon-neutral-inverse-primary); outline: none; transition: background-color .15s; }
  .player-btn:hover { background: color-mix(in oklab, var(--color-background-overlay-light) 50%, transparent); }
  .player-btn:active { background: var(--color-background-overlay-light); }
  .player-btn:focus-visible { box-shadow: var(--shadow-focus-ring); }

  /* Timestamp, sm, inverse tone; md on the video controls */
  .timestamp { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-weight: 500; font-variant-numeric: tabular-nums; font-size: 12px; line-height: 16px; }
  .timestamp .elapsed { color: var(--color-text-neutral-inverse-primary); }
  .timestamp .sep { color: var(--color-text-neutral-inverse-tertiary); }
  .timestamp .total { color: var(--color-text-neutral-inverse-secondary); }
  .timestamp.md { font-size: 14px; line-height: 18px; }
  .timestamp.default .elapsed { color: var(--color-text-neutral-primary); }
  .timestamp.default .sep { color: var(--color-text-neutral-tertiary); }
  .timestamp.default .total { color: var(--color-text-neutral-secondary); }

  /* Timeline Scrubber, inverse tone; a thicker track and thumb than the library's 4px / 8px for an easier grab */
  .scrub { position: relative; display: flex; height: 28px; width: 100%; cursor: pointer; touch-action: none; align-items: center; user-select: none; }
  .track { position: relative; height: 6px; flex-grow: 1; overflow: hidden; border-radius: 9999px; background: var(--color-background-overlay-light); }
  .range { position: absolute; left: 0; height: 100%; border-radius: 9999px; background: var(--color-background-brand-primary); }
  .thumb { position: absolute; top: 50%; display: block; width: 12px; height: 12px; border-radius: 9999px; border: 1px solid var(--color-icon-neutral-inverse-primary); background: var(--color-background-brand-primary); outline: none; transform: translate(-50%, -50%); transition: width .1s, height .1s; }
  .thumb::after { content: ""; position: absolute; inset: -8px; border-radius: 9999px; }
  .scrub:hover .thumb, .thumb:focus-visible { width: 16px; height: 16px; }
  .scrub.drag .thumb { width: 18px; height: 18px; }
  .thumb:focus-visible { box-shadow: var(--shadow-focus-ring); }
  .scrub.default .track { background: var(--color-background-neutral-control); }
  .scrub.disabled { cursor: not-allowed; }
  .scrub.disabled .range { background: var(--color-background-neutral-disabled); }
  .scrub.disabled .thumb { display: none; }

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

  .card-footer { padding: 0 16px; display: flex; align-items: center; gap: 12px; }

  /* Gallery grid: 4px + each Media Thumbnail's 12px padding lines cards up with the card's 16px edge */
  /* A lone audio file is the bare Audio Player, as a lone video is the bare Video Player */
  .card.bare { padding: 0; border: 0; background: transparent; }
  .card.bare > .card-header { display: none; }
  .card.bare > .g-detail { padding: 0; }
  .g-grid { padding: 0 4px; display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 4px; }
  .g-detail { padding: 0 16px; display: flex; flex-direction: column; gap: 12px; }

  /* Media Thumbnail */
  .mt { position: relative; display: flex; width: 100%; flex-direction: column; gap: 8px; border-radius: 16px; border: 1px solid transparent; padding: 12px; transition: background-color .15s; }
  .mt:hover { background: var(--color-background-neutral-hover); }
  .mt:has(.mt-title:focus-visible) { box-shadow: var(--shadow-focus-ring); }
  .mt-media { position: relative; aspect-ratio: 16 / 9; width: 100%; overflow: hidden; border-radius: 12px; background: var(--color-background-neutral-inverse-secondary); }
  .mt-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .mt-play { position: absolute; top: 50%; left: 50%; display: flex; width: 48px; height: 48px; transform: translate(-50%, -50%); align-items: center; justify-content: center; border-radius: 9999px; border: 1px solid var(--color-background-overlay-light); background: var(--color-background-overlay-glass); color: var(--color-icon-neutral-inverse-primary); opacity: 0; -webkit-backdrop-filter: blur(var(--blur-sm)); backdrop-filter: blur(var(--blur-sm)); transition: opacity .15s; }
  .mt:hover .mt-play, .mt:has(.mt-title:focus-visible) .mt-play { opacity: 1; }
  .mt-audio { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: var(--color-icon-neutral-inverse-primary); }
  .mt-media .duration { position: absolute; right: 8px; bottom: 8px; background: var(--color-background-overlay-scrim); }
  .mt-row { display: flex; min-height: 20px; align-items: center; gap: 8px; }
  .mt-title { min-width: 0; flex: 1; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; font-size: 14px; line-height: 20px; color: var(--color-text-neutral-primary); outline: none; }
  .mt-title::after { content: ""; position: absolute; inset: 0; border-radius: 16px; }

  /* Skeleton */
  .skel { border-radius: 8px; background: var(--color-background-neutral-secondary); animation: pulse 2s ease-in-out infinite; }
  .skel.media { aspect-ratio: 16 / 9; border-radius: 12px; }
  .skel.line { height: 16px; width: 70%; }
  /* A media frame still waiting for its picture keeps its own shape and pulses */
  .mt-media.wait, .iv.wait { background: var(--color-background-neutral-secondary); animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .5; } }

  /* Empty State, without an action */
  .empty-state { display: flex; width: 100%; flex-direction: column; align-items: center; gap: 20px; border-radius: 16px; border: 1px solid var(--color-border-neutral-primary); background: var(--color-background-neutral-subtle); padding: 40px; text-align: center; }
  .es-glyph { display: flex; width: 64px; height: 64px; align-items: center; justify-content: center; border-radius: 9999px; background: var(--color-background-neutral-secondary); color: var(--color-icon-neutral-secondary); }
  .es-text { display: flex; flex-direction: column; gap: 8px; }
  .es-title { margin: 0; font-size: 18px; line-height: 26px; font-weight: 500; color: var(--color-text-neutral-primary); }
  .es-desc { font-size: 14px; line-height: 20px; color: var(--color-text-neutral-tertiary); }

  /* Segmented Control, sm */
  .sc { display: inline-flex; align-items: center; gap: 2px; height: 36px; padding: 4px; border-radius: 8px; background: var(--color-background-neutral-secondary); }
  .sc-item { display: flex; flex: 1; height: 28px; cursor: pointer; align-items: center; justify-content: center; gap: 4px; padding: 0 12px; border-radius: 8px; font-size: 14px; line-height: 20px; font-weight: 500; white-space: nowrap; color: var(--color-text-neutral-tertiary); outline: none; transition: color .15s, background-color .15s, box-shadow .15s; }
  .sc-item:hover { background: var(--color-background-neutral-tertiary); color: var(--color-text-neutral-primary); }
  .sc-item[data-state="off"]:active { background: var(--color-background-neutral-primary); }
  .sc-item[data-state="on"] { background: var(--color-background-neutral-primary); color: var(--color-text-neutral-primary); box-shadow: var(--shadow-xxs); }
  .sc-item:focus-visible { box-shadow: var(--shadow-focus-ring); }

  /* Pagination, arrows layout */
  .pager { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 8px; }
  .pg-step { display: flex; height: 40px; cursor: pointer; align-items: center; gap: 4px; padding: 0 12px; border-radius: 8px; font-size: 14px; line-height: 20px; font-weight: 500; color: var(--color-text-neutral-primary); outline: none; transition: background-color .15s; }
  .pg-step .icon { color: var(--color-icon-neutral-tertiary); }
  .pg-step:not(:disabled):hover { background: var(--color-background-neutral-hover); }
  .pg-step:not(:disabled):active { background: var(--color-background-neutral-pressed); }
  .pg-step:focus-visible { box-shadow: var(--shadow-focus-ring); }
  .pg-step:disabled { cursor: not-allowed; color: var(--color-text-neutral-disabled); }
  .pg-step:disabled .icon { color: var(--color-icon-neutral-disabled); }
  .pg-status { font-size: 14px; line-height: 20px; color: var(--color-text-neutral-tertiary); }

  /* Button, tertiary */
  .btn.tertiary { background: transparent; color: var(--color-text-neutral-primary); }
  .btn.tertiary:hover { background: var(--color-background-neutral-hover); color: var(--color-text-neutral-hover); }
  .btn.tertiary:active { background: var(--color-background-neutral-pressed); }

  /* Audio Player */
  .ap { display: flex; width: 100%; flex-direction: column; gap: 20px; border-radius: 16px; background: var(--color-background-neutral-secondary); padding: 20px 16px 16px; }
  .ap-head { display: flex; flex-direction: column; gap: 4px; }
  .ap-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--color-text-neutral-primary); }
  .ap-error { display: flex; align-items: center; gap: 4px; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--color-text-error-primary); }
  .ap-body { display: flex; flex-direction: column; gap: 12px; }
  .ap-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; }
  .ap-start { display: flex; min-width: 0; align-items: center; gap: 8px; }
  .ap-time { display: flex; height: 40px; flex-shrink: 0; align-items: center; border-radius: 9999px; background: var(--color-background-neutral-primary); padding: 0 12px; }
  .ap-transport { display: flex; align-items: center; justify-content: center; gap: 8px; }
  @media (max-width: 480px) {
    .ap-row { display: flex; flex-wrap: wrap; justify-content: space-between; row-gap: 12px; }
    .ap-transport { order: -1; width: 100%; }
  }

  /* Image view: the picture on the player's frame */
  .iv { position: relative; aspect-ratio: 16 / 9; width: 100%; overflow: hidden; border-radius: 16px; background: var(--color-background-neutral-inverse-secondary); }
  .iv img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }

  .empty { padding: 40px 16px; text-align: center; color: var(--color-text-neutral-tertiary); }

  .section-title { font-size: 14px; line-height: 20px; font-weight: 600; color: var(--color-text-neutral-primary); }
  .spinner.brand .t { stroke: var(--color-background-brand-tertiary); }
  .spinner.brand .a { stroke: var(--color-background-brand-primary); }

  /* Log Step: one row per analyzer while the run works */
  .log { display: flex; flex-direction: column; gap: 2px; }
  .log-row { display: flex; min-height: 36px; width: 100%; align-items: center; gap: 8px; border-radius: 8px; padding: 8px 12px; }
  .log-status { display: flex; width: 20px; height: 20px; flex-shrink: 0; align-items: center; justify-content: center; }
  .log-status.done { color: var(--color-icon-success-primary); }
  .log-status.failed { color: var(--color-icon-error-primary); }
  .log-label { min-width: 0; flex: 1; font-size: 14px; line-height: 20px; font-weight: 500; color: var(--color-text-neutral-primary); }
  .log-label .sub { color: var(--color-text-neutral-tertiary); }

  /* Chip (static) and Badge, size sm, subtle */
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { display: inline-flex; height: 28px; align-items: center; gap: 4px; border-radius: 9999px; border: 1px solid var(--color-border-neutral-primary); background: var(--color-background-neutral-primary); padding: 0 12px; font-size: 14px; line-height: 20px; font-weight: 500; white-space: nowrap; color: var(--color-text-neutral-primary); }
  .chip .n { color: var(--color-text-neutral-tertiary); font-variant-numeric: tabular-nums; }
  .badge { display: inline-flex; width: fit-content; flex-shrink: 0; height: 22px; align-items: center; gap: 4px; padding: 0 8px; border-radius: 8px; font-size: 12px; line-height: 18px; font-weight: 500; white-space: nowrap; background: var(--color-background-neutral-secondary); color: var(--color-text-neutral-secondary); }
  .badge.success { background: var(--color-background-success-subtle); color: var(--color-text-success-primary); }
  .badge.warning { background: var(--color-background-warning-subtle); color: var(--color-text-warning-primary); }
  .badge.error { background: var(--color-background-error-subtle); color: var(--color-text-error-primary); }
  .badge.brand { background: var(--color-background-brand-tertiary); color: var(--color-text-brand-primary); }

  /* Code Block, without line numbers */
  .code { display: flex; min-width: 0; flex-direction: column; overflow: hidden; border-radius: 12px; border: 1px solid var(--color-border-neutral-primary); background: var(--color-background-neutral-primary); }
  .code-head { display: flex; height: 40px; align-items: center; gap: 8px; border-bottom: 1px solid var(--color-border-neutral-primary); background: var(--color-background-neutral-subtle); padding: 0 12px; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--color-text-neutral-tertiary); }
  .code pre { margin: 0; max-height: 240px; overflow: auto; padding: 12px; font-family: var(--font-mono); font-size: 12px; line-height: 18px; font-weight: 500; color: var(--color-text-neutral-primary); outline: none; }
  .code pre:focus-visible { box-shadow: var(--shadow-focus-ring); }

  /* Segment renderer: any segment's data, drawn by its shape */
  .sv { display: flex; flex-direction: column; gap: 8px; font-size: 14px; line-height: 20px; color: var(--color-text-neutral-secondary); }
  .sv-label { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--color-text-neutral-tertiary); }
  .sv-group { display: flex; flex-direction: column; gap: 4px; }
  .kv { display: grid; grid-template-columns: minmax(80px, max-content) 1fr; gap: 4px 12px; margin: 0; }
  .kv dt { font-size: 12px; line-height: 20px; font-weight: 500; color: var(--color-text-neutral-tertiary); }
  .kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--color-text-neutral-primary); }
  .tl { display: flex; flex-direction: column; gap: 8px; }
  .tl-head { display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--color-text-neutral-secondary); }

  /* Lanes: one track per analyzer or index, segments placed by start and end. Built from tokens; the library has no timeline lane. */
  .lanes { position: relative; display: flex; flex-direction: column; gap: 8px; }
  .lane { display: grid; grid-template-columns: 96px 1fr; align-items: center; gap: 8px; }
  .lane-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 18px; font-weight: 500; color: var(--color-text-neutral-tertiary); }
  .lane-track { position: relative; height: 24px; border-radius: 4px; background: var(--color-background-neutral-secondary); }
  .lane-track.skel { animation: pulse 2s ease-in-out infinite; }
  /* The inset edge keeps back-to-back segments apart. */
  .lane-seg { position: absolute; top: 2px; bottom: 2px; min-width: 3px; border-radius: 2px; background: var(--lane); box-shadow: inset -1px 0 0 var(--color-background-neutral-primary); opacity: .55; cursor: pointer; outline: none; transition: opacity .15s; }
  .lane-seg:hover, .lane-seg[aria-current="true"] { opacity: 1; }
  .lane-seg:focus-visible { opacity: 1; box-shadow: var(--shadow-focus-ring); z-index: 1; }
  .lane-error { font-size: 12px; line-height: 18px; font-weight: 500; color: var(--color-text-error-primary); }
  .lane-head { pointer-events: none; position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; border-radius: 1px; background: var(--color-text-neutral-primary); }

  /* What every lane holds at the playing time */
  .now { display: flex; flex-direction: column; }
  .now-item { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-top: 1px solid var(--color-border-neutral-primary); }
  .now-head { display: flex; align-items: center; gap: 8px; }
  .swatch { width: 8px; height: 8px; flex-shrink: 0; border-radius: 9999px; background: var(--lane); }
  .now-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; line-height: 20px; font-weight: 500; color: var(--color-text-neutral-primary); }
  .muted { font-size: 14px; line-height: 20px; color: var(--color-text-neutral-tertiary); }

  /* Object boxes over the video's picture */
  .vp-boxes { pointer-events: none; position: absolute; inset: 0; }
  .box { position: absolute; border: 2px solid var(--color-border-brand-primary); border-radius: 4px; }
  .box span { position: absolute; left: -2px; bottom: 100%; margin-bottom: 2px; height: 20px; padding: 0 6px; border-radius: 4px; background: var(--color-background-brand-primary); color: var(--color-text-brand-inverse); font-size: 12px; line-height: 20px; font-weight: 500; white-space: nowrap; }
  .box.low span { bottom: auto; top: 0; margin: 2px 0 0 2px; }

  /* Data Table */
  .table-wrap { width: 100%; overflow-x: auto; border-radius: 8px; outline: none; }
  .table-wrap:focus-visible { box-shadow: var(--shadow-focus-ring); }
  .table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .table tr { border-bottom: 1px solid var(--color-border-neutral-primary); }
  .table th { height: 56px; padding: 16px 20px; text-align: left; font-weight: 500; white-space: nowrap; color: var(--color-text-neutral-tertiary); }
  .table td { height: 56px; padding: 8px 20px; vertical-align: middle; font-weight: 500; color: var(--color-text-neutral-primary); }
  .table tbody tr { transition: background-color .15s; }
  .table tbody tr:hover { background: var(--color-background-neutral-hover); }
  .table tbody tr[data-state="selected"] { background: var(--color-background-neutral-secondary); }
  .table th:first-child, .table td:first-child { width: 1%; white-space: nowrap; }
  .table .clip { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

  /* Moments: highlighted stretches on the scrubber and a list under the player */
  .marks { pointer-events: none; position: absolute; left: 0; right: 0; top: 50%; height: 6px; transform: translateY(-50%); }
  .mark { position: absolute; top: 0; bottom: 0; min-width: 3px; border-radius: 9999px; background: var(--color-icon-neutral-inverse-primary); opacity: .75; }
  .m-detail { display: flex; flex-direction: column; gap: 8px; padding: 0 16px; }

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
        <div class="vp-boxes" id="boxes" aria-hidden="true"></div>
        <div class="vp-veil" aria-hidden="true"></div>
        <div class="vp-top">
          <div class="vp-caption"><p class="vp-title" id="title"></p><p class="vp-source" id="source"></p></div>
          <div class="vp-actions"><button class="icon-btn inverse sm" id="open" type="button" aria-label="Open on VideoDB" title="Open on VideoDB"></button></div>
        </div>
        <div class="vp-error" id="err" role="alert" hidden></div>
        <span class="vp-centre" id="spin" hidden></span>
        <button class="icon-btn inverse xl vp-centre" id="big" type="button" tabindex="-1" aria-hidden="true"></button>
        <p role="status" class="sr-only" id="buffering"></p>
        <div class="vp-bottom" id="bottom">
          <div class="scrub" id="scrub">
            <div class="track"><div class="range" id="range"></div></div>
            <div class="marks" id="marks" aria-hidden="true"></div>
            <span class="thumb" id="thumb" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0"></span>
          </div>
          <div class="controls">
            <div class="glass"><button class="player-btn" id="pp" type="button"></button></div>
            <div class="glass sound"><button class="player-btn" id="mute" type="button"></button><span class="timestamp md" id="time"></span></div>
            <div class="spacer"></div>
            <div class="glass"><button class="player-btn" id="pip" type="button" aria-label="Picture in picture" title="Picture in picture" hidden></button><button class="player-btn" id="fs" type="button"></button></div>
          </div>
        </div>
      </div>
      <div class="strip" id="strip" hidden></div>
      <p class="status" id="note" hidden></p>
    </div>
    <ul class="items" id="list" role="list" hidden></ul>
    <div class="card-content" id="m-head" hidden><p class="section-title" id="m-title"></p></div>
    <ul class="items" id="moments" role="list" aria-label="Moments" hidden></ul>
    <div class="m-detail" id="m-detail" hidden></div>
  </div>
  <div class="card" id="insight" hidden>
    <div class="card-header">
      <div class="card-heading"><p class="card-title" id="i-title"></p><p class="card-description" id="i-meta"></p></div>
    </div>
    <div class="card-content">
      <div id="i-player"></div>
      <div class="log" id="i-log" hidden></div>
      <div class="lanes" id="i-lanes" hidden></div>
      <p class="status" id="i-note" hidden></p>
    </div>
    <div class="card-content" id="i-now-wrap" hidden><p class="section-title" id="i-now-title"></p><div class="now" id="i-now"></div></div>
    <div class="card-content" id="i-table" hidden></div>
  </div>
  <div class="card" id="gallery" hidden>
    <div class="card-header">
      <div class="card-heading"><p class="card-title" id="g-title"></p><p class="card-description" id="g-meta"></p></div>
      <div class="card-actions" id="g-actions"></div>
    </div>
    <div id="g-body"></div>
    <div class="card-footer" id="g-pages" hidden></div>
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
const setBtn = (el, ic, label, filled) => { el.innerHTML = icon(ic, 20, filled); el.ariaLabel = label; el.title = label; };

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
// A file's link is created on its first read and can fail for half a minute after, so a failed load retries at 2, 4, 8 and 16 s.
function retrying(el, url, onFail) {
  let tries = 0;
  el.onerror = () => { if (tries < 4) setTimeout(() => { el.src = url; }, 2000 * 2 ** tries++); else onFail(); };
  el.src = url;
}

function showState() {
  const failed = !$("err").hidden, playing = !video.paused, busy = switching || (loading && playing);
  $("spin").hidden = failed || !busy;
  $("big").hidden = failed || playing || switching;
  $("bottom").hidden = failed;
  $("buffering").textContent = busy && !failed ? "Buffering" : "";
  setBtn($("pp"), playing || switching ? "pause" : "play_arrow", playing || switching ? "Pause" : "Play", true);
}
// switching: a new stream is loading and will play when ready, e.g. a reel moving to a clip of another video.
let loading = false, switching = false;

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
  if (!reel) drawMoments();
  // Held apart from lastT: a new source fires timeupdate at 0, which resets lastT before metadata loads.
  const to = lastT;
  const seek = () => { video.currentTime = to; if (autoplay) video.play().catch(() => { switching = false; showState(); }); };
  // Clips of the same video reuse the loaded stream, so moving between them is a seek, not a reload.
  if (src === it.stream_url && video.readyState >= 1) { seek(); paint(); return; }
  src = it.stream_url;
  switching = !!autoplay; showState();
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

function fail() { loading = false; switching = false; $("err").hidden = false; showState(); }

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
["playing", "canplay"].forEach((e) => video.addEventListener(e, () => { loading = false; switching = false; showState(); }));
["play", "pause"].forEach((e) => video.addEventListener(e, () => { if (e === "pause") loading = false; showState(); }));
video.addEventListener("volumechange", () => setBtn($("mute"), video.muted ? "volume_off" : "volume_up", video.muted ? "Unmute" : "Mute"));

const toggle = () => {
  if (switching) { switching = false; video.pause(); showState(); return; }
  video.paused ? video.play().catch(() => {}) : video.pause();
};
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
  if (!reel && items.length < 2 && !items[0].moments?.length) { card.style.cssText = "padding:0;border:0;background:transparent"; card.firstElementChild.nextElementSibling.style.padding = "0"; }
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

// Gallery: one page of assets as Media Thumbnails; load_assets pages, filters and fetches the file link of an item.
const gallery = $("gallery"), gbody = $("g-body"), vpHome = vp.parentElement;
const TYPES = [["", "All", ""], ["video", "Video", "movie"], ["audio", "Audio", "headphones"], ["image", "Images", "image"]];
const NOUN = { "": ["asset", "assets"], video: ["video", "videos"], audio: ["audio file", "audio files"], image: ["image", "images"] };
let g = { query: {}, title: "", assets: [], page: 1, pages: 1, total: 0, type: "" };
let audioEl = null;

async function loadAssets(args) {
  const res = await app.callServerTool({ name: "load_assets", arguments: args });
  if (res.isError) throw new Error((res.content?.[0]?.text || "Couldn't load these assets.").replace(/^Error: /, ""));
  return res.structuredContent;
}

function header(title, meta, actions) {
  $("g-title").textContent = title;
  $("g-meta").textContent = meta;
  $("g-meta").hidden = !meta;
  $("g-actions").replaceChildren(...actions);
}
function button(cls, ic, label, run) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn " + cls; b.innerHTML = (ic ? icon(ic, 16) : "") + "<span></span>";
  b.lastChild.textContent = label; b.onclick = run;
  return b;
}

/** Segmented Control: one Tab stop on the selected segment; arrow keys move and select. */
function typeControl() {
  const wrap = document.createElement("div");
  wrap.className = "sc"; wrap.setAttribute("role", "group"); wrap.ariaLabel = "Asset type";
  TYPES.forEach(([value, label, ic]) => {
    const b = document.createElement("button");
    const on = value === g.type;
    b.type = "button"; b.className = "sc-item"; b.dataset.state = on ? "on" : "off"; b.setAttribute("aria-pressed", String(on)); b.tabIndex = on ? 0 : -1;
    b.innerHTML = (ic ? icon(ic, 16) : "") + "<span>" + label + "</span>";
    b.onclick = () => { if (value !== g.type) { g.type = value; showPage(1); } };
    b.onkeydown = (e) => {
      const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      const i = TYPES.findIndex((t) => t[0] === value);
      let to = keys[e.key] != null ? (i + keys[e.key] + TYPES.length) % TYPES.length : e.key === "Home" ? 0 : e.key === "End" ? TYPES.length - 1 : -1;
      if (to < 0) return;
      e.preventDefault(); g.type = TYPES[to][0]; showPage(1).then(() => $("g-actions").querySelector('[data-state="on"]')?.focus());
    };
    wrap.appendChild(b);
  });
  return wrap;
}

function assetCard(a) {
  const el = document.createElement("div");
  el.className = "mt";
  const media = document.createElement("div");
  media.className = "mt-media";
  el.dataset.id = a.id;
  const src = a.type === "image" ? a.url : a.type === "video" ? a.thumbnail_url : "";
  if (src) thumbnail(media, src);
  else if (a.type === "image" && a.linking) media.classList.add("wait");
  if (a.type === "video") media.insertAdjacentHTML("beforeend", '<span class="mt-play" aria-hidden="true">' + icon("play_arrow", 24, true) + "</span>");
  if (a.type === "audio") media.insertAdjacentHTML("beforeend", '<span class="mt-audio">' + icon("headphones", 40) + "</span>");
  if (a.type !== "image" && a.length) media.insertAdjacentHTML("beforeend", '<time class="duration" datetime="PT' + Math.round(a.length) + 'S">' + fmt(a.length) + "</time>");
  const row = document.createElement("div");
  row.className = "mt-row";
  const t = document.createElement("button");
  t.type = "button"; t.className = "mt-title"; t.textContent = a.name || "Untitled";
  t.insertAdjacentHTML("beforeend", '<span class="sr-only">, ' + (a.type === "image" ? "image" : a.type) + "</span>");
  t.onclick = () => openAsset(a, true);
  row.appendChild(t);
  el.append(media, row);
  return el;
}

/** The card pulses until its picture arrives, including while a first-time link retries. */
function thumbnail(media, url) {
  const img = document.createElement("img");
  img.alt = ""; img.loading = "lazy";
  media.classList.add("wait");
  img.onload = () => media.classList.remove("wait");
  retrying(img, url, () => { img.remove(); media.classList.remove("wait"); });
  media.prepend(img);
}

/** List rows carry no image links, so they load after the grid draws, a few at a time, and fill their cards as they arrive. */
const imageLinks = {};
function fillImageLinks() {
  g.assets.forEach((a) => { if (a.type === "image" && !a.url && imageLinks[a.id]) a.url = imageLinks[a.id]; });
  const todo = g.assets.filter((a) => a.type === "image" && !a.url && !a.linking);
  const groups = {};
  todo.forEach((a) => { a.linking = true; const c = a.collection_id || g.query.collection_id || "default"; (groups[c] = groups[c] || []).push(a); });
  Object.entries(groups).forEach(([collection_id, list]) => {
    for (let i = 0; i < list.length; i += 6) {
      const batch = list.slice(i, i + 6);
      const done = (found) => batch.forEach((a, j) => {
        a.linking = false;
        if (found?.[j]?.url) a.url = imageLinks[a.id] = found[j].url;
        const media = gbody.querySelector('.mt[data-id="' + a.id + '"] .mt-media');
        if (!media) return;
        media.classList.remove("wait");
        if (a.url) thumbnail(media, a.url);
      });
      loadAssets({ ids: batch.map((a) => a.id), collection_id }).then((r) => done(r.assets), () => done(null));
    }
  });
}

function showLoading() {
  gbody.className = "g-grid"; gbody.setAttribute("aria-busy", "true");
  gbody.innerHTML = '<p class="sr-only" role="status">Loading assets</p>' + Array(8).fill('<div class="mt" aria-hidden="true"><div class="skel media"></div><div class="skel line"></div></div>').join("");
}

function drawGrid() {
  stopDetail();
  gallery.classList.remove("bare");
  const noun = NOUN[g.query.ids ? "" : g.type];
  const count = g.total + " " + (g.total === 1 ? noun[0] : noun[1]) + (g.pages > 1 ? " · page " + g.page + " of " + g.pages : "");
  header(g.title, count, g.query.ids ? [] : [typeControl()]);
  gbody.removeAttribute("aria-busy");
  if (!g.assets.length) {
    gbody.className = "g-detail";
    gbody.innerHTML = '<div class="empty-state"><span class="es-glyph">' + icon("video_library", 32) + '</span><div class="es-text"><h3 class="es-title">No ' + noun[1] + ' yet</h3><p class="es-desc">Uploads to this collection appear here.</p></div></div>';
  } else {
    gbody.className = "g-grid";
    fillImageLinks();
    gbody.replaceChildren(...g.assets.map(assetCard));
  }
  const pages = $("g-pages");
  pages.hidden = g.pages < 2;
  if (g.pages > 1) {
    pages.innerHTML = '<nav class="pager" aria-label="Pagination"><button class="pg-step" type="button" id="pg-prev">' + icon("arrow_back", 20) + '<span>Previous</span></button><span class="pg-status">Page ' + g.page + " of " + g.pages + '</span><button class="pg-step" type="button" id="pg-next"><span>Next</span>' + icon("arrow_forward", 20) + "</button></nav>";
    $("pg-prev").disabled = g.page <= 1; $("pg-next").disabled = g.page >= g.pages;
    $("pg-prev").onclick = () => showPage(g.page - 1);
    $("pg-next").onclick = () => showPage(g.page + 1);
  }
}

async function showPage(page) {
  $("g-actions").replaceChildren(typeControl());
  // The old filter's count would be wrong while the new one loads.
  $("g-meta").textContent = "Loading " + NOUN[g.type][1];
  showLoading();
  try {
    const r = await loadAssets({ collection_id: g.query.collection_id, asset_type: g.type || undefined, page });
    g.assets = r.assets; g.page = page;
    g.pages = r.pagination?.total_pages || 1; g.total = r.pagination?.total_count ?? r.assets.length;
  } catch (e) {
    gbody.className = "g-detail"; gbody.removeAttribute("aria-busy");
    gbody.innerHTML = '<p class="status error" role="alert"></p>';
    gbody.firstChild.textContent = (e.message || "Couldn't load these assets.") + " Try again.";
    return;
  }
  drawGrid();
}

/** Pause whatever the detail view was playing and put the video player back in its own card. */
function stopDetail() {
  video.pause();
  audioEl?.pause(); audioEl = null;
  if (vp.parentElement !== vpHome) vpHome.insertBefore(vp, strip);
}

async function withLink(a) {
  if (a.url || a.type === "video") return a;
  const r = await loadAssets({ ids: [a.id], collection_id: a.collection_id || g.query.collection_id });
  return Object.assign(a, r.assets[0]);
}

async function openAsset(a, back) {
  stopDetail();
  const actions = back ? [button("tertiary sm", "arrow_back", "Back", drawGrid)] : [];
  // The players carry the asset's name in their own title; an image has none, so the header names it.
  if (a.type === "image") header(a.name || "Untitled", "Image", actions);
  else header(g.title, "", actions);
  gallery.classList.toggle("bare", !back && a.type === "audio");
  $("g-pages").hidden = true;
  gbody.className = "g-detail"; gbody.removeAttribute("aria-busy");
  gbody.innerHTML = "";
  if (a.type === "video") {
    reel = false; items = [{ stream_url: a.stream_url, player_url: a.player_url, title: a.name || "Video" }];
    list.innerHTML = ""; strip.innerHTML = ""; $("open").hidden = false;
    gbody.appendChild(vp);
    if (a.stream_url) load(0, false); else fail();
    return;
  }
  gbody.innerHTML = '<p class="sr-only" role="status">Loading</p>';
  try { await withLink(a); } catch {}
  gbody.innerHTML = "";
  if (a.type === "audio") return gbody.appendChild(audioPlayer(a));
  const frame = document.createElement("div");
  frame.className = "iv";
  const img = document.createElement("img");
  img.alt = a.name || "Image";
  const broken = () => { img.remove(); frame.insertAdjacentHTML("beforeend", '<div class="vp-error" role="alert">' + icon("error", 24) + "<p>This image can't be shown</p></div>"); };
  if (a.url) { frame.classList.add("wait"); img.onload = () => frame.classList.remove("wait"); retrying(img, a.url, () => { frame.classList.remove("wait"); broken(); }); frame.appendChild(img); } else broken();
  gbody.appendChild(frame);
  if (a.url) $("g-actions").appendChild(button("secondary sm", "open_in_new", "Open original", () => app.openLink({ url: a.url })));
}

/** Audio Player: title, timeline, then time and volume, the transport, and an empty actions column. */
function audioPlayer(a) {
  const el = document.createElement("div");
  el.className = "ap"; el.setAttribute("role", "region"); el.ariaLabel = "Audio: " + (a.name || "Untitled");
  el.innerHTML = '<audio preload="metadata"></audio><span class="sr-only" role="status"></span>'
    + '<div class="ap-head"><p class="ap-title"></p><p class="ap-error" role="alert" hidden>' + icon("error", 16) + "This audio can't be played</p></div>"
    + '<div class="ap-body"><div class="scrub default"><div class="track"><div class="range"></div></div><span class="thumb" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0"></span></div>'
    + '<div class="ap-row"><div class="ap-start"><span class="ap-time"><span class="timestamp md default"></span></span><button class="icon-btn secondary md" type="button" data-a="mute"></button></div>'
    + '<div class="ap-transport"><button class="icon-btn secondary md" type="button" data-a="back"></button><button class="icon-btn primary xl" type="button" data-a="play"></button><button class="icon-btn secondary md" type="button" data-a="fwd"></button></div>'
    + "<div></div></div></div>";
  const au = el.querySelector("audio"), q = (s) => el.querySelector(s), btn = (n) => el.querySelector('[data-a="' + n + '"]');
  const sc = q(".scrub"), thumb = q(".thumb");
  q(".ap-title").textContent = a.name || "Untitled";
  audioEl = au;
  let drag = false, buffering = false;
  const d = () => (isFinite(au.duration) ? au.duration : a.length || 0);
  const label = (b, ic, text, size, filled) => { b.innerHTML = icon(ic, size || 20, filled); b.ariaLabel = text; b.title = text; };
  function paint(x) {
    const span = d(), t = x != null ? x * span : au.currentTime;
    q(".range").style.width = pct(span ? t / span : 0); thumb.style.left = pct(span ? t / span : 0);
    thumb.setAttribute("aria-valuemax", String(Math.round(span))); thumb.setAttribute("aria-valuenow", String(Math.round(t)));
    thumb.setAttribute("aria-valuetext", spoken(t) + " of " + spoken(span));
    q(".timestamp").innerHTML = '<span class="elapsed">' + fmt(t) + '</span><span class="sep" aria-hidden="true">/</span><span class="sr-only">of</span><span class="total">' + fmt(span) + "</span>";
  }
  function state() {
    const playing = !au.paused;
    // Keeps its Pause name while buffering, because pressing it still pauses.
    if (buffering && playing) { btn("play").innerHTML = spinner(24, "inverse"); btn("play").ariaLabel = "Pause"; } else label(btn("play"), playing ? "pause" : "play_arrow", playing ? "Pause" : "Play", 28, true);
    q('[role="status"]').textContent = buffering && playing ? "Buffering" : "";
  }
  const failed = () => { q(".ap-error").hidden = false; sc.classList.add("disabled"); el.querySelectorAll("button").forEach((b) => { b.disabled = true; }); buffering = false; state(); };
  const seek = (t) => { au.currentTime = Math.max(0, Math.min(d(), t)); paint(); };
  label(btn("mute"), "volume_up", "Mute"); label(btn("back"), "replay_10", "Back 10 seconds"); label(btn("fwd"), "forward_10", "Forward 10 seconds");
  btn("play").onclick = () => (au.paused ? au.play().catch(() => {}) : au.pause());
  btn("mute").onclick = () => { au.muted = !au.muted; };
  btn("back").onclick = () => seek(au.currentTime - 10);
  btn("fwd").onclick = () => seek(au.currentTime + 10);
  au.addEventListener("volumechange", () => label(btn("mute"), au.muted ? "volume_off" : "volume_up", au.muted ? "Unmute" : "Mute"));
  ["timeupdate", "durationchange", "loadedmetadata", "seeked"].forEach((e) => au.addEventListener(e, () => { if (!drag) paint(); }));
  au.addEventListener("waiting", () => { buffering = true; state(); });
  ["playing", "canplay", "pause", "play"].forEach((e) => au.addEventListener(e, () => { if (e !== "play") buffering = false; state(); }));
  const ratio = (e) => { const r = sc.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); };
  sc.addEventListener("pointerdown", (e) => { if (sc.classList.contains("disabled")) return; drag = true; sc.classList.add("drag"); sc.setPointerCapture(e.pointerId); paint(ratio(e)); });
  sc.addEventListener("pointermove", (e) => { if (drag) paint(ratio(e)); });
  sc.addEventListener("pointerup", (e) => { if (!drag) return; drag = false; sc.classList.remove("drag"); seek(ratio(e) * d()); });
  thumb.addEventListener("keydown", (e) => {
    const arrow = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key], page = { PageUp: 1, PageDown: -1 }[e.key];
    const to = arrow || page ? au.currentTime + (arrow ? arrow * (e.shiftKey ? 10 : 5) : page * 10) : e.key === "Home" ? 0 : e.key === "End" ? d() : null;
    if (to == null) return;
    e.preventDefault(); seek(to);
  });
  paint(); state();
  if (a.url) retrying(au, a.url, failed); else failed();
  return el;
}

function renderGallery(data) {
  g = { query: data.query || {}, title: data.title || "Assets", assets: data.assets || [], page: 1, pages: data.pagination?.total_pages || 1, total: data.pagination?.total_count ?? (data.assets || []).length, type: data.query?.asset_type || "" };
  // One video on its own is just the Video Player; one audio file or image opens without a gallery behind it.
  if (g.query.ids && g.assets.length === 1 && g.assets[0].type === "video") {
    const a = g.assets[0];
    return render({ layout: "player", items: [{ stream_url: a.stream_url, player_url: a.player_url, title: a.name }] });
  }
  card.hidden = true; gallery.hidden = false;
  if (g.query.ids && g.assets.length === 1) return openAsset(g.assets[0], false);
  drawGrid();
}

// Segment renderer: draws any segment's data by its shape, never by the analyzer that made it.
const PROSE = ["text", "description", "activity", "location"];
const human = (k) => { const t = String(k).replace(/[_.]+/g, " ").trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const isScalar = (v) => v == null || ["string", "number", "boolean"].includes(typeof v);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function chips(entries) {
  const wrap = el("div", "chips");
  entries.forEach(([label, n]) => { const c = el("span", "chip", label); if (n > 1) c.append(el("span", "n", "×" + n)); wrap.append(c); });
  return wrap;
}
const counted = (list) => { const m = new Map(); list.forEach((x) => m.set(x, (m.get(x) || 0) + 1)); return [...m.entries()]; };
function scalarText(v) {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return v == null ? "—" : String(v);
}
/** Speech: consecutive words of one speaker become a line headed by the speaker and when they start. */
function transcriptLines(words) {
  const wrap = el("div", "tl"), lines = [];
  words.forEach((w) => {
    const last = lines[lines.length - 1];
    if (last && last.speaker === w.speaker) last.words.push(w.text);
    else lines.push({ speaker: w.speaker, start: w.start, words: [w.text] });
  });
  lines.forEach((l) => {
    const line = el("div", "sv-group"), head = el("div", "tl-head");
    head.append(el("span", "", l.speaker != null ? "Speaker " + l.speaker : "Speaker"), el("span", "timestamp default", fmt(l.start)));
    line.append(head, el("p", "", l.words.join(" ")));
    wrap.append(line);
  });
  return wrap;
}
function detectionLabels(frames) {
  const labels = [];
  frames.forEach((f) => (f?.detections || []).forEach((d) => d?.label && labels.push(d.label)));
  return labels;
}
function segmentView(data) {
  const box = el("div", "sv");
  if (data == null || typeof data !== "object") { box.append(el("p", "", scalarText(data))); return box; }
  if (Array.isArray(data)) { box.append(data.every(isScalar) ? chips(counted(data.map(scalarText))) : el("p", "", JSON.stringify(data))); return box; }
  const rest = Object.assign({}, data);
  if (Array.isArray(data.words) && data.words.some((w) => w && w.speaker != null)) { box.append(transcriptLines(data.words)); delete rest.text; }
  delete rest.words;
  PROSE.forEach((k) => { if (typeof rest[k] === "string") { box.append(el("p", "", rest[k])); delete rest[k]; } });
  if (Array.isArray(data.frames)) {
    const labels = detectionLabels(data.frames);
    box.append(labels.length ? chips(counted(labels)) : el("p", "muted", "Nothing detected"));
    delete rest.frames;
  }
  const kv = el("dl", "kv");
  Object.entries(rest).forEach(([k, v]) => {
    if (Array.isArray(v) && v.length && v.every((x) => typeof x === "string")) {
      const g = el("div", "sv-group"); g.append(el("p", "sv-label", human(k)), chips(counted(v))); box.append(g);
      return;
    }
    kv.append(el("dt", "", human(k)), el("dd", "", isScalar(v) ? scalarText(v) : JSON.stringify(v)));
  });
  if (kv.children.length) {
    box.append(kv);
    // Custom schemas can nest anything; the raw JSON is one click away.
    const toggle = el("button", "link", "Show raw data"); toggle.type = "button";
    const code = el("div", "code"); code.hidden = true;
    const pre = el("pre", "", JSON.stringify(data, null, 2)); pre.tabIndex = 0;
    code.append(el("div", "code-head", "JSON"), pre);
    toggle.onclick = () => { code.hidden = !code.hidden; toggle.textContent = code.hidden ? "Show raw data" : "Hide raw data"; };
    const row = el("p"); row.append(toggle);
    box.append(row, code);
  }
  return box;
}
/** One line of plain text for a table cell. */
function summary(data) {
  if (data == null || typeof data !== "object") return scalarText(data);
  for (const k of PROSE) if (typeof data[k] === "string") return data[k];
  if (Array.isArray(data.words)) return data.words.map((w) => w.text).join(" ");
  if (Array.isArray(data.frames)) return counted(detectionLabels(data.frames)).map(([l, n]) => (n > 1 ? l + " ×" + n : l)).join(", ") || "Nothing detected";
  const first = Object.values(data).find((v) => typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string")));
  return first != null ? [].concat(first).join(", ") : JSON.stringify(data);
}

// Understanding and index views: the video with one lane per analyzer (or the index), and the data at the playing time.
const insight = $("insight");
const LANE_COLOURS = ["var(--color-background-brand-primary)", "var(--blue-500)", "var(--green-500)", "var(--yellow-500)", "var(--blue-300)", "var(--green-300)", "var(--color-background-brand-secondary)"];
const TYPE_LABEL = { speech_transcription: "Speech", spoken_words: "Speech", vlm: "Visual description", ocr: "On-screen text", object_detection: "Objects", brand_detection: "Brands", activity_recognition: "Activity", location_detection: "Location" };
const ROWS = 10;
let ins = null;

async function readTool(name, args) {
  const res = await app.callServerTool({ name: name, arguments: args });
  const text = res.content?.[0]?.text || "";
  if (res.isError) throw new Error(text.replace(/^Error: /, "") || "Couldn't load this.");
  try { return JSON.parse(text); } catch { throw new Error(text || "Couldn't load this."); }
}
const runState = (s) => (s === "done" ? "done" : s === "failed" || s === "error" ? "failed" : "running");
const segs = (list) => (list || []).filter((r) => r && isFinite(r.start) && isFinite(r.end)).map((r) => ({ start: Number(r.start), end: Math.max(Number(r.end), Number(r.start)), data: r.data }));
/** Timeline length: the video's own, else the furthest segment end. */
function insLen() {
  if (isFinite(video.duration) && video.duration) return video.duration;
  let max = ins.video.length || 0;
  ins.lanes.forEach((l) => (l.segments || []).forEach((s) => { if (s.end > max) max = s.end; }));
  return max || 1;
}

function renderInsight(data) {
  clearTimeout(ins?.timer);
  card.hidden = true; gallery.hidden = true; insight.hidden = false;
  const v = data.video;
  ins = { token: {}, kind: data.layout, video: v, lanes: [], at: null, page: 0 };
  $("i-title").textContent = v.title || "Video";
  reel = false; items = [{ stream_url: v.stream_url, player_url: v.player_url, title: v.title || "Video" }];
  list.innerHTML = ""; strip.innerHTML = ""; $("open").hidden = false;
  $("i-player").appendChild(vp);
  load(0, false);
  if (data.layout === "understanding") {
    ins.run = data.understanding;
    ins.lanes = (data.understanding.analyzers || []).map((a, i) => ({ id: a.id, name: a.name || "Analyzer " + (i + 1), type: a.type, status: runState(a.status), colour: LANE_COLOURS[i % LANE_COLOURS.length] }));
    pollRun();
  } else {
    const s = data.source;
    ins.source = s;
    const name = s.kind === "index" ? s.name || "Index" : s.kind === "scene_index" ? "Scenes" : "Transcript";
    ins.lanes = [{ name: name, status: "done", colour: LANE_COLOURS[0] }];
    loadIndexPage();
  }
  drawAll();
}

function drawMeta() {
  if (ins.kind === "understanding") {
    const done = ins.lanes.filter((l) => l.status === "done").length, failed = ins.lanes.filter((l) => l.status === "failed").length;
    const working = ins.lanes.length - done - failed;
    $("i-meta").textContent = ["Understanding", working ? done + " of " + ins.lanes.length + " analyzers done" : ins.lanes.length + (ins.lanes.length === 1 ? " analyzer" : " analyzers"), failed ? failed + " failed" : ""].filter(Boolean).join(" · ");
    return;
  }
  const s = ins.source, parts = [s.kind === "index" ? "Index" : s.kind === "scene_index" ? "Scene index" : "Transcript"];
  if (s.status) parts.push(human(s.status));
  const n = s.record_count != null ? s.record_count : ins.lanes[0].total;
  const noun = { index: ["record", "records"], scene_index: ["scene", "scenes"], transcript: ["sentence", "sentences"] }[s.kind];
  if (n != null) parts.push(n + " " + noun[n === 1 ? 0 : 1]);
  $("i-meta").textContent = parts.join(" · ");
}

/** Understanding run: fetch output for analyzers that just finished, then poll every 5 s while any still works. */
async function pollRun(poll) {
  const token = ins.token;
  if (poll) {
    try {
      const u = await readTool("get_understanding", { video_id: ins.video.video_id, collection_id: ins.video.collection_id, understanding_id: ins.run.id });
      if (token !== ins?.token) return;
      (u.analyzers || []).forEach((a) => { const l = ins.lanes.find((x) => (a.id && x.id === a.id) || x.name === a.name); if (l) l.status = runState(a.status); });
    } catch {}
  }
  ins.lanes.filter((l) => l.status === "done" && !l.segments && !l.loading && !l.error).forEach(loadLane);
  drawAll();
  if (ins.lanes.some((l) => l.status === "running")) ins.timer = setTimeout(() => pollRun(true), 5000);
}

async function loadLane(l) {
  const token = ins.token;
  l.loading = true;
  try {
    const args = { video_id: ins.video.video_id, collection_id: ins.video.collection_id, understanding_id: ins.run.id };
    if (l.id) args.analyzer_id = l.id; else args.analyzer_name = l.name;
    const out = await readTool("get_analyzer_output", args);
    if (token !== ins?.token) return;
    l.segments = segs(out.scenes);
    l.total = out.scenes_total || l.segments.length;
  } catch (e) { l.error = e.message || "Couldn't load this output."; }
  l.loading = false;
  drawAll();
}

/** Index records, a v2 index 200 at a time through its cursor; a scene index or transcript in one read. */
async function loadIndexPage() {
  const token = ins.token, s = ins.source, l = ins.lanes[0], v = ins.video;
  if (l.loading) return;
  l.loading = true; drawAll();
  try {
    if (s.kind === "index") {
      const r = await readTool("get_index_records", Object.assign({ video_id: v.video_id, collection_id: v.collection_id, index_id: s.id, limit: 200 }, ins.cursor ? { cursor: ins.cursor } : {}));
      if (token !== ins?.token) return;
      l.segments = (l.segments || []).concat(segs(r.records));
      ins.cursor = r.next_cursor || null;
    } else if (s.kind === "scene_index") {
      const r = await readTool("get_scene_index", { video_id: v.video_id, collection_id: v.collection_id, scene_index_id: s.id });
      if (token !== ins?.token) return;
      // Legacy scenes carry their fields beside start and end; everything else is the scene's data.
      l.segments = segs((r.scenes || []).map((x) => { const d = Object.assign({}, x); delete d.start; delete d.end; return { start: x.start, end: x.end, data: d }; }));
      l.total = r.scenes_total || l.segments.length;
    } else {
      const r = await readTool("get_transcript", { media_id: v.video_id, collection_id: v.collection_id, timestamped: true, segmenter: "sentence" });
      if (token !== ins?.token) return;
      l.segments = segs((r.word_timestamps || []).map((x) => ({ start: x.start, end: x.end, data: { text: x.text } })));
      l.total = r.total || l.segments.length;
    }
  } catch (e) { l.error = e.message || "Couldn't load these records."; }
  l.loading = false;
  drawAll();
}

function drawAll() {
  if (!ins) return;
  drawMeta(); drawLog(); drawLanes(); drawTable();
  ins.at = null; tick();
}

/** Log Step rows while the run works; afterwards only failed analyzers keep a row. */
function drawLog() {
  const log = $("i-log");
  const working = ins.kind === "understanding" && ins.lanes.some((l) => l.status === "running");
  const rows = ins.kind !== "understanding" ? [] : ins.lanes.filter((l) => working || l.status === "failed");
  log.hidden = !rows.length;
  log.replaceChildren(...rows.map((l) => {
    const row = el("div", "log-row"), st = el("span", "log-status " + l.status);
    st.innerHTML = l.status === "running" ? spinner(16, "brand") : icon(l.status === "done" ? "check_circle" : "error", 20);
    const label = el("span", "log-label", l.name);
    label.append(el("span", "sub", " · " + (TYPE_LABEL[l.type] || human(l.type || "analyzer"))));
    const sr = el("span", "sr-only", l.name + " " + l.status); sr.setAttribute("role", "status");
    row.append(st, label, sr);
    return row;
  }));
}

function drawLanes() {
  const box = $("i-lanes"), shown = ins.lanes.filter((l) => l.status === "done");
  box.hidden = !shown.length;
  const d = insLen(), notes = [];
  const rows = shown.map((l) => {
    const row = el("div", "lane"), track = el("div", "lane-track");
    row.style.setProperty("--lane", l.colour);
    const name = el("span", "lane-label", l.name); name.title = l.name;
    row.append(name, track);
    if (l.error) { track.className = "lane-error"; track.textContent = l.error; return row; }
    if (!l.segments) { track.classList.add("skel"); return row; }
    track.setAttribute("role", "group"); track.ariaLabel = l.name + ", " + l.segments.length + " segments";
    l.segments.forEach((sg, i) => {
      const b = el("button", "lane-seg"); b.type = "button"; b.tabIndex = i ? -1 : 0;
      b.style.left = pct(sg.start / d); b.style.width = pct((sg.end - sg.start) / d);
      b.ariaLabel = l.name + ", " + fmt(sg.start) + " to " + fmt(sg.end); b.title = fmt(sg.start) + " – " + fmt(sg.end) + " · " + summary(sg.data).slice(0, 120);
      b.onclick = () => playAt(sg.start);
      b.onkeydown = (e) => {
        const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!k) return;
        e.preventDefault();
        const next = track.children[Math.max(0, Math.min(l.segments.length - 1, i + k))];
        b.tabIndex = -1; next.tabIndex = 0; next.focus();
      };
      track.append(b);
    });
    if (l.total > l.segments.length) notes.push("Showing the first " + l.segments.length + " of " + l.total + " segments of " + l.name + ".");
    return row;
  });
  const head = el("div", "lane-head"); head.id = "i-head";
  box.replaceChildren(...rows, head);
  $("i-note").hidden = !notes.length; $("i-note").textContent = notes.join(" ");
}

function playAt(t) {
  const go = () => { video.currentTime = t; lastT = t; video.play().catch(() => {}); };
  if (video.readyState >= 1) go(); else video.addEventListener("loadedmetadata", go, { once: true });
}

/** Data Table of an index's records, ten to a page; past the last loaded page it fetches the next 200. */
function drawTable() {
  const wrap = $("i-table"), l = ins.lanes[0];
  if (ins.kind !== "index" || !l.segments?.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const pages = Math.max(1, Math.ceil(l.segments.length / ROWS));
  ins.page = Math.min(ins.page, pages - 1);
  const rows = l.segments.slice(ins.page * ROWS, ins.page * ROWS + ROWS);
  const scroll = el("div", "table-wrap"), table = el("table", "table");
  scroll.tabIndex = 0; scroll.setAttribute("role", "region"); scroll.ariaLabel = "Records";
  table.innerHTML = '<thead><tr><th scope="col">Time</th><th scope="col">Content</th></tr></thead>';
  const body = el("tbody");
  rows.forEach((sg) => {
    const tr = el("tr"), time = el("td"), go = el("button", "link mono", fmt(sg.start) + " – " + fmt(sg.end));
    go.type = "button"; go.ariaLabel = "Play from " + fmt(sg.start); go.onclick = () => playAt(sg.start);
    tr.dataset.start = sg.start; tr.dataset.end = sg.end;
    time.append(go);
    const content = el("td"); content.append(el("span", "clip", summary(sg.data)));
    tr.append(time, content); body.append(tr);
  });
  table.append(body); scroll.append(table);
  const more = !!ins.cursor, nav = el("nav", "pager"); nav.ariaLabel = "Pagination";
  nav.innerHTML = '<button class="pg-step" type="button">' + icon("arrow_back", 20) + '<span>Previous</span></button><span class="pg-status"></span><button class="pg-step" type="button"><span>Next</span>' + icon("arrow_forward", 20) + "</button>";
  const [prev, status, next] = nav.children;
  const known = ins.source?.record_count;
  status.textContent = "Page " + (ins.page + 1) + " of " + (known ? Math.max(pages, Math.ceil(known / ROWS)) : pages + (more ? "+" : ""));
  prev.disabled = ins.page === 0; next.disabled = ins.page >= pages - 1 && !more;
  prev.onclick = () => { ins.page--; drawTable(); };
  next.onclick = () => { if (ins.page < pages - 1) { ins.page++; drawTable(); } else { ins.page++; loadIndexPage(); } };
  wrap.replaceChildren(scroll, nav);
  tick(true);
}

/** On every time update: move the playhead, mark the current segments and rows, and redraw the panel when they change. */
function tick(force) {
  if (!ins || insight.hidden) return;
  const t = video.currentTime || 0, d = insLen();
  const head = $("i-head");
  if (head) head.style.left = "calc(104px + (100% - 104px) * " + Math.max(0, Math.min(1, t / d)) + ")";
  const done = ins.lanes.filter((l) => l.segments);
  const cur = done.map((l) => l.segments.findIndex((s) => t >= s.start && t < s.end));
  const key = cur.join(",") + "|" + done.length;
  drawBoxes(t, done, cur);
  $("i-now-title").textContent = "At " + fmt(t);
  if (key === ins.at && !force) return;
  ins.at = key;
  [...$("i-lanes").querySelectorAll(".lane-track[role=group]")].forEach((track, i) => [...track.children].forEach((b, j) => b.setAttribute("aria-current", String(j === cur[i]))));
  $("i-table").querySelectorAll("tbody tr").forEach((tr) => {
    tr.removeAttribute("data-state");
    if (t >= +tr.dataset.start && t < +tr.dataset.end) tr.setAttribute("data-state", "selected");
  });
  const wrap = $("i-now-wrap");
  wrap.hidden = !done.length;
  if (!done.length) return;
  $("i-now").replaceChildren(...done.map((l, i) => {
    const item = el("section", "now-item"), head2 = el("div", "now-head"), sg = l.segments[cur[i]];
    item.style.setProperty("--lane", l.colour);
    head2.append(el("span", "swatch"), el("span", "now-name", l.name));
    if (sg) head2.append(el("span", "timestamp default", fmt(sg.start) + " – " + fmt(sg.end)));
    item.append(head2, sg ? segmentView(sg.data) : el("p", "muted", "Nothing at this time"));
    return item;
  }));
}

/** Object boxes from the detection frame nearest the playing time, placed on the picture inside the letterbox. */
function drawBoxes(t, done, cur) {
  let frame = null;
  done.forEach((l, i) => {
    const frames = l.segments[cur[i]]?.data?.frames;
    if (!Array.isArray(frames)) return;
    frames.forEach((f) => { if (f && isFinite(f.timestamp) && Math.abs(f.timestamp - t) <= 1 && (!frame || Math.abs(f.timestamp - t) < Math.abs(frame.timestamp - t))) frame = f; });
  });
  const layer = $("boxes"), id = frame ? frame.frame_id || frame.timestamp : "";
  if (layer.dataset.frame === String(id) && layer.dataset.w === String(vp.clientWidth)) return;
  layer.dataset.frame = String(id); layer.dataset.w = String(vp.clientWidth);
  layer.replaceChildren();
  if (!frame) return;
  const W = vp.clientWidth, H = vp.clientHeight, vw = video.videoWidth || W, vh = video.videoHeight || H, k = Math.min(W / vw, H / vh);
  const w = vw * k, h = vh * k, x0 = (W - w) / 2, y0 = (H - h) / 2;
  (frame.detections || []).forEach((det) => {
    const bb = det?.box?.box;
    if (!Array.isArray(bb) || bb.length < 4) return;
    const n = det.box.unit === "normalized" || bb.every((v) => v <= 1) ? [1, 1] : [vw, vh];
    const b = el("div", "box"), top = y0 + (bb[1] / n[1]) * h;
    b.style.left = x0 + (bb[0] / n[0]) * w + "px"; b.style.top = top + "px";
    b.style.width = ((bb[2] - bb[0]) / n[0]) * w + "px"; b.style.height = ((bb[3] - bb[1]) / n[1]) * h + "px";
    if (top < 24) b.classList.add("low");
    b.append(el("span", "", det.label + (isFinite(det.score) ? " " + Math.round(det.score * 100) + "%" : "")));
    layer.append(b);
  });
}
video.addEventListener("timeupdate", () => tick());
video.addEventListener("seeked", () => tick());

// Moments: search hits drawn on the scrubber and listed under the player; picking one plays it and shows its detail.
let moment = -1;
function drawMoments() {
  const ms = (items[cur]?.moments) || [], box = $("moments");
  moment = -1;
  $("m-head").hidden = box.hidden = !ms.length; $("m-detail").hidden = true;
  $("m-title").textContent = ms.length + (ms.length === 1 ? " moment" : " moments");
  box.replaceChildren(...ms.map((m, i) => {
    const li = el("li"), b = el("button", "item");
    b.type = "button";
    b.innerHTML = '<span class="item-media"></span><span class="item-content"><span class="item-title"></span><span class="item-description mono"></span></span>';
    b.querySelector(".item-media").textContent = String(i + 1);
    b.querySelector(".item-title").textContent = m.label || "Moment " + (i + 1);
    b.querySelector(".item-description").textContent = fmt(m.start) + " – " + fmt(m.end);
    if (isFinite(m.score)) b.append(el("span", "badge brand", "Score " + (Math.round(m.score * 100) / 100)));
    b.onclick = () => openMoment(i);
    li.append(b);
    return li;
  }));
  drawMarks();
}
function drawMarks() {
  const ms = (items[cur]?.moments) || [], d = span();
  $("marks").replaceChildren(...(d ? ms : []).map((m) => { const k = el("span", "mark"); k.style.left = pct(m.start / d); k.style.width = pct((m.end - m.start) / d); return k; }));
}
function openMoment(i) {
  const m = items[cur].moments[i];
  moment = i;
  [...$("moments").children].forEach((li, j) => li.firstChild.setAttribute("aria-current", String(j === i)));
  const box = $("m-detail"), head = el("div", "now-head");
  head.append(el("span", "now-name", m.label || "Moment " + (i + 1)), el("span", "timestamp default", fmt(m.start) + " – " + fmt(m.end)));
  box.replaceChildren(head);
  if (m.data) box.append(segmentView(m.data));
  box.hidden = false;
  playAt(m.start);
}
["durationchange", "loadedmetadata"].forEach((e) => video.addEventListener(e, drawMarks));

$("big").innerHTML = icon("play_arrow", 32, true);
$("spin").innerHTML = spinner(32, "inverse");
$("open").innerHTML = icon("open_in_new", 16);
$("err").innerHTML = icon("error", 24) + "<p>This video can't be played</p>";
setBtn($("mute"), "volume_up", "Mute");
setBtn($("fs"), "fullscreen", "Full screen");
$("pip").innerHTML = icon("picture_in_picture", 20);
showState();

app.ontoolresult = (res) => {
  const data = res.structuredContent, layout = data?.layout;
  if (layout === "gallery") renderGallery(data);
  else if (layout === "understanding" || layout === "index") renderInsight(data);
  else render(data);
};
app.onhostcontextchanged = (ctx) => ctx.theme && applyDocumentTheme(ctx.theme);
if (window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.setAttribute("data-theme", "dark");
await app.connect();
const theme = app.getHostContext()?.theme;
if (theme) applyDocumentTheme(theme);
</script>
</body>
</html>`;
}
