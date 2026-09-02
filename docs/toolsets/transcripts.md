# transcripts

Branch `feat/toolset-transcripts` · `lib/toolsets/transcripts.ts` · `test/transcripts.test.ts` (8 tests)

| Tool | Kind | SDK | Wire |
| --- | --- | --- | --- |
| `get_transcript` ★ | read | `Video.getTranscript(start,end,segmenter,length)` / `Audio.getTranscript(...)` + `Audio.transcriptText` | GET `video/{id}/transcription` / GET `audio/{id}/transcription` |
| `generate_transcript` | create | `Video.generateTranscript(force,languageCode)` / `Audio.generateTranscript(...)` | POST `video/{id}/transcription` / POST `audio/{id}/transcription` |
| `translate_transcript` | create | `Video.translateTranscript(language,additionalNotes,callbackUrl)` | POST `collection/{cid}/video/{id}/translate` |

## Inputs

- `get_transcript` / `generate_transcript` take `media_id` (m- or a-, dispatched via `mediaKind`). `video_id` stays as a deprecated alias; a zod `.refine` requires one of the two. `img-` IDs fail with an explicit error.
- `get_transcript` adds `segmenter` (word | sentence | time) and `segment_length`; `timestamped=false` (default) returns `{text}` only — unchanged from the seed.
- `generate_transcript`: `force` (default false), `language_code`; `retryWith: get_transcript`.
- `translate_transcript`: `language`, `additional_notes`, `callback_url` → `{accepted: true, video_id, language}` when a callback is given.

## Deviations from the catalog

- Segment cap is 2000 (not the 200 example): word-level timestamps of a 10-minute video already exceed 200, and the cap would make `timestamped=true` useless. Truncated responses carry `truncated: true` + `total_segments`.
- Audio segments are `{start, end, text}` (SDK shape) while video segments are `{start, end, word}`; both are returned under `word_timestamps` so the output key is stable across media kinds.
- Audio wire call always sends `segmenter=word&length=1&force=false` defaults — that is the SDK's `_fetchTranscript` behaviour, not ours.
- `translate_transcript` has no `retryWith`: the SDK returns the translation inline and stores nothing readable afterwards, so there is no read tool to point at. Audio has no translate method in the SDK, so the tool is video-only.
- `generate_transcript` returns the SDK's `{success, message}` envelope plus `media_id`/`media_type`; when the API returns transcript data instead (no word timestamps yet) that data is passed through.

## Kernel requests

None.
