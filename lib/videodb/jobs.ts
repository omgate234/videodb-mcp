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
  retry_after: number;
  max_wait?: number;
  message: string;
}

export type JobOutcome = { job: JobStarted } | { data: Raw };

const PROCESSING = new Set(["processing", "in progress", "in_progress", "queued"]);
const NO_POLL = { wait: false, convert: false } as const;
const LIST_CAP = 200;

export const isJobStarted = (o: JobOutcome): o is { job: JobStarted } => "job" in o;

// Used only when the server sends no retry_after for this job kind.
const DEFAULT_RETRY_AFTER = 30;

const seconds = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

/** The server owns the poll schedule; its retry_after/max_wait fill the message. */
const jobStarted = (label: string, data: Raw | undefined, output_url: string): JobStarted => {
  const retry_after = seconds(data?.retry_after) ?? DEFAULT_RETRY_AFTER;
  const max_wait = seconds(data?.max_wait);
  const ceiling = max_wait ? ` Jobs like this can take up to ${Math.round(max_wait / 60)} min.` : "";
  return {
    status: "processing",
    ...(typeof data?.id === "string" ? { job_id: data.id } : {}),
    output_url,
    poll_with: "get_job_result",
    retry_after,
    ...(max_wait ? { max_wait } : {}),
    message: `${label} is processing in the background. Wait ${retry_after} s, then poll this output_url with an HTTP GET or with get_job_result; each reply gives the next wait in retry_after.${ceiling}`,
  };
};

const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

const failed = (body: Raw, label: string) => new Error(typeof body.message === "string" && body.message ? body.message : `${label} failed.`);

/**
 * Turn a raw (unpolled, snake_case) API body into a job handle or its finished payload.
 * `pollUrl` is the status URL already being polled; it stays the URL while the job runs.
 */
export function settle(body: unknown, label: string, pollUrl?: string): JobOutcome {
  if (!isRecord(body)) throw new Error(`${label}: VideoDB returned an unexpected response.`);
  // Rejections first: an upload can be refused with HTTP 200, an async job inside `response`.
  if (body.success === false) throw failed(body, label);
  const response = body.response;
  if (isRecord(response) && response.success === false) throw failed(response, label);

  const data = isRecord(body.data) ? body.data : undefined;
  if (PROCESSING.has(String(body.status).toLowerCase())) {
    const url = pollUrl ?? (typeof data?.output_url === "string" && data.output_url ? data.output_url : undefined);
    if (!url) throw new Error(`${label} is processing but VideoDB returned no URL to poll.`);
    return { job: jobStarted(label, data, url) };
  }

  // A finished /async-response body wraps the handler's own {success, data} under `response`.
  const result = "response" in body ? (isRecord(response) ? response.data : undefined) : body.data;
  if (!isRecord(result)) throw new Error(`${label} finished but VideoDB returned no result.`);
  return { data: result };
}

export async function startJob(vdb: Connection, path: string[], body: unknown, label: string): Promise<JobOutcome> {
  return settle(await vdb.vhttp.post(path, body, undefined, NO_POLL), label);
}

export async function fetchJob(vdb: Connection, outputUrl: string): Promise<JobOutcome> {
  return settle(await vdb.vhttp.get([outputUrl], undefined, NO_POLL), "Job", outputUrl);
}

export type JobRead =
  | JobStarted
  | { status: "done"; output_url: string; result: unknown }
  | { status: "failed"; output_url: string; message: string; error_code?: string };

const FAILED = new Set(["failed", "error"]);

/**
 * get_job_result's view of a job: any body VideoDB answers with is the job's state,
 * so a failed job is a successful read. Only the HTTP call itself can throw.
 */
export async function readJob(vdb: Connection, outputUrl: string): Promise<JobRead> {
  const body: unknown = await vdb.vhttp.get([outputUrl], undefined, NO_POLL);
  if (!isRecord(body)) return { status: "done", output_url: outputUrl, result: body ?? null };
  const response = body.response;
  const rejected = body.success === false ? body : isRecord(response) && response.success === false ? response : undefined;
  const status = String(body.status).toLowerCase();
  if (rejected || FAILED.has(status)) {
    const { message, error_code } = rejected ?? body;
    return {
      status: "failed",
      output_url: outputUrl,
      message: typeof message === "string" && message ? message : "VideoDB reported the job failed.",
      ...(typeof error_code === "string" ? { error_code } : {}),
    };
  }
  if (PROCESSING.has(status)) return jobStarted("Job", isRecord(body.data) ? body.data : undefined, outputUrl);
  const result = "response" in body ? (isRecord(response) ? response.data : response) : body.data;
  return { status: "done", output_url: outputUrl, result: isRecord(result) ? shapeResult(result) : (result ?? body) };
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
