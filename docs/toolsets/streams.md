# streams toolset

Stream generation and simple edits on top of the `videodb` SDK. File: `lib/toolsets/streams.ts`, tests: `test/streams.test.ts`.

| Tool | Kind | SDK call | Wire |
| --- | --- | --- | --- |
| `generate_clip` ★ | create | `startJob(["video", id, "stream"], {length, timeline})` | POST `video/{id}/stream` (polling off) |
| `compile_clips` ★ | create | `startJob(["compile"], clips)` | POST `compile` (polling off) |
| `add_subtitles` ★ | create | `Video.addSubtitle(style)` | POST `video/{id}/workflow` `{type: add_subtitles, subtitle_style}` |
| `create_highlight_clip` | create | `startJob(["video", id, "clip"])` | POST `video/{id}/clip` (polling off); result = shots for `compile_clips` |
| `reframe_video` | create | `startJob(["video", id, "reframe"])` | POST `video/{id}/reframe` (polling off) |
| `download_stream` | create | `startJob(["download"], {stream_link, name})` | POST `download` (polling off) |

All but `add_subtitles` are async-first: they return `{status:"processing", job_id, output_url, poll_with:"get_job_result"}` and `get_job_result(output_url)` returns the stream / video / download / shots when the backend finishes. A backend that answers inline yields the result directly. `add_subtitles` stays on `Video.addSubtitle` because `/video/{id}/workflow` answers inline.

## Notes

- `add_subtitles` exposes the full `SubtitleStyleProps` as snake_case fields. `border_style` (`no_border|opaque_box|outline`) and `alignment` (`bottom_left` … `top_right`) are string enums mapped to `SubtitleBorderStyle` (1/3/4) and `SubtitleAlignment` (1–9). Only keys the caller set are passed — the SDK spreads the config over its defaults, so an explicit `undefined` would erase a default. Existing fields (`font_name`, `font_size`, `bold`, `italic`) are unchanged.
- `create_highlight_clip` defaults `content_type=spoken`, `model_name=basic`. It no longer compiles: the clip selection is its own background job, and the model passes the returned shots to `compile_clips`, which is a second job. `{shots: []}` when the prompt matches nothing.
- `reframe_video` defaults follow the SDK (`target=vertical`, `mode=smart`); `target` also accepts `{width, height}`. With `callback_url` it returns `{accepted: true, video_id, collection_id, callback_url}`; otherwise the job handle, and `get_job_result` returns the new video trimmed to `VIDEO_KEYS`. `retryWith: list_videos`.
- `download_stream` requires `name` (the SDK signature does). A stream that was already exported answers `{download_url}` inline; otherwise the job handle (`output_url` = `/download/{id}`, an authenticated route).
- `compile_clips` prefers the server-supplied `player_url` over the derived one (same behaviour as the seed, tidied).

## Deviations from the catalog

None. `SubtitleStyleProps` is not re-exported from the `videodb` package root, so the style type is derived from `Video["addSubtitle"]`'s parameter.

## Kernel requests

None.
