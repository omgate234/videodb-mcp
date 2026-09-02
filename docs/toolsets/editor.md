# editor toolset

Multi-track timeline editing via the SDK's `EditorTimeline`/`Track`/`Clip`/asset classes. Default on.

| Tool | Kind | SDK | Input |
| --- | --- | --- | --- |
| `render_timeline` | create | `EditorTimeline.generateStream()` → `POST /editor` | `tracks[{z_index?, clips[{start, duration, asset, transition?, effect?, filter?, scale?, opacity?, fit?, position?, offset?, z_index?}]}]`, `background?`, `resolution?` |
| `download_timeline_render` | create | `EditorTimeline.downloadStream(url)` → `POST /editor/download` | `stream_url` |

`asset` is a discriminated union on `type`: `video` (m- id, start, volume, crop) · `image` (img- id, crop) · `audio` (a- id, start, volume) · `text` (text, font, border, shadow, background, alignment, tabsize, line_spacing, width, height) · `caption` (src `auto`, font, primary/secondary/back colour, border, position, animation). Inputs are snake_case and mapped to the SDK's camelCase configs; the SDK classes emit the wire JSON.

## Validation

- Mirrors SDK ranges in zod so bad specs fail before any request: scale 0–10, opacity 0–1, font size ≥ 1, weight 100–900, crop fractions 0–1, tabsize ≥ 1, text width/height ≥ 1.
- Hex colours (`#RRGGBB`) for text/background; ASS colours (`&HAABBGGRR`) for captions, as the SDK defaults use.
- `resolution` must be `WIDTHxHEIGHT`; `fit`, `position`, `filter`, alignments and `animation` are enums copied from the SDK.

## Verified surprises (documented in the tool descriptions)

| Behaviour | Detail |
| --- | --- |
| Caption `src: "auto"` on an unindexed video | Renders successfully with zero captions and no error; the SDK's `console.warn` never reaches the MCP client. The video needs `index_spoken_words` first. |
| Text `width`/`height` under the default `fit: "crop"` | The box is a sub-canvas that `crop` upscales to fill the frame, so a 48px font can render ~300px tall. Only `fit: "contain"` keeps the declared size. |

## Deviations

| Item | Why |
| --- | --- |
| `fit: "none"` is assigned after `new Clip()` | SDK `Clip` does `config.fit ?? Fit.crop`, and `Fit.none === null`, so passing it through the constructor silently becomes `crop`. Setting `clip.fit` afterwards puts `null` on the wire as intended. |
| Caption `src` accepts only `"auto"` | The SDK allows any string but documents no other source; restricting avoids a silent server-side failure. |
| `transition.in/out` and `effect` are free strings | SDK types them as `string`; known transition names are listed in the field description. |
| No `retryWith` on `render_timeline` | The render is synchronous (returns the stream URL directly); there is no read tool that would show a pending result. |
| `download_timeline_render` returns the SDK's raw response | `downloadStream` returns an untyped record; it is flattened as-is. |

## Kernel requests

None.
