# VideoDB MCP Server

A remote [MCP](https://modelcontextprotocol.io) server that connects **Claude** (and any MCP client) to [**VideoDB**](https://videodb.io) — upload, index, search, edit, and stream videos straight from a conversation.

Built to meet [Anthropic's connector directory review criteria](https://claude.com/docs/connectors/building/review-criteria): OAuth 2.1, Streamable HTTP, read/write tool separation, and full tool annotations. Deploys to Vercel in minutes with **zero infrastructure — no database, no Redis**.

```
"Upload this YouTube keynote, index it, and find every moment where they demo the product.
 Then cut those moments into one highlight reel."
```

## Tools

Tools are grouped into **toolsets**, one per VideoDB domain, and every tool is backed by the official [`videodb`](https://www.npmjs.com/package/videodb) Node SDK. Which toolsets a deployment exposes is set with `VIDEODB_MCP_TOOLSETS` (comma list or `all`; unset → the default-on set). Full catalog, SDK mapping and exclusions: [docs/TOOLSETS.md](docs/TOOLSETS.md).

<!-- tools:begin — regenerate with `npm run tools:sync` -->
| Toolset | Default | Tool | Kind | What it does |
| --- | --- | --- | --- | --- |
| collections | on | `list_collections` | read | List all collections in the connected VideoDB account, with their IDs, names, and descriptions. |
| collections | on | `create_collection` | create | Create a new VideoDB collection to organize videos. |
| media | on | `list_videos` | read | List videos in a VideoDB collection: IDs, names, durations, and playable stream/player URLs. |
| media | on | `get_video` | read | Get metadata for one video: name, duration, thumbnail, stream URL, and a player URL for watching it in a browser. |
| media | on | `upload_media` | create | Upload a video, audio file, or image into VideoDB from a public URL (direct file links and YouTube URLs both work). |
| media | on | `generate_thumbnail` | create | Get the default thumbnail of a video, or generate one from a specific timestamp (in seconds). |
| media | on | `delete_video` | destructive | Permanently delete a video from a VideoDB collection. |
| transcripts | on | `get_transcript` | read | Get the transcript of a video, either as plain text or with word-level timestamps. |
| indexing | on | `index_spoken_words` | create | Transcribe and index everything spoken in a video so it becomes searchable with search_video / search_collection. |
| indexing | on | `index_scenes` | create | Visually index a video: samples frames per shot or per time window and describes what's on screen so visual moments become searchable (search_video with index_type='scene'). |
| indexing | on | `list_scene_indexes` | read | List the visual (scene) indexes that exist for a video, including their IDs, names and status. |
| search | on | `search_video` | read | Search within one video and get matching moments with start/end timestamps, text, and relevance scores. |
| search | on | `search_collection` | read | Semantic search across every indexed video in a collection. |
| streams | on | `generate_clip` | create | Cut a clip (or a supercut of several segments) from a single video without re-encoding. |
| streams | on | `compile_clips` | create | Stitch moments from one or more videos into a single new stream — e.g. |
| streams | on | `add_subtitles` | create | Burn subtitles into a video from its transcript (requires index_spoken_words first). |
<!-- tools:end -->

No AI media *generation* tools are exposed (VideoDB's `generate*`/dub/voice-clone endpoints exist but are excluded — the Anthropic directory does not accept AI image/video/audio generation). Desktop capture and WebSocket features stay in the SDK: they need a local process.

## How auth works (no database)

Claude requires OAuth 2.1; VideoDB accounts use API keys. This server bridges the two with a **stateless OAuth layer**:

```
Claude → /oauth/register (Dynamic Client Registration)
       → /oauth/authorize        user pastes their VideoDB API key on a consent page
                                 key is verified live against GET api.videodb.io/user
       → /oauth/token            PKCE-checked; returns access + refresh tokens
       → /mcp                    Bearer token per request
```

Every artifact (client ID, auth code, access/refresh token) is an **AES-256-GCM-sealed payload** encrypted with `AUTH_SECRET`. The user's VideoDB API key travels *inside* the encrypted token and is decrypted per-request — it is never written to disk, logged, or stored server-side. Tokens are audience-bound to the `/mcp` URL (RFC 8707), auth codes are PKCE-bound (S256) and live 5 minutes, access tokens 1 hour, refresh tokens 30 days with rotation.

Trade-off to know: with no server-side state, individual tokens can't be revoked before expiry — rotating `AUTH_SECRET` revokes *all* connections at once (users just reconnect). If you later need per-user revocation, add a token-ID denylist in Vercel KV.

## Deploy to Vercel

1. Push this repo to GitHub, then **Import** it at [vercel.com/new](https://vercel.com/new) (or run `npx vercel` from the repo root — no GitHub needed).
2. Set one environment variable: `AUTH_SECRET` — generate with `openssl rand -hex 32`.
3. Make sure **Fluid compute** is enabled (default for new projects) so long-running uploads/indexing fit inside `maxDuration = 300`. On Pro you can raise it to 800 in `app/mcp/route.ts`.
4. Deploy. Your MCP endpoint is `https://<your-domain>/mcp`.

Point a real domain at it (e.g. `mcp.videodb.io`) before submitting to the directory — the reviewer expects the server domain to match the service.

## Connect it to Claude

1. Claude → **Settings → Connectors → Add custom connector** (Team/Enterprise: Organization settings → Connectors).
2. Enter `https://<your-domain>/mcp`.
3. Click **Connect** — the VideoDB consent page opens; paste your API key from [console.videodb.io](https://console.videodb.io).
4. Done. Ask Claude to `list my videodb collections` to smoke-test.

Also works in Claude Code (`claude mcp add --transport http videodb https://<your-domain>/mcp`) and MCP Inspector.

## Local development

```bash
npm install
cp .env.example .env       # set AUTH_SECRET
npm run dev                # http://localhost:3000
npm test                   # unit tests (no network)
npm run tools:list         # print the tool catalog
```

## Submitting to the Anthropic connector directory

See [docs/SUBMISSION.md](docs/SUBMISSION.md) for the filled-out checklist: portal steps, listing copy, allowed link URIs, test-account requirements, and the compliance acknowledgments.

## Project layout

```
app/mcp/route.ts                          MCP endpoint + bearer verification
app/oauth/{authorize,token,register}/     Stateless OAuth 2.1 authorization server
app/.well-known/...                       RFC 9728 + RFC 8414 discovery metadata
lib/mcp/{tool,registry,schemas}.ts        defineTool() kernel, toolset registry + env gating, shared zod atoms
lib/toolsets/*.ts                         One file per domain (collections, media, search, streams, editor, rtstream…)
lib/videodb/*.ts                          SDK client, output flattening, deadline, error mapping, key verification
lib/oauth.ts, lib/crypto.ts               Sealed-token machinery
lib/consent-page.ts                       VideoDB-branded consent screen
scripts/list-tools.ts                     Prints the tool catalog (npm run tools:list)
test/                                     vitest; harness fakes the SDK transport so real SDK classes run
```

## License

Apache-2.0 © Spext Labs Inc. (VideoDB)
