# Anthropic Connector Directory — Submission Checklist

Working checklist for listing the VideoDB connector in Claude's [Connectors Directory](https://claude.com/docs/connectors/directory). Sources: [submission guide](https://claude.com/docs/connectors/building/submission) · [review criteria](https://claude.com/docs/connectors/building/review-criteria) · [authentication](https://claude.com/docs/connectors/building/authentication).

## 0. Prerequisites

- [ ] **Claude Team or Enterprise org** — the submission portal lives in Claude.ai admin settings (`claude.ai/admin-settings/directory/submissions/new`); individual plans can't access it. Only org **Owners** can submit (Enterprise can delegate via a custom role with the Directory permission).
- [ ] **Production deployment** on a first-party domain, e.g. `https://mcp.videodb.io/mcp` (reviewers expect the server domain to match the service; a `*.vercel.app` URL is fine for testing but weak for review).
- [ ] Anthropic egress range `160.79.104.0/21` is **not blocked** by any WAF/CDN in front of the server or of `console.videodb.io` (the consent page must load for reviewers).
- [ ] Public **documentation page** live by publish date (a docs.videodb.io page or blog post: what the connector does, how to connect, tool list).
- [ ] **Privacy policy** URL (existing `https://videodb.io/privacy-policy`) and **support contact**.

## 1. Technical bar (already met by this repo — re-verify before submitting)

- [x] Remote MCP server over **Streamable HTTP** at `https://…/mcp`.
- [x] **OAuth 2.0/2.1** with Dynamic Client Registration, PKCE S256, refresh rotation (auth type: `oauth_dcr`).
- [x] Every tool has a `title` + `readOnlyHint` or `destructiveHint`; read and write operations are **separate tools**; no catch-all `api_request` tool; names ≤ 64 chars.
- [x] **No AI media generation tools** (VideoDB's `/generate/*` endpoints are deliberately not exposed — the directory rejects AI image/video/audio generation).
- [x] First-party API only (`api.videodb.io`).
- [x] Actionable error messages; trimmed responses (search results are mapped to compact match objects).
- [ ] Run `npm run e2e` green + exercise every tool once via **MCP Inspector** and once as a **custom connector in Claude** against production. The portal asks you to confirm you did this.

Note on auth at scale: DCR registers a new client on every fresh connection. Anthropic recommends **CIMD or pre-registered credentials (`oauth_anthropic_creds`)** for high-traffic directory listings — if the connector takes off, email `mcp-review@anthropic.com` a static client_id/secret and switch. Not a launch blocker.

## 2. Portal steps + suggested content

| Portal step | What to enter |
| --- | --- |
| **Connection** | URL `https://mcp.videodb.io/mcp`, transport: Streamable HTTP, same URL for every user |
| **Tools** | Auto-synced; all 16 should show as annotated (7 read / 8 write / 1 destructive) |
| **Listing — name** | `VideoDB` |
| **Listing — tagline** (≤55 chars) | `Search, edit, and stream your videos from Claude` |
| **Listing — description** (≤2000 chars) | VideoDB turns raw video into a searchable, editable database. Connect your VideoDB account and Claude can upload videos from any URL or YouTube link, transcribe and index them, semantically search for exact moments across your whole library, pull timestamped transcripts, cut clips and stitch highlight reels without re-encoding, burn in subtitles, and hand back instantly streamable links you can watch or share. Built for creators, media teams, and developers building video-native workflows. |
| **Categories** | Productivity; Media; Developer tools (pick 1–5) |
| **Docs URL** | `https://docs.videodb.io` (or the dedicated connector page) |
| **Privacy policy** | `https://videodb.io/privacy-policy` |
| **Support contact** | e.g. `support@videodb.io` |
| **Icon** | VideoDB logomark (square PNG) |
| **Slug** | `videodb` (permanent once published) |
| **Use cases** | Find moments in footage; turn long videos into clips/reels; transcript Q&A; media library management. Prereq: a VideoDB account + API key from console.videodb.io (free tier available, no card). Reads **and** writes data. |
| **Authentication** | OAuth with **Dynamic Client Registration** |
| **Data handling** | First-party API (our own); no personal-health data; no sponsored content |
| **Allowed link URIs** (all owned by Spext Labs Inc. dba VideoDB) | `https://videodb.io`, `https://console.videodb.io`, `https://player.videodb.io`, `https://stream.videodb.io`, `https://docs.videodb.io` |

## 3. Test account for reviewers

The portal requires credentials detailed enough for end-to-end review of a **fully populated** account:

- [ ] Create `claude-review@videodb.io` (or similar) in the VideoDB console; generate an API key.
- [ ] Pre-load the default collection with 3–5 videos, at least two **spoken-word indexed** and one **scene-indexed**, so `search_video`, `search_collection`, `get_transcript` return rich results immediately.
- [ ] Ensure enough credits for the reviewer to run `upload_media`, `index_*`, `generate_clip`, `compile_clips`, `add_subtitles`.
- [ ] Write step-by-step access instructions (console login → where the key lives → paste into consent page).

## 4. Compliance acknowledgments (all seven required)

Directory guidelines · first-party API usage · no financial transactions · **no AI media generation** · no prompt-injection patterns in tool descriptions · no conversation-data collection beyond tool needs · public documentation. This repo is designed to satisfy each; re-read tool descriptions before ticking.

## 5. After submitting

Track status + reviewer feedback at `claude.ai/admin-settings/directory/submissions`. Default outcome is a **community** listing after automated scanning; high-usage connectors get escalated to **verified** review automatically. Escalations: `mcp-review@anthropic.com`.
