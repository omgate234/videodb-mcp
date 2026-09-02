/**
 * Flatten SDK class instances into compact snake_case JSON for tool output.
 * Drops methods (SDK exposes them as enumerable arrow props), undefined values,
 * and back-references (e.g. UnderstandingAnalyzer.understanding).
 */

const PLAYER_BASE = "https://console.videodb.io/player";

export const playerUrlFor = (streamUrl: string) => `${PLAYER_BASE}?url=${encodeURIComponent(streamUrl)}`;

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export function toPlain(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "function") return undefined;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => toPlain(v, seen));
  if (seen.has(value)) return undefined;
  seen.add(value);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "function" || v === undefined || k.startsWith("_")) continue;
    const plain = toPlain(v, seen);
    if (plain !== undefined) out[snake(k)] = plain;
  }
  if (typeof out.stream_url === "string" && !out.player_url) out.player_url = playerUrlFor(out.stream_url);
  return out;
}

/** Keep only the listed keys (after flattening) — for large SDK objects where a summary is enough. */
export function pick<T extends object>(value: T, keys: string[]): Record<string, unknown> {
  const plain = toPlain(value) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (plain[k] !== undefined && plain[k] !== null) out[k] = plain[k];
  return out;
}

export const VIDEO_KEYS = ["id", "collection_id", "name", "description", "length", "size", "stream_url", "player_url", "thumbnail"];
export const AUDIO_KEYS = ["id", "collection_id", "name", "length", "size"];
export const IMAGE_KEYS = ["id", "collection_id", "name", "url"];
export const SHOT_KEYS = ["video_id", "video_title", "start", "end", "text", "search_score", "scene_index_id", "scene_index_name", "stream_url", "player_url", "metadata"];

/** Search results → { shots: [...] } with only agent-relevant fields. */
export function shotsToPlain(shots: readonly object[]) {
  return shots.map((s) => pick(s, SHOT_KEYS));
}

/**
 * Cap an unbounded list so one tool result cannot blow the context window.
 * Truncated results always report `truncated: true` and `total`, whatever the
 * list is called, so agents can page or narrow the query.
 */
export const DEFAULT_LIST_CAP = 200;

export function cap<T>(items: readonly T[], key: string, max = DEFAULT_LIST_CAP): Record<string, unknown> {
  return items.length > max
    ? { [key]: items.slice(0, max), truncated: true, total: items.length }
    : { [key]: items };
}
