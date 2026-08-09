/**
 * Minimal VideoDB REST client (no SDK dependency).
 *
 * Wire protocol notes (mirrors the official SDKs, videodb-python 0.5.x /
 * videodb-node 0.3.x):
 *   - Base URL https://api.videodb.io, auth header `x-access-token`.
 *   - Every response is enveloped: { success, message?, data }.
 *   - Long-running operations return { status: "processing", request_type:
 *     "sync", data: { output_url } } — the client polls `output_url` (same
 *     auth) until status is no longer "processing"/"in progress".
 */

const BASE = () => process.env.VIDEODB_API_BASE || "https://api.videodb.io";

const POLL_INTERVAL_MS = 4000;
const DEFAULT_MAX_WAIT_MS = 240_000; // stay under the route's maxDuration

export class VideoDBError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "VideoDBError";
    this.status = status;
  }
}

export class ProcessingTimeout extends Error {
  constructor(what: string) {
    super(
      `${what} is still processing on VideoDB's side after ${Math.round(
        DEFAULT_MAX_WAIT_MS / 1000
      )}s. The job continues in the background — retry this tool (or the corresponding read tool) in a few minutes to get the result.`
    );
    this.name = "ProcessingTimeout";
  }
}

interface Envelope {
  success?: boolean;
  message?: string;
  status?: string;
  request_type?: string;
  data?: any;
  response?: Envelope;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function request(
  apiKey: string,
  method: string,
  path: string,
  opts: {
    body?: unknown;
    query?: Record<string, string | number | boolean | undefined>;
    label?: string;
    maxWaitMs?: number;
  } = {}
): Promise<any> {
  const url = new URL(path.startsWith("http") ? path : `${BASE()}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    method,
    headers: {
      "x-access-token": apiKey,
      "Content-Type": "application/json",
      "x-videodb-client": "videodb-mcp/1.0.0",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let json: Envelope;
  try {
    json = (await res.json()) as Envelope;
  } catch {
    throw new VideoDBError(`VideoDB API returned a non-JSON response (HTTP ${res.status})`, res.status);
  }

  if (res.status === 401) {
    throw new VideoDBError("Invalid VideoDB API key (401). Reconnect the VideoDB connector.", 401);
  }
  if (!res.ok && json?.success !== true) {
    throw new VideoDBError(json?.message || `VideoDB API error (HTTP ${res.status})`, res.status);
  }

  // Long-running sync flow: poll output_url until done.
  if (json?.status === "processing" && json?.data?.output_url) {
    return pollOutput(apiKey, json.data.output_url, opts.label ?? "This operation", opts.maxWaitMs);
  }

  if (json?.success === false) {
    throw new VideoDBError(json?.message || "VideoDB API request failed");
  }
  return json?.data ?? null;
}

async function pollOutput(
  apiKey: string,
  outputUrl: string,
  label: string,
  maxWaitMs = DEFAULT_MAX_WAIT_MS
): Promise<any> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(outputUrl, {
      headers: { "x-access-token": apiKey, "Content-Type": "application/json" },
    });
    let json: Envelope;
    try {
      json = (await res.json()) as Envelope;
    } catch {
      continue; // transient — keep polling
    }
    const body = json?.response ?? json;
    const status = body?.status;
    if (status === "processing" || status === "in progress") continue;
    if (body?.success === false) {
      throw new VideoDBError(body?.message || `${label} failed`);
    }
    return body?.data ?? null;
  }
  throw new ProcessingTimeout(label);
}

// ---------------- typed operations ----------------

export async function validateApiKey(
  apiKey: string
): Promise<{ valid: boolean; email?: string; error?: string }> {
  try {
    const data = await request(apiKey, "GET", "/user");
    return { valid: true, email: data?.user_email };
  } catch (e) {
    if (e instanceof VideoDBError && e.status === 401) {
      return { valid: false, error: "That API key was rejected by VideoDB." };
    }
    return { valid: false, error: "Could not reach the VideoDB API to verify the key. Try again." };
  }
}

export const listCollections = (key: string) =>
  request(key, "GET", "/collection").then((d) => d?.collections ?? d);

export const createCollection = (key: string, name: string, description?: string) =>
  request(key, "POST", "/collection", { body: { name, description: description ?? "" } });

export const listVideos = (key: string, collectionId: string) =>
  request(key, "GET", "/video", { query: { collection_id: collectionId } }).then(
    (d) => d?.videos ?? d
  );

export const getVideo = (key: string, videoId: string, collectionId?: string) =>
  request(key, "GET", `/video/${videoId}`, { query: { collection_id: collectionId } });

export const deleteVideo = (key: string, videoId: string, collectionId?: string) =>
  request(key, "DELETE", `/video/${videoId}`, { query: { collection_id: collectionId } });

export const uploadMedia = (
  key: string,
  collectionId: string,
  url: string,
  opts: { name?: string; description?: string; media_type?: string } = {}
) =>
  request(key, "POST", `/collection/${collectionId}/upload`, {
    body: { url, ...opts },
    label: "Upload",
  });

export const indexSpokenWords = (key: string, videoId: string, languageCode?: string) =>
  request(key, "POST", `/video/${videoId}/index`, {
    body: { index_type: "spoken_word", ...(languageCode ? { language_code: languageCode } : {}) },
    label: "Spoken-word indexing",
  });

export const indexScenes = (
  key: string,
  videoId: string,
  opts: { prompt?: string; name?: string } = {}
) =>
  request(key, "POST", `/video/${videoId}/index/scene`, {
    body: {
      extraction_type: "shot",
      extraction_config: { threshold: 20, frame_count: 1 },
      ...(opts.prompt ? { prompt: opts.prompt } : {}),
      ...(opts.name ? { name: opts.name } : {}),
    },
    label: "Scene indexing",
  });

export const listSceneIndexes = (key: string, videoId: string, collectionId?: string) =>
  request(key, "GET", `/video/${videoId}/index/scene`, {
    query: { collection_id: collectionId },
  }).then((d) => d?.scene_indexes ?? d);

export interface SearchOptions {
  searchType?: "semantic" | "keyword";
  indexType?: "spoken_word" | "scene";
  resultThreshold?: number;
  scoreThreshold?: number;
}

function searchBody(query: string, o: SearchOptions) {
  return {
    query,
    search_type: o.searchType ?? "semantic",
    index_type: o.indexType ?? "spoken_word",
    result_threshold: o.resultThreshold ?? 5,
    score_threshold: o.scoreThreshold ?? 0.2,
  };
}

/** Trim search results to the fields an agent needs. */
function trimSearchResults(data: any) {
  const results = (data?.results ?? []).map((r: any) => ({
    video_id: r.video_id,
    title: r.title,
    length_seconds: r.length,
    matches: (r.docs ?? []).map((doc: any) => ({
      start: doc.start,
      end: doc.end,
      text: doc.text,
      score: doc.score,
      ...(doc.stream_url || doc.stream_link ? { stream_url: doc.stream_url ?? doc.stream_link } : {}),
      ...(doc.player_url ? { player_url: doc.player_url } : {}),
    })),
  }));
  return { results, ...(data?.warnings ? { warnings: data.warnings } : {}) };
}

export const searchVideo = (key: string, videoId: string, query: string, o: SearchOptions = {}) =>
  request(key, "POST", `/video/${videoId}/search`, { body: searchBody(query, o) }).then(
    trimSearchResults
  );

export const searchCollection = (
  key: string,
  collectionId: string,
  query: string,
  o: SearchOptions = {}
) =>
  request(key, "POST", `/collection/${collectionId}/search`, {
    body: { ...searchBody(query, o), search_type: "semantic" },
  }).then(trimSearchResults);

export const getTranscript = (key: string, videoId: string, timestamped: boolean) =>
  request(key, "GET", `/video/${videoId}/transcription`, {
    query: { segmenter: "word", length: 1 },
    label: "Transcript generation",
  }).then((d) => (timestamped ? d : { text: d?.text ?? d }));

export const playerUrlForStream = (streamUrl: string) =>
  `https://console.videodb.io/player?url=${encodeURIComponent(streamUrl)}`;

function withPlayerUrl(d: any) {
  if (d?.stream_url && !d?.player_url) {
    return { ...d, player_url: playerUrlForStream(d.stream_url) };
  }
  return d;
}

export async function generateStream(
  key: string,
  videoId: string,
  timeline?: [number, number][],
  collectionId?: string
) {
  const video = await getVideo(key, videoId, collectionId);
  const data = await request(key, "POST", `/video/${videoId}/stream`, {
    body: { timeline: timeline ?? null, length: video?.length },
    label: "Stream generation",
  });
  return withPlayerUrl(data);
}

export const compileClips = (
  key: string,
  clips: { video_id: string; collection_id: string; shots: [number, number][] }[]
) => request(key, "POST", "/compile", { body: clips, label: "Compilation" }).then(withPlayerUrl);

const SUBTITLE_STYLE_DEFAULTS = {
  font_name: "Arial",
  font_size: 18,
  primary_colour: "&H00FFFFFF",
  secondary_colour: "&H000000FF",
  outline_colour: "&H00000000",
  back_colour: "&H00000000",
  bold: false,
  italic: false,
  underline: false,
  strike_out: false,
  scale_x: 1.0,
  scale_y: 1.0,
  spacing: 0,
  angle: 0,
  border_style: 4,
  outline: 1.0,
  shadow: 0.0,
  alignment: 2,
  margin_l: 10,
  margin_r: 10,
  margin_v: 10,
};

export const addSubtitles = (
  key: string,
  videoId: string,
  style: Partial<typeof SUBTITLE_STYLE_DEFAULTS> = {}
) =>
  request(key, "POST", `/video/${videoId}/workflow`, {
    body: { type: "add_subtitles", subtitle_style: { ...SUBTITLE_STYLE_DEFAULTS, ...style } },
    label: "Subtitle rendering",
  }).then(withPlayerUrl);

export const generateThumbnail = (key: string, videoId: string, timeSeconds?: number) =>
  timeSeconds === undefined
    ? request(key, "GET", `/video/${videoId}/thumbnail`)
    : request(key, "POST", `/video/${videoId}/thumbnail`, {
        body: { time: timeSeconds },
        label: "Thumbnail generation",
      });
