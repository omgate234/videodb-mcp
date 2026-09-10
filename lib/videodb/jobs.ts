import type { Connection } from "./client";
import { BASE_URL } from "./client";
import { AUDIO_KEYS, IMAGE_KEYS, VIDEO_KEYS, pick, playerUrlFor } from "./serialize";

/**
 * Async-first job protocol. Long VideoDB operations answer
 * `{status:"processing", data:{id, output_url}}` at once and keep running
 * server-side; the SDK would poll output_url for up to 500 s, which MCP
 * clients never wait for. We post with polling off, hand the output_url back
 * to the model, and let get_job_result read it later.
 */

type Raw = Record<string, unknown>;

export interface JobStarted {
  status: "processing";
  job_id?: string;
  output_url: string;
  poll_with: "get_job_result";
  message: string;
}

export type JobOutcome = { job: JobStarted } | { data: Raw };

const PROCESSING = new Set(["processing", "in progress", "in_progress", "queued"]);
const NO_POLL = { wait: false, convert: false } as const;
const LIST_CAP = 200;

export const isJobStarted = (o: JobOutcome): o is { job: JobStarted } => "job" in o;

const jobStarted = (label: string, id: unknown, output_url: string): JobStarted => ({
  status: "processing",
  ...(typeof id === "string" ? { job_id: id } : {}),
  output_url,
  poll_with: "get_job_result",
  message: `${label} accepted; VideoDB is processing it in the background. Call get_job_result with this output_url in ~30 s and keep polling while status is "processing".`,
});

/** Turn a raw (unpolled, snake_case) API body into a job handle or its finished payload. */
export function settle(body: Raw, label: string): JobOutcome {
  const data = (body.data ?? {}) as Raw;
  if (PROCESSING.has(String(body.status)) && typeof data.output_url === "string") {
    return { job: jobStarted(label, data.id, data.output_url) };
  }
  if (body.success === false) throw new Error(String(body.message ?? `${label} failed.`));
  // A finished /async-response body wraps the handler's own {success, data} under `response`.
  const inner = (body.response ?? body) as Raw;
  if (inner.success === false) throw new Error(String(inner.message ?? `${label} failed.`));
  return { data: ((inner.data ?? {}) as Raw) };
}

export async function startJob(vdb: Connection, path: string[], body: unknown, label: string): Promise<JobOutcome> {
  const res = (await vdb.vhttp.post(path, body, undefined, NO_POLL)) as unknown as Raw;
  return settle(res, label);
}

export async function fetchJob(vdb: Connection, outputUrl: string): Promise<JobOutcome> {
  const res = (await vdb.vhttp.get([outputUrl], undefined, NO_POLL)) as unknown as Raw;
  const out = settle(res, "Job");
  // The status URL is stable: hand the same one back so the model polls again without inventing a URL.
  return isJobStarted(out) ? { job: { ...out.job, output_url: outputUrl } } : out;
}

/** output_url is fetched with the user's API key attached, so it must point at VideoDB. */
export function isVideodbUrl(url: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return false;
  const base = new URL(BASE_URL());
  return target.origin === base.origin || target.hostname.endsWith(".videodb.io");
}

/** Stream results always ship a player_url; missing stream_url means the render produced nothing. */
export function streamResult(data: Raw, label: string) {
  const stream_url = data.stream_url;
  if (typeof stream_url !== "string" || !stream_url) throw new Error(`VideoDB returned no stream for this ${label}.`);
  return { stream_url, player_url: typeof data.player_url === "string" && data.player_url ? data.player_url : playerUrlFor(stream_url) };
}

/** Raw clip/search payload → the shot rows compile_clips accepts. */
export function shotsFromRaw(data: Raw) {
  const results = Array.isArray(data.results) ? (data.results as Raw[]) : [];
  return results.flatMap((r) =>
    (Array.isArray(r.docs) ? (r.docs as Raw[]) : []).map((d) => ({
      video_id: r.video_id,
      collection_id: r.collection_id,
      video_title: r.title,
      start: d.start,
      end: d.end,
      text: d.text,
      search_score: d.score,
    }))
  );
}

/** Shape a finished payload for the model: media records are trimmed, clip results become shots, long lists are capped. */
export function shapeResult(data: Raw): Raw {
  const id = typeof data.id === "string" ? data.id : "";
  if (id.startsWith("m-")) return pick(data, VIDEO_KEYS);
  if (id.startsWith("a-")) return pick(data, AUDIO_KEYS);
  if (id.startsWith("img-")) return pick(data, IMAGE_KEYS);
  if (Array.isArray(data.results)) return { shots: shotsFromRaw(data), next: "compile_clips" };
  let truncated = false;
  const out: Raw = {};
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v) && v.length > LIST_CAP) {
      out[k] = v.slice(0, LIST_CAP);
      out[`${k}_total`] = v.length;
      truncated = true;
    } else out[k] = v;
  }
  return truncated ? { ...out, truncated: true } : out;
}
