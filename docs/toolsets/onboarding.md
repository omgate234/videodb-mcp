# Onboarding

| Tool | Kind | Purpose |
| --- | --- | --- |
| `onboarding` | read | Return agent-facing guidance for a new user's first useful VideoDB result. No arguments or upstream API calls. |

Enabled by default; configurable through the `onboarding` toolset. Server initialization instructions point new-user/exploration requests to this tool when available. MCP does not automatically invoke tools on login; the client agent chooses when to call it.

The guide adapts the connector workflows in `videodb-skills-main/skills/video-search`, `video-clips`, `video-edit`, and `video-subtitles`. It covers media reuse/upload, transcript-first answers, visual understanding, optional indexing and retrieval, direct editing, captions, job polling, and result delivery. Paths follow user intent and can be skipped or switched at any point.

Unlike SDK-backed tools, this read-only tool returns static guidance and never accesses the account. Its tests verify invocation without API calls, tool references, and registry exposure. Documentation links come from the source skills; current exposed tool schemas remain authoritative for arguments.
