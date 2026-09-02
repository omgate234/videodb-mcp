# meetings toolset (default **off**)

Meeting recorder bots on the `videodb` SDK. File: `lib/toolsets/meetings.ts`, tests: `test/meetings.test.ts`. Send a bot into a Zoom / Google Meet / Microsoft Teams call, then poll it for the recorded video.

| Tool | Kind | SDK | Wire | Output |
| --- | --- | --- | --- | --- |
| `record_meeting` | create | `Collection.recordMeeting({meetingUrl, botName, botImageUrl, meetingTitle, timeZone, callbackUrl})` | POST `collection/{id}/meeting/record` | Meeting picked to id, collection_id, status, bot_name, meeting_title, meeting_url, time_zone, video_id, speaker_timeline; `retryWith: get_meeting`; with `callback_url` → `{accepted: true, ...}` |
| `get_meeting` | read | `Collection.getMeeting(id)` | GET `collection/{id}/meeting/{mid}` | same keys |

## Notes

- `status` moves through `initializing` → `joined` → `processing` → `done`; `video_id` is only populated once `done`, so `record_meeting` sets `retryWith: get_meeting`.
- `time_zone` defaults to `UTC` and takes an IANA name (e.g. `America/New_York`).

## Deviations from the catalog

| Item | Why |
| --- | --- |
| `record_meeting` adds `bot_image_url`; `callback_data` not exposed | SDK accepts the image URL; callback_data is an opaque webhook payload with no model-facing use. |
| `Meeting.waitForStatus` never called | 4 h poll; `record_meeting` returns after the POST. |
| Capture-session tools dropped from this toolset | Capture sessions are produced by the VideoDB desktop capture client, a local native binary. That surface has no place in a remote connector — see "Excluded from the connector" in `docs/TOOLSETS.md`. |

## Kernel requests

None.
