# Connector directory — submission tracker

Server: `https://mcp.videodb.io/mcp` · Portal: [claude.ai/admin-settings/directory/submissions](https://claude.ai/admin-settings/directory/submissions/new) · Listing copy + test-account plan: [SUBMISSION.md](SUBMISSION.md)

**Status: 2 blockers open, both in testing.** 89 tools, all toolsets on. Repo stays private — not a listing requirement.

## Open

| # | Item | Owner | Status | Next action |
| --- | --- | --- | --- | --- |
| 1 | Merge `feat/sdk-toolsets` → `main`, redeploy | | In progress | Portal syncs tools from the live server — prod must serve the final list |
| 2 | Live pass: every tool via MCP Inspector + as a custom connector | | In progress | Portal makes you attest to it; `npm test` doesn't count |
| 3 | Swap Apache-2.0 `LICENSE` for a proprietary notice | | Not started | Only step left to actually close the source |

## Before publish (not before submit)

| # | Item | Owner | Status |
| --- | --- | --- | --- |
| 4 | Connector page on `docs.videodb.io` (or a blog post) | | Not started |
| 5 | Reviewer test account, populated: 3–5 videos, ≥2 spoken-indexed, ≥1 scene-indexed, credits for write tools | | Not started |
| 6 | Confirm Anthropic egress `160.79.104.0/21` isn't WAF-blocked on `mcp.videodb.io` / `console.videodb.io` | | Not started |

## Done

- [x] `get_transcript` read-only annotation verified correct; description fixed
- [x] Privacy-policy URL → `videodb.io/legal/privacy` (old one 404'd)
- [x] All nine toolsets default-on — no `VIDEODB_MCP_TOOLSETS` needed in prod
- [x] README: Privacy Policy + Support sections
- [x] README: closed-source notice; support no longer points at a public issue tracker
- [x] OAuth 2.1 (DCR, PKCE S256, audience-bound tokens), Streamable HTTP, discovery metadata live
- [x] All 89 tools annotated (`title` + read-only/destructive hint); read/write split; names ≤64
- [x] No AI media generation, no catch-all `api_request`, first-party API only
- [x] Typecheck clean, 139/139 tests green

## Nice-to-have (not review-gating)

| Item | Where |
| --- | --- |
| Pin `PUBLIC_ORIGIN` instead of trusting `x-forwarded-host` | `lib/oauth.ts:136` |
| Dual-secret decrypt so `AUTH_SECRET` can rotate without mass logout | `lib/crypto.ts` |
| Token denylist for per-user revocation | `lib/oauth.ts` |
| Static client ID / CIMD instead of DCR if volume grows | email `mcp-review@anthropic.com` |

## Org prerequisites

Claude Team/Enterprise org; submit as Owner (Enterprise can delegate via a custom role with the **Directory** permission). Seven compliance acknowledgments at the end of the portal flow, all required.
