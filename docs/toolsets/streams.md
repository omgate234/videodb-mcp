# streams toolset

Stream generation and simple edits on top of the `videodb` SDK. File: `lib/toolsets/streams.ts`, tests: `test/streams.test.ts`.

| Tool | Kind | SDK call | Wire |
| --- | --- | --- | --- |
| `generate_clip` ★ | create | `Video.generateStream(timeline)` | POST `video/{id}/stream` |
| `compile_clips` ★ | create | `vhttp.post(["compile"], clips)` | POST `compile` |
| `add_subtitles` ★ | create | `Video.addSubtitle(style)` | POST `video/{id}/workflow` `{type: add_subtitles, subtitle_style}` |
| `create_highlight_clip` | create | `Video.clip(prompt, contentType, modelName)` → `SearchResult.compile()` | POST `video/{id}/clip`, then POST `compile` |
| `reframe_video` | create | `Video.reframe({start, end, target, mode, callbackUrl})` | POST `video/{id}/reframe` |
| `download_stream` | create | `Connection.download(streamLink, name)` | POST `download` |

## Notes

- `add_subtitles` exposes the full `SubtitleStyleProps` as snake_case fields. `border_style` (`no_border|opaque_box|outline`) and `alignment` (`bottom_left` … `top_right`) are string enums mapped to `SubtitleBorderStyle` (1/3/4) and `SubtitleAlignment` (1–9). Only keys the caller set are passed — the SDK spreads the config over its defaults, so an explicit `undefined` would erase a default. Existing fields (`font_name`, `font_size`, `bold`, `italic`) are unchanged.
- `create_highlight_clip` defaults `content_type=spoken`, `model_name=basic`; returns `{shots: []}` without compiling when the prompt matches nothing (the SDK would throw). Player URL comes from the compile response when present, otherwise derived.
- `reframe_video` defaults follow the SDK (`target=vertical`, `mode=smart`); `target` also accepts `{width, height}`. With `callback_url` it returns `{accepted: true, video_id, collection_id, callback_url}`; otherwise the new video trimmed to `VIDEO_KEYS`. `retryWith: list_videos`.
- `download_stream` requires `name` (the SDK signature does); the job payload is returned flattened as-is.
- `compile_clips` prefers the server-supplied `player_url` over the derived one (same behaviour as the seed, tidied).

## Deviations from the catalog

None. `SubtitleStyleProps` is not re-exported from the `videodb` package root, so the style type is derived from `Video["addSubtitle"]`'s parameter.

## Kernel requests

None.
