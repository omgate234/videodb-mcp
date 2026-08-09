/**
 * VideoDB-branded OAuth consent page. Pure HTML + inline CSS (no client JS
 * beyond form basics) so it renders instantly inside Claude's OAuth popup.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function consentPage(opts: {
  reqToken: string;
  clientName?: string;
  error?: string;
}): string {
  const client = esc(opts.clientName || "Claude");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Connect ${client} to VideoDB</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #16231b 0%, #0b0f0d 60%);
    color: #e8ede9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  .card {
    width: 100%; max-width: 420px; background: #11161380; border: 1px solid #263029;
    border-radius: 16px; padding: 36px 32px; backdrop-filter: blur(8px);
  }
  .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
  .logo .mark {
    width: 34px; height: 34px; border-radius: 9px; background: #baf75c; color: #0b0f0d;
    display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px;
  }
  .logo .name { font-weight: 700; font-size: 17px; letter-spacing: .2px; }
  h1 { font-size: 19px; font-weight: 650; margin-bottom: 8px; }
  p.sub { color: #9fb0a5; font-size: 13.5px; line-height: 1.55; margin-bottom: 22px; }
  ul.scopes { list-style: none; margin: 0 0 24px; border: 1px solid #263029; border-radius: 10px; overflow: hidden; }
  ul.scopes li { display: flex; gap: 10px; align-items: center; padding: 9px 13px; font-size: 13px; color: #c9d4cc; }
  ul.scopes li + li { border-top: 1px solid #1d2620; }
  ul.scopes li::before { content: "✓"; color: #baf75c; font-weight: 700; }
  label { display: block; font-size: 12.5px; font-weight: 600; color: #c9d4cc; margin-bottom: 7px; }
  input[type=password] {
    width: 100%; padding: 11px 13px; border-radius: 9px; border: 1px solid #2c372f;
    background: #0c110e; color: #e8ede9; font-size: 14px; font-family: ui-monospace, monospace;
  }
  input[type=password]:focus { outline: none; border-color: #baf75c; }
  .hint { font-size: 12px; color: #7e8f84; margin-top: 7px; margin-bottom: 22px; line-height: 1.5; }
  .hint a { color: #baf75c; text-decoration: none; }
  .error {
    background: #2a1414; border: 1px solid #5c2626; color: #ffb4b4; font-size: 13px;
    border-radius: 9px; padding: 10px 13px; margin-bottom: 18px; line-height: 1.5;
  }
  .actions { display: flex; gap: 10px; }
  button {
    flex: 1; padding: 12px; border-radius: 9px; font-size: 14px; font-weight: 650; cursor: pointer; border: none;
  }
  .approve { background: #baf75c; color: #0b0f0d; }
  .approve:hover { background: #cbff75; }
  .deny { background: transparent; color: #9fb0a5; border: 1px solid #2c372f; }
  .deny:hover { border-color: #4a584e; color: #c9d4cc; }
  .foot { margin-top: 22px; text-align: center; font-size: 11.5px; color: #5f6e64; line-height: 1.6; }
  .foot a { color: #7e8f84; }
</style>
</head>
<body>
  <main class="card">
    <div class="logo"><div class="mark">▶</div><div class="name">VideoDB</div></div>
    <h1>Connect ${client} to VideoDB</h1>
    <p class="sub"><strong>${client}</strong> is requesting access to your VideoDB account. Once connected, it will be able to:</p>
    <ul class="scopes">
      <li>Browse collections and videos</li>
      <li>Upload and index new videos</li>
      <li>Search inside videos and read transcripts</li>
      <li>Create clips, compilations, and subtitles</li>
      <li>Delete videos (with your confirmation in Claude)</li>
    </ul>
    ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}
    <form method="POST" action="/oauth/authorize" autocomplete="off">
      <input type="hidden" name="req_token" value="${esc(opts.reqToken)}" />
      <label for="api_key">Your VideoDB API key</label>
      <input id="api_key" name="api_key" type="password" placeholder="sk-…" required autofocus />
      <p class="hint">Find or create your API key in the <a href="https://console.videodb.io" target="_blank" rel="noopener noreferrer">VideoDB console</a>. The key is verified, encrypted, and only ever used to serve your own requests — it is never stored on this server or shared with Anthropic.</p>
      <div class="actions">
        <button class="deny" type="submit" name="action" value="deny" formnovalidate>Cancel</button>
        <button class="approve" type="submit" name="action" value="approve">Authorize</button>
      </div>
    </form>
    <p class="foot"><a href="https://videodb.io" target="_blank" rel="noopener noreferrer">videodb.io</a> · <a href="https://videodb.io/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy</a> · <a href="https://docs.videodb.io" target="_blank" rel="noopener noreferrer">Docs</a></p>
  </main>
</body>
</html>`;
}
