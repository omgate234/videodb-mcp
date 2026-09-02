# sessions toolset (default **off**)

Meeting recorder bots and desktop capture sessions. Capture sessions are created and recorded by the VideoDB desktop capture client; this connector only observes and exports them.

| Tool | Kind | SDK | Output |
| --- | --- | --- | --- |
| `record_meeting` | C | `Collection.recordMeeting` | Meeting picked to id, collection_id, status, bot_name, meeting_title, meeting_url, time_zone, video_id, speaker_timeline; `retryWith: get_meeting`; with `callback_url` → `{accepted: true, ...}` |
| `get_meeting` | R | `Collection.getMeeting` | same keys |
| `list_capture_sessions` | R | `Collection.listCaptureSessions({status})` | sessions picked to id, collection_id, status, end_user_id, exported_video_id, export_status, primary_video_channel_id, channels, created_at, metadata |
| `get_capture_session` | R | `CaptureSession.refresh()` | same keys + `rtstreams[]` trimmed to id, channel_id, media_types, status |
| `export_capture_session` | C | `CaptureSession.export(videoChannelId)` | `{session_id, export_status, video_id?, stream_url?, player_url?}`; `retryWith: get_capture_session` |

## Deviations from the catalog

| Item | Why |
| --- | --- |
| `get_capture_session` uses a `CaptureSession` shell + `refresh()` instead of `Collection.getCaptureSession` | Same GET `collection/{id}/capture/session/{sid}`, but the SDK constructor discards `rtstreams`; only `refresh()` hydrates them. |
| `export_capture_session` builds the `CaptureSession` shell from ids (no GET first) | `export()` needs only ids; mirrors the `collection()` shell idiom and saves a round-trip. |
| `record_meeting` adds `bot_image_url`; `callback_data` not exposed | SDK accepts the image URL; callback_data is an opaque webhook payload with no model-facing use. |
| `list_capture_sessions` omits `rtstreams` | SDK's list path never populates them; use `get_capture_session` for a session's streams. |
| `client_id` and `callback_url` dropped from session output | Client/webhook plumbing, not useful to the model. |
| `Meeting.waitForStatus` never called | 4 h poll; `record_meeting` returns after the POST. |

## Kernel requests

None.
