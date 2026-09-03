# media toolset

Videos, audio and images: list/get/upload/update/delete, thumbnails, signed URLs, YouTube search, transcode. Default on.

| Tool | Kind | SDK | Output |
| --- | --- | --- | --- |
| `list_assets` | R | none — direct `GET /assets` via `Connection.vhttp` | `{assets, pagination}` — mixed video/audio/image rows picked to `ASSET_KEYS` |
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

- `list_assets` is the one tool with no SDK binding: the Node SDK has no `/assets` wrapper, so `lib/videodb/assets.ts` calls the endpoint through `Connection.vhttp` (the SDK's own authenticated axios client) with `convert: false`, keeping the API's snake_case keys. It is the only listing with server-side filtering (`asset_type`, `name_pattern` regex, duration/size bounds), sorting (`name|duration|size|created_at`) and real pagination, and the only one that spans the whole account when `collection_id` is omitted. `asset_type` is a zod enum array joined to the comma string the API expects; `name_pattern` is capped at 100 chars to match the API's own limit; `page_size` uses the shared `PAGE_SIZE` atom (default 100, max 1000) rather than the API default of 50000, which would flood the context window.
- `list_assets` rows verified live against a dev API (5360 assets): videos carry `stream_url`/`player_url`/`thumbnail_url`, audio carries `length`/`size`, and image `url` is always null in this listing (it is minted on demand — the description points at `get_image`/`get_media_download_url`). No row carries `created_at`, so the API's default `sort_by=created_at` sorts every row on an empty string; the effective order is the store's own newest-first order within each type, concatenated. The description says so rather than silently changing the default. `link_token`, `stream_link`, `extension` and `user_id` are present on the wire and dropped by `ASSET_KEYS`.
- `transcode_media` sends `video_config` with snake_case keys (`aspect_ratio`, `resize_mode`). The Node SDK forwards the config object verbatim and the API (and Python SDK) use snake_case, so camelCase keys would be silently ignored. `callback_url` is required (SDK signature).
- `upload_media` with `callback_url` returns no media id: the SDK returns `undefined` on async uploads; the response echoes `collection_id`, `url` and `callback_url` instead.
- `list_*` now return `{videos|audios|images, truncated?, total?}` instead of the bare array `list_videos` ★ used to return — a real account hit 3170 images / 1.11 MB in one result. The SDK endpoints take no offset/limit, so the descriptions point past the cap (`search_videos_by_title`/`search_collection`, or `get_audio`/`get_image` by ID) rather than adding a paging parameter the API cannot honour.
- `search_youtube` `duration` is an enum (`short|medium|long`, default `medium`); the SDK types it as a free string. `any` is excluded — the API returns zero results for it. `result_threshold` is passed through but the API ignores it and always returns 10; the field description says so.
- `search_videos_by_title` returns the videos directly instead of the SDK's `[{video}]` wrapper.
- `upload_media.media_type` defaults to `video` rather than letting the server sniff the file: an unset enum was the most common validation failure. Audio and image uploads must set it explicitly, which both the tool and the param description say.

## Kernel requests

- `VideoConfig` / `AudioConfig` are not exported from the `videodb` package root; the type is derived locally from `Connection["transcode"]`'s parameters.
