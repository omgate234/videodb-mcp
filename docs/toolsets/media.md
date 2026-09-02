# media toolset

Videos, audio and images: list/get/upload/update/delete, thumbnails, signed URLs, YouTube search, transcode. Default on.

| Tool | Kind | SDK | Output |
| --- | --- | --- | --- |
| `list_videos` ★ / `list_audios` / `list_images` | R | `Collection.getVideos/getAudios/getImages` | `cap(picked, "videos"/"audios"/"images")` — first 200 + `truncated`/`total` |
| `get_video` ★ / `get_audio` / `get_image` | R | `Collection.getVideo/getAudio/getImage` | picked object |
| `upload_media` ★ | C | `Collection.uploadURL` | media object; with `callback_url` → `{accepted, collection_id, url, callback_url}` |
| `search_youtube` | R | `Connection.youtubeSearch(query, result_threshold, duration)` | `{results}` (raw SDK rows) |
| `search_videos_by_title` | R | `Collection.searchTitle` | array of picked videos |
| `update_video` | U | `Video.update({name})` | picked video with new name |
| `generate_thumbnail` ★ | C | `Video.generateThumbnail(time)` | `{thumbnail_url}` or Image |
| `list_thumbnails` | R | `Video.getThumbnails` | array of picked images |
| `get_media_download_url` | R | `Audio.generateUrl` / `Image.generateUrl` | `{media_id, media_type, download_url}`; `m-` id → error naming `download_stream` |
| `transcode_media` | C | `Connection.transcode(source, callback_url, mode, video_config, audio_config)` | `{accepted, job_id, callback_url}`; `retryWith: get_transcode_status` |
| `get_transcode_status` | R | `Connection.getTranscodeDetails` | `{job_id, ...details}` |
| `delete_video` ★ / `delete_audio` / `delete_image` | D | `Collection.deleteVideo/deleteAudio/deleteImage` | `{deleted, <kind>_id}` |
| `remove_video_storage` | D | `Video.removeStorage` | `{storage_removed, video_id}` |

## Deviations

- `transcode_media` sends `video_config` with snake_case keys (`aspect_ratio`, `resize_mode`). The Node SDK forwards the config object verbatim and the API (and Python SDK) use snake_case, so camelCase keys would be silently ignored. `callback_url` is required (SDK signature).
- `upload_media` with `callback_url` returns no media id: the SDK returns `undefined` on async uploads; the response echoes `collection_id`, `url` and `callback_url` instead.
- `list_*` now return `{videos|audios|images, truncated?, total?}` instead of the bare array `list_videos` ★ used to return — a real account hit 3170 images / 1.11 MB in one result. The SDK endpoints take no offset/limit, so the descriptions point past the cap (`search_videos_by_title`/`search_collection`, or `get_audio`/`get_image` by ID) rather than adding a paging parameter the API cannot honour.
- `search_youtube` `duration` is an enum (`short|medium|long`, default `medium`); the SDK types it as a free string. `any` is excluded — the API returns zero results for it. `result_threshold` is passed through but the API ignores it and always returns 10; the field description says so.
- `search_videos_by_title` returns the videos directly instead of the SDK's `[{video}]` wrapper.

## Kernel requests

- `VideoConfig` / `AudioConfig` are not exported from the `videodb` package root; the type is derived locally from `Connection["transcode"]`'s parameters.
