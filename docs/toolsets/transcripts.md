# transcripts

Branch `feat/toolset-transcripts` · `lib/toolsets/transcripts.ts` · `test/transcripts.test.ts` (8 tests)

| Tool | Kind | SDK | Wire |
| --- | --- | --- | --- |
| `get_transcript` ★ | read | `Video.getTranscript(start,end,segmenter,length)` / `Audio.getTranscript(...)` + `Audio.transcriptText` | GET `video/{id}/transcription` / GET `audio/{id}/transcription` |
| `generate_transcript` | create | `startJob([kind, id, "transcription"], {force, language_code})` | POST `video/{id}/transcription` / POST `audio/{id}/transcription` (polling off) |
| `translate_transcript` | create | `startJob(["collection", cid, "video", id, "translate"])` | POST `collection/{cid}/video/{id}/translate` (polling off; `cid` = the video's canonical collection) |

## Inputs

- `get_transcript` / `generate_transcript` take `media_id` (m- or a-, dispatched via `mediaKind`). `video_id` stays as a deprecated alias; a zod `.refine` requires one of the two. `img-` IDs fail with an explicit error.
- `get_transcript` adds `segmenter` (word | sentence | time) and `segment_length`; `timestamped=false` (default) returns `{text}` only — unchanged from the seed.
- `generate_transcript`: `force` (default false), `language_code`; `retryWith: get_transcript`. Returns `{media_id, media_type, status:"processing", output_url, poll_with}`; an existing transcript answers `{status:"done"}` at once. The text is never echoed — `get_transcript` pages it.
- `translate_transcript`: `language`, `additional_notes`, `callback_url` → `{accepted: true, video_id, language}` when a callback is given; otherwise the job handle, and `get_job_result` returns `translated_transcript`.

## Deviations from the catalog

- Segment cap is 2000 (not the 200 example): word-level timestamps of a 10-minute video already exceed 200, and the cap would make `timestamped=true` useless. Truncated responses carry `truncated: true` + `total` (shared `cap()` contract).
- Audio segments are `{start, end, text}` (SDK shape) while video segments are `{start, end, word}`; both are returned under `word_timestamps` so the output key is stable across media kinds.
- Audio wire call always sends `segmenter=word&length=1&force=false` defaults — that is the SDK's `_fetchTranscript` behaviour, not ours.
- `translate_transcript` has no `retryWith`: the translation is stored nowhere readable — `get_job_result(output_url)` is the only way back to it. Audio has no translate route, so the tool is video-only.
- `generate_transcript` no longer passes transcript data through: an inline answer means the transcript already exists, and echoing tens of thousands of words into a create tool's result is what `get_transcript`'s segment cap exists to prevent.

## Kernel requests

None.
