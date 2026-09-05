# Connectors Directory — paste-ready portal copy

Companion to [SUBMISSION.md](SUBMISSION.md). Every block below is the exact text for one portal field.
Replace anything in `[square brackets]` before submitting.

## Connection

| Field | Value |
| --- | --- |
| Server URL | `https://mcp.videodb.io/mcp` |
| Transport | Streamable HTTP |
| Same URL for every user | Yes |

## Listing

**Name**

```
VideoDB
```

**Tagline** (48/55 chars)

```
Search, edit, and stream your videos from Claude
```

**Description** (≤2000 chars)

```
VideoDB turns raw video into a searchable, editable database. Connect your VideoDB account and Claude can upload videos from any public URL, transcribe and index them, find the exact moments you describe across your whole library, pull timestamped transcripts, cut clips and stitch highlight reels without re-encoding, reframe footage for vertical or square formats, burn in subtitles, and hand back instantly streamable links you can watch, share, or download as MP4. It can also monitor live RTSP, RTMP or HLS streams with searchable indexes and event alerts. Built for creators, media teams, and developers building video-native workflows.
```

**Categories** — pick the closest matches to: Productivity, Media, Developer tools

**Documentation URL**

```
https://docs.videodb.io
```

(Swap in the dedicated connector page once it is live; it must be public by the publish date.)

**Privacy policy URL**

```
https://videodb.io/legal/privacy
```

**Support contact**

```
hello@videodb.io
```

**Icon** — square PNG of the VideoDB logomark, no wordmark, transparent or solid background.

**Slug** (permanent once published)

```
videodb
```

## Use cases and access

**Primary use cases**

```
Find moments in footage: "Search my product-demo collection for every moment someone mentions pricing and give me the timestamps."
Upload and index: "Upload our webinar recording from this link, transcribe it, and index the spoken words and scenes so I can search it."
Transcript Q&A: "Pull the transcript of last week's onboarding webinar and summarize the three most common customer objections."
Cut clips and highlight reels: "Make a 60-second highlight reel of the funniest moments in this video and give me a streamable link."
Repurpose for social: "Reframe this talk to vertical 9:16 and burn in subtitles so I can post it as a Short."
Library management: "List every video in my Interviews collection longer than 30 minutes, then delete the duplicates."
Monitor live streams: "Connect this RTSP camera feed and alert my webhook whenever a forklift enters the loading bay."
```

**Connection requirements**

```
Requires a VideoDB account and an API key. Sign up at console.videodb.io (free tier, no credit card required), sign in, and copy the API key shown in the console. When you add the connector in Claude, the VideoDB consent page opens: paste the key there and click Connect. The key is verified live against the VideoDB API, encrypted inside the OAuth token issued to Claude, and never stored on the connector server or shared with Anthropic.

No admin role or special permission is needed. Any VideoDB user can connect with their own key, and Claude can only see and change what that key can access. Uploading, indexing, transcribing, clipping and rendering media consume VideoDB credits from the connected account. The live-stream tools additionally need a reachable RTSP, RTMP or HLS URL.
```

**Read / write capabilities** — select **Read and write**. If a justification box appears:

```
Read tools list collections and media, search indexed moments, and return transcripts and stream URLs. Write tools upload media, build indexes, cut clips, render streams, and (flagged destructiveHint) delete videos, indexes and collections.
```

## Authentication

**Authentication mode** — select **OAuth 2.0 + Dynamic Client Registration** (the first option). Leave **Partial auth unchecked**: `app/mcp/route.ts` marks auth as required, so every call including tools/list returns 401 without a valid bearer token; the server never starts authless.

| Field | Value |
| --- | --- |
| Auth type | OAuth 2.0 + Dynamic Client Registration (`oauth_dcr`, RFC 7591) |
| Partial auth | No |
| PKCE | S256, required |
| Discovery | `https://mcp.videodb.io/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` |

If asked to describe the flow:

```
Claude registers a client via Dynamic Client Registration, then opens the VideoDB consent page at /oauth/authorize. The user pastes their VideoDB API key, which is verified live against api.videodb.io. The server issues a PKCE-bound authorization code (5 min), then access tokens (1 hour) and rotating refresh tokens (30 days). The API key travels AES-256-GCM-encrypted inside the token and is decrypted per request; nothing is stored server-side.
```

## Data handling

| Question | Answer |
| --- | --- |
| Calls a first-party API? | Yes — only `api.videodb.io`, which we own |
| Handles personal health information? | No |
| Contains sponsored content? | No |
| Processes financial transactions? | No — `list_invoices` and `get_account_usage` are read-only views of the user's own billing summary |
| Data collected beyond tool arguments? | None. No conversation content is read or stored; the server has no database |

## Allowed link URIs

All owned by Spext Labs Inc. dba VideoDB.

```
https://videodb.io
https://console.videodb.io
https://player.videodb.io
https://stream.videodb.io
https://docs.videodb.io
```

## Test account for reviewers

Create the account first (see SUBMISSION.md §3), then paste:

```
Test account
  Console: https://console.videodb.io
  Email: [claude-review@videodb.io]
  Password: [password]
  API key: [vdb-key]

Steps
  1. In Claude, add the VideoDB connector and click Connect. The VideoDB consent page opens.
  2. Paste the API key above and click Connect. (To fetch it yourself: sign in at console.videodb.io with the credentials above and copy the API key shown in the console.)
  3. Back in Claude, ask "List my VideoDB collections" to confirm the connection.

What is pre-loaded
  The default collection contains [N] videos. [Titles]. All are transcribed and spoken-word indexed; [title] also has a scene index and a v2 index built by create_index, so search_video, search_collection, ask_video, get_transcript and semantic_search return results immediately.

Suggested review path
  search_collection ("[a query that hits]") → get_transcript → generate_clip → compile_clips → add_subtitles → download_stream.
  upload_media with any public MP4 URL, then index_spoken_words, to exercise the write path end to end.
  The account has [N] credits, enough for the full tool surface including reframe_video and create_highlight_clip.

Notes
  delete_* and remove_video_storage are permanent; the account can be re-seeded on request at hello@videodb.io.
  Live-stream tools need a reachable RTSP/RTMP/HLS URL and are optional to review.
```

## Compliance acknowledgments

All seven are checkboxes. What each one attests, for the two that need thought:

- **No AI media generation** — the `generate*`, `dubVideo`, voice-clone and sandbox SDK surface is not exposed. Tools that call models (`ask_*`, transcription, scene indexing, `understand_video`, `reframe_video`, `create_highlight_clip`) analyse or edit existing media; none produce new images, video or audio from a prompt.
- **No prompt-injection patterns** — tool descriptions state what the tool does and its prerequisite; none contain instructions to the model (enforced by the rule in TOOLSETS.md).

## Testing confirmation

The portal asks you to confirm every tool was exercised via MCP Inspector and as a custom connector in Claude against production. That is still open in SUBMISSION.md §1; run the live pass before ticking it.
