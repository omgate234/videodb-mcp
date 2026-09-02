# VideoDB MCP Server

A remote [MCP](https://modelcontextprotocol.io) server that connects **Claude** (and any MCP client) to [**VideoDB**](https://videodb.io) — upload, index, search, edit, and stream videos straight from a conversation.

Built to meet [Anthropic's connector directory review criteria](https://claude.com/docs/connectors/building/review-criteria): OAuth 2.1, Streamable HTTP, read/write tool separation, and full tool annotations. Deploys to Vercel in minutes with **zero infrastructure — no database, no Redis**.

```
"Upload this YouTube keynote, index it, and find every moment where they demo the product.
 Then cut those moments into one highlight reel."
```

## Tools

| Tool | Kind | What it does |
| --- | --- | --- |
| `list_collections` | read | List collections in the account |
| `list_videos` | read | List videos with durations + player links |
| `get_video` | read | Metadata for one video |
| `get_transcript` | read | Plain or timestamped transcript |
| `search_video` | read | Semantic/keyword search inside one video (spoken or visual index) |
| `search_collection` | read | Semantic search across a whole collection |
| `list_scene_indexes` | read | List visual indexes on a video |
| `create_collection` | write | Create a collection |
| `upload_media` | write | Upload video/audio/image from a public URL or YouTube |
| `index_spoken_words` | write | Transcribe + index speech for search |
| `index_scenes` | write | Visually index scenes (optionally prompt-steered) |
| `generate_clip` | write | Cut a clip / supercut from one video → instant stream + player URL |
| `compile_clips` | write | Stitch moments across videos into one stream (highlight reels) |
| `add_subtitles` | write | Burn subtitles from the transcript |
| `generate_thumbnail` | write | Default or timestamped thumbnail |
| `delete_video` | destructive | Permanently delete a video |

No AI media *generation* tools are exposed (VideoDB's gen-AI endpoints exist but are excluded — the Anthropic directory does not accept AI image/video/audio generation).

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
```

## Submitting to the Anthropic connector directory

See [docs/SUBMISSION.md](docs/SUBMISSION.md) for the filled-out checklist: portal steps, listing copy, allowed link URIs, test-account requirements, and the compliance acknowledgments.

## Project layout

```
app/mcp/route.ts                          MCP endpoint (16 tools, annotated) + bearer verification
app/oauth/{authorize,token,register}/     Stateless OAuth 2.1 authorization server
app/.well-known/...                       RFC 9728 + RFC 8414 discovery metadata
lib/videodb.ts                            VideoDB REST client (envelope + async-poll protocol)
lib/oauth.ts, lib/crypto.ts               Sealed-token machinery
lib/consent-page.ts                       VideoDB-branded consent screen
```

## License

Apache-2.0 © Spext Labs Inc. (VideoDB)
