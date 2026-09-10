# jobs toolset

Read side of the async job protocol. `lib/toolsets/jobs.ts`, kernel in `lib/videodb/jobs.ts`, tests in `test/jobs.test.ts`. Always enabled: `enabledToolsets()` appends it whatever `VIDEODB_MCP_TOOLSETS` says, because every job-starting tool hands back an `output_url` only this tool can read.

| Tool | Kind | Wire | Output |
| --- | --- | --- | --- |
| `get_job_result` | read | `vhttp.get([output_url], {wait:false, convert:false})` | `{status:"processing", output_url, poll_with}` · `{status:"done", output_url, result}` · tool error with the server message |

## Why

| Fact | Consequence |
| --- | --- |
| MCP clients drop a tool call at ~60 s (SDK default request timeout); the directory showed p95 57.8 s and `McpReadTimeout` as the top error | A tool that waits for an upload, render or export never answers in time, whatever it would have returned |
| videodb-server already answers long routes with `{status:"processing", data:{id, output_url}}` and keeps working | The SDK's 500 s poll is the only thing that blocks; posting with `{wait:false}` gives the handle back in one round-trip |
| `output_url` is fetched with the user's API key in the header | `isVideodbUrl()` accepts only the configured API origin or `*.videodb.io`; anything else is a tool error before any request |

## Wire shapes `settle()` understands

| Body | Meaning |
| --- | --- |
| `{status:"processing"\|"in progress"\|"queued", data:{id?, output_url}}` | running → job handle (`/async-response/{id}` answers this with no `id` when the record is not written yet) |
| `{status, response:{success, data\|message}}` | finished `/async-response/{id}` — the handler's own envelope is under `response` |
| `{success, data\|message}` | finished authenticated status route (`/download/{id}`, `/video/{id}/transcription/`, `/video/{id}/reframe/{rid}`) |

`shapeResult()` trims media records (`m-`/`a-`/`img-` → `*_KEYS`), turns clip payloads into `shots` + `next:"compile_clips"`, and caps any top-level list at 200 with `<key>_total` + `truncated`.

## Job-starting tools

`upload_media`, `render_timeline`, `download_timeline_render`, `download_stream`, `generate_clip`, `compile_clips`, `create_highlight_clip`, `reframe_video`, `generate_transcript`, `translate_transcript`. Each returns `{status:"processing", job_id?, output_url, poll_with:"get_job_result", message}` or, when the backend answers inline, the finished result. `understand_video` and `create_index` already return queued state and have their own read tools (`get_understanding`, `get_index`).
