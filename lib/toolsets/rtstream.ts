import { z } from "zod";
import { RTStreamIndex, RTStreamSceneIndex, RTStreamUnderstanding, type Connection } from "videodb";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID, RTSTREAM_ID, PAGE, PAGE_SIZE } from "@/lib/mcp/schemas";
import { pick, cap } from "@/lib/videodb/serialize";
import { collection } from "@/lib/videodb/resolve";

/**
 * Real-time streams (RTSP/live): connect, start/stop, live transcripts,
 * scene/audio indexes, alerts on events, search, v2 understand → index, export.
 * All rtstream timestamps are Unix seconds, not offsets into the stream.
 */

const RTSTREAM_KEYS = ["id", "name", "collection_id", "status", "sample_rate", "media_types", "channel_id", "stream_url", "player_url", "created_at"];
const SCENE_INDEX_KEYS = ["rtstream_index_id", "rtstream_id", "extraction_type", "extraction_config", "prompt", "name", "status"];
const UNDERSTANDING_KEYS = ["id", "rtstream_id", "status", "store", "segmentation", "analyzers", "outputs"];
const INDEX_KEYS = ["id", "rtstream_id", "name", "status", "use_for", "source_understanding_id", "output"];
const SHOT_KEYS = ["rtstream_id", "rtstream_name", "start", "end", "text", "search_score", "scene_index_id", "scene_index_name", "metadata"];
const MAX_LIST = 200;

// GET /rtstream/{id} is collection-agnostic, so per-stream tools need no collection_id.
const fetchRTStream = (vdb: Connection, id: string) => collection(vdb, "default").getRTStream(id);

// Index handles only need their ids for every method; skip the hydrating GET.
const sceneIndex = (vdb: Connection, rtstreamId: string, rtstreamIndexId: string) =>
  new RTStreamSceneIndex(vdb.vhttp, { rtstreamIndexId, rtstreamId });
const v2Index = (vdb: Connection, rtstreamId: string, indexId: string) => new RTStreamIndex(vdb.vhttp, { indexId, rtstreamId });
const understanding = (vdb: Connection, rtstreamId: string, understandingId: string) =>
  new RTStreamUnderstanding(vdb.vhttp, { understandingId, rtstreamId });

const capped = <T>(items: T[]) => cap(items, "items", MAX_LIST);

const UNIX_START = z.number().int().min(0).describe("Start time as a Unix timestamp in seconds.");
const UNIX_END = z.number().int().min(0).describe("End time as a Unix timestamp in seconds.");
const SCENE_INDEX_ID = z.string().describe("Scene index ID (rtstream_index_id from list_rtstream_scene_indexes).");
const ACTION = z.enum(["start", "stop"]).describe("start = begin/resume processing, stop = pause it.");
const INDEX_KIND = z
  .enum(["scene_index", "index"])
  .default("scene_index")
  .describe("scene_index = created by index_rtstream_scenes/index_rtstream_audio; index = created by create_rtstream_index.");

const alertTarget = (vdb: Connection, rtstream_id: string, index_id: string, kind: "scene_index" | "index") =>
  kind === "index" ? v2Index(vdb, rtstream_id, index_id) : sceneIndex(vdb, rtstream_id, index_id);

// ── streams ─────────────────────────────────────────────────────────────

const connectRTStream = defineTool({
  name: "connect_rtstream",
  title: "Connect a real-time stream",
  description:
    "Register a live RTSP/RTMP/HLS stream with VideoDB and start ingesting it. Returns the rtstream ID used by every other rtstream tool. Set store=true if you will later export the recording (export_rtstream_recording).",
  kind: "create",
  input: z.object({
    url: z.string().url().describe("Stream URL, e.g. rtsp://host:8554/cam1."),
    name: z.string().describe("Display name for the stream."),
    collection_id: COLLECTION_ID,
    media_types: z.array(z.enum(["video", "audio"])).min(1).default(["video"]).describe("Which tracks to capture."),
    sample_rate: z.number().int().min(1).optional().describe("Frame sampling rate; server default 30."),
    store: z.boolean().optional().describe("Keep the recording so it can be exported later. Default false."),
    enable_transcript: z.boolean().optional().describe("Start real-time transcription on connect."),
  }),
  retryWith: "list_rtstreams",
  handler: async ({ url, name, collection_id, media_types, sample_rate, store, enable_transcript }, vdb) => {
    const rt = await collection(vdb, collection_id).connectRTStream(url, name, media_types, sample_rate, store, enable_transcript);
    return pick(rt, RTSTREAM_KEYS);
  },
});

const listRTStreams = defineTool({
  name: "list_rtstreams",
  title: "List real-time streams",
  description: "List real-time streams in a collection with their IDs, names, status and media types. Filter by status or name; paginate with limit/offset.",
  kind: "read",
  input: z.object({
    collection_id: COLLECTION_ID,
    limit: z.number().int().min(1).max(200).default(10).describe("Max streams to return."),
    offset: z.number().int().min(0).default(0).describe("Number of streams to skip."),
    status: z.string().optional().describe("Filter by status, e.g. connected or stopped."),
    name: z.string().optional().describe("Filter by name."),
    ordering: z.string().optional().describe("Sort field, prefix with - for descending, e.g. -created_at."),
  }),
  handler: async ({ collection_id, limit, offset, status, name, ordering }, vdb) => {
    const streams = await collection(vdb, collection_id).listRTStreams({ limit, offset, status, name, ordering });
    return streams.map((s) => pick(s, RTSTREAM_KEYS));
  },
});

const getRTStream = defineTool({
  name: "get_rtstream",
  title: "Get real-time stream",
  description: "Get one real-time stream: name, status, sample rate, media types, creation time.",
  kind: "read",
  input: z.object({ rtstream_id: RTSTREAM_ID }),
  handler: async ({ rtstream_id }, vdb) => pick(await fetchRTStream(vdb, rtstream_id), RTSTREAM_KEYS),
});

const setRTStreamStatus = defineTool({
  name: "set_rtstream_status",
  title: "Start or stop a real-time stream",
  description: "Start (connect) or stop (disconnect) ingestion of a real-time stream. Indexes and transcripts only receive data while the stream is started.",
  kind: "update",
  input: z.object({ rtstream_id: RTSTREAM_ID, action: ACTION }),
  handler: async ({ rtstream_id, action }, vdb) => {
    const rt = await fetchRTStream(vdb, rtstream_id);
    await (action === "start" ? rt.start() : rt.stop());
    return { rtstream_id, status: rt.status };
  },
});

const getRTStreamStream = defineTool({
  name: "get_rtstream_stream",
  title: "Get playable segment of a stream",
  description:
    "Generate a playable stream and player URL for a time window of a real-time stream. start and end are Unix timestamps in seconds (e.g. the start/end of a search hit or scene record).",
  kind: "read",
  input: z.object({ rtstream_id: RTSTREAM_ID, start: UNIX_START, end: UNIX_END }),
  handler: async ({ rtstream_id, start, end }, vdb) => {
    const rt = await fetchRTStream(vdb, rtstream_id);
    await rt.generateStream(start, end);
    return { rtstream_id, start, end, stream_url: rt.streamUrl, player_url: rt.playerUrl };
  },
});

const exportRTStreamRecording = defineTool({
  name: "export_rtstream_recording",
  title: "Export stream recording",
  description:
    "Export the latest completed recording of a real-time stream as a regular VideoDB video (or audio) asset. Requires the stream to have been connected with store=true and to be stopped. Idempotent: repeated calls return the same asset.",
  kind: "create",
  input: z.object({ rtstream_id: RTSTREAM_ID, name: z.string().optional().describe('Asset name; default "<stream name> - Recording".') }),
  retryWith: "get_video",
  handler: async ({ rtstream_id, name }, vdb) => (await fetchRTStream(vdb, rtstream_id)).export(name),
});

// ── transcripts ─────────────────────────────────────────────────────────

const getRTStreamTranscript = defineTool({
  name: "get_rtstream_transcript",
  title: "Get live transcript",
  description:
    "Read the real-time transcript of a stream (requires transcription started via connect_rtstream enable_transcript or set_rtstream_transcript_status). Filter by Unix-second start/end, or pass since to poll for new segments only.",
  kind: "read",
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    page: PAGE,
    page_size: PAGE_SIZE,
    start: UNIX_START.optional(),
    end: UNIX_END.optional(),
    since: z.number().int().min(0).optional().describe("Only segments after this Unix timestamp (for polling)."),
  }),
  handler: async ({ rtstream_id, page, page_size, start, end, since }, vdb) =>
    (await fetchRTStream(vdb, rtstream_id)).getTranscript({ page, pageSize: page_size, start, end, since }),
});

const setRTStreamTranscriptStatus = defineTool({
  name: "set_rtstream_transcript_status",
  title: "Start or stop live transcription",
  description: "Start or stop real-time transcription on a stream. The stream must be started and capturing audio. Returns the transcription status with start/end times.",
  kind: "update",
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    action: ACTION,
    mode: z.enum(["graceful", "force"]).default("graceful").describe("Stop mode (ignored on start): graceful finishes in-flight audio, force stops immediately."),
    engine: z.string().optional().describe("Transcription engine; server default assemblyai."),
  }),
  handler: async ({ rtstream_id, action, mode, engine }, vdb) => {
    const rt = await fetchRTStream(vdb, rtstream_id);
    return action === "start" ? rt.startTranscript(undefined, engine) : rt.stopTranscript(mode, engine);
  },
});

// ── scene indexes (v1) ──────────────────────────────────────────────────

const indexRTStreamScenes = defineTool({
  name: "index_rtstream_scenes",
  title: "Index stream visuals",
  description:
    "Start a continuous visual (scene) index on a real-time stream: every window_seconds, frame_count frames are described with the prompt. Returns the scene index; read results with get_rtstream_scenes, search with search_rtstream.",
  kind: "create",
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    prompt: z.string().optional().describe("What to describe or watch for in each window."),
    window_seconds: z.number().min(1).optional().describe("Length of each window in seconds; server default applies if omitted."),
    frame_count: z.number().int().min(1).optional().describe("Frames sampled per window (default 5)."),
    model_name: z.string().optional().describe("Vision model name; server default if omitted."),
    name: z.string().optional().describe("Index name."),
  }),
  retryWith: "list_rtstream_scene_indexes",
  handler: async ({ rtstream_id, prompt, window_seconds, frame_count, model_name, name }, vdb) => {
    const rt = await fetchRTStream(vdb, rtstream_id);
    const idx = await rt.indexVisuals({
      // frame_count only reaches the wire inside extractionConfig, which the SDK builds only when batchConfig is set.
      batchConfig:
        window_seconds !== undefined || frame_count !== undefined
          ? { type: "time", value: window_seconds ?? 2, frameCount: frame_count }
          : undefined,
      prompt,
      modelName: model_name,
      name,
    });
    return idx ? pick(idx, SCENE_INDEX_KEYS) : { rtstream_id, created: false };
  },
});

const indexRTStreamAudio = defineTool({
  name: "index_rtstream_audio",
  title: "Index stream audio",
  description:
    "Start a continuous spoken-word index on a real-time stream: the live transcript is chunked by segmenter/segment_value and summarised with the prompt. Requires audio in media_types; transcription auto-starts unless auto_start_transcript=false.",
  kind: "create",
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    prompt: z.string().optional().describe("How to summarise each transcript segment."),
    segmenter: z.enum(["word", "sentence", "time"]).optional().describe("How to chunk the transcript."),
    segment_value: z.number().min(1).optional().describe("Chunk size: words, sentences, or seconds depending on segmenter."),
    model_name: z.string().optional().describe("Model name; server default if omitted."),
    name: z.string().optional().describe("Index name."),
    auto_start_transcript: z.boolean().default(true).describe("Start transcription if it is not running."),
  }),
  retryWith: "list_rtstream_scene_indexes",
  handler: async ({ rtstream_id, prompt, segmenter, segment_value, model_name, name, auto_start_transcript }, vdb) => {
    const rt = await fetchRTStream(vdb, rtstream_id);
    const idx = await rt.indexAudio({
      // Either field alone must still reach the wire; the SDK drops both when batchConfig is unset.
      batchConfig:
        segmenter || segment_value !== undefined
          ? { type: segmenter ?? "word", value: segment_value ?? 10 }
          : undefined,
      prompt,
      modelName: model_name,
      name,
      autoStartTranscript: auto_start_transcript,
    });
    return idx ? pick(idx, SCENE_INDEX_KEYS) : { rtstream_id, created: false };
  },
});

const listRTStreamSceneIndexes = defineTool({
  name: "list_rtstream_scene_indexes",
  title: "List stream scene indexes",
  description: "List the scene (visual and audio) indexes on a real-time stream with their IDs, prompts and status.",
  kind: "read",
  input: z.object({ rtstream_id: RTSTREAM_ID }),
  handler: async ({ rtstream_id }, vdb) => (await fetchRTStream(vdb, rtstream_id)).listSceneIndexes().then((xs) => xs.map((x) => pick(x, SCENE_INDEX_KEYS))),
});

const getRTStreamScenes = defineTool({
  name: "get_rtstream_scenes",
  title: "Get indexed scenes",
  description: "Read the records a scene index has produced so far (Unix-second start/end plus description). Filter to a time window with start and end together; paginate with page/page_size.",
  kind: "read",
  input: z.object({ rtstream_id: RTSTREAM_ID, scene_index_id: SCENE_INDEX_ID, start: UNIX_START.optional(), end: UNIX_END.optional(), page: PAGE, page_size: PAGE_SIZE }),
  handler: async ({ rtstream_id, scene_index_id, start, end, page, page_size }, vdb) => {
    const res = await sceneIndex(vdb, rtstream_id, scene_index_id).getScenes(start, end, page, page_size);
    return { rtstream_id, scene_index_id, scenes: res?.scenes ?? [], next_page: res?.nextPage ?? false };
  },
});

const setRTStreamSceneIndexStatus = defineTool({
  name: "set_rtstream_scene_index_status",
  title: "Start or stop a scene index",
  description: "Resume or pause a scene index on a real-time stream. Existing records stay readable while paused.",
  kind: "update",
  input: z.object({ rtstream_id: RTSTREAM_ID, scene_index_id: SCENE_INDEX_ID, action: ACTION }),
  handler: async ({ rtstream_id, scene_index_id, action }, vdb) => {
    const idx = sceneIndex(vdb, rtstream_id, scene_index_id);
    await (action === "start" ? idx.start() : idx.stop());
    return { rtstream_id, scene_index_id, status: idx.status };
  },
});

const searchRTStream = defineTool({
  name: "search_rtstream",
  title: "Search a real-time stream",
  description:
    "Semantic search over the indexed records of a real-time stream (requires a scene index or index). Returns matching windows with Unix-second start/end, text and score; use get_rtstream_stream with those timestamps to watch one.",
  kind: "read",
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    query: z.string().describe("Natural-language query, e.g. 'a person entering through the gate'."),
    index_type: z.string().optional().describe("Restrict to an index type, e.g. scene."),
    scene_index_id: z.string().optional().describe("Restrict to one scene index."),
    result_threshold: z.number().int().min(1).max(100).optional().describe("Max results."),
    score_threshold: z.number().min(0).max(1).optional().describe("Minimum relevance score."),
  }),
  handler: async ({ rtstream_id, query, index_type, scene_index_id, result_threshold, score_threshold }, vdb) => {
    const rt = await fetchRTStream(vdb, rtstream_id);
    const res = await rt.search({ query, indexType: index_type, indexId: scene_index_id, resultThreshold: result_threshold, scoreThreshold: score_threshold });
    return { shots: res.shots.map((s) => pick(s, SHOT_KEYS)) };
  },
});

// ── events & alerts ─────────────────────────────────────────────────────

const createEvent = defineTool({
  name: "create_event",
  title: "Create an event",
  description: "Define a reusable event (a natural-language condition such as 'a person enters the restricted area') that alerts can watch for on any stream index. Returns the event ID.",
  kind: "create",
  input: z.object({
    event_prompt: z.string().describe("Condition to detect, in natural language."),
    label: z.string().describe("Short machine-friendly label, e.g. intrusion."),
  }),
  retryWith: "list_events",
  handler: async ({ event_prompt, label }, vdb) => ({ event_id: await vdb.createEvent(event_prompt, label), label }),
});

const listEvents = defineTool({
  name: "list_events",
  title: "List events",
  description: "List the events defined on this account (ID, label, prompt).",
  kind: "read",
  input: z.object({}),
  handler: async (_args, vdb) => {
    const { items, ...rest } = capped(await vdb.listEvents());
    return { events: items, ...rest };
  },
});

const createRTStreamAlert = defineTool({
  name: "create_rtstream_alert",
  title: "Create an alert",
  description:
    "Attach an event (from create_event) to a stream index so VideoDB POSTs to callback_url each time the event is detected in a new window. Requires a running scene index or index. Returns the alert ID.",
  kind: "create",
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    index_id: z.string().describe("Scene index ID or index ID to watch."),
    index_kind: INDEX_KIND,
    event_id: z.string().describe("Event ID from create_event."),
    callback_url: z.string().url().describe("Webhook that receives each alert."),
  }),
  retryWith: "list_rtstream_alerts",
  handler: async ({ rtstream_id, index_id, index_kind, event_id, callback_url }, vdb) => ({
    alert_id: await alertTarget(vdb, rtstream_id, index_id, index_kind).createAlert(event_id, callback_url),
    rtstream_id,
    index_id,
    event_id,
  }),
});

const listRTStreamAlerts = defineTool({
  name: "list_rtstream_alerts",
  title: "List alerts",
  description: "List the alerts attached to a stream index, with their event, callback and enabled state.",
  kind: "read",
  input: z.object({ rtstream_id: RTSTREAM_ID, index_id: z.string().describe("Scene index ID or index ID."), index_kind: INDEX_KIND }),
  handler: async ({ rtstream_id, index_id, index_kind }, vdb) => {
    const { items, ...rest } = capped(await alertTarget(vdb, rtstream_id, index_id, index_kind).listAlerts());
    return { rtstream_id, index_id, alerts: items, ...rest };
  },
});

const setRTStreamAlertStatus = defineTool({
  name: "set_rtstream_alert_status",
  title: "Enable or disable an alert",
  description: "Enable or disable an alert on a stream index without deleting it.",
  kind: "update",
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    index_id: z.string().describe("Scene index ID or index ID the alert belongs to."),
    index_kind: INDEX_KIND,
    alert_id: z.string().describe("Alert ID from create_rtstream_alert or list_rtstream_alerts."),
    action: z.enum(["enable", "disable"]),
  }),
  handler: async ({ rtstream_id, index_id, index_kind, alert_id, action }, vdb) => {
    const target = alertTarget(vdb, rtstream_id, index_id, index_kind);
    await (action === "enable" ? target.enableAlert(alert_id) : target.disableAlert(alert_id));
    return { rtstream_id, index_id, alert_id, enabled: action === "enable" };
  },
});

// ── understand → index (v2) ─────────────────────────────────────────────

const understandRTStream = defineTool({
  name: "understand_rtstream",
  title: "Understand a stream continuously",
  description:
    "Start a continuous vision-model (vlm) analysis on a real-time stream: every window_seconds, frame_count frames are analysed with the prompt and the output is stored under output_name. Returns the understanding with its outputs; pass its ID to create_rtstream_index to make the output searchable.",
  kind: "create",
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    prompt: z.string().describe("What to describe or monitor in each window."),
    window_seconds: z.number().int().min(1).default(5).describe("Length of each analysis window in seconds."),
    frame_count: z.number().int().min(1).default(2).describe("Frames sampled per window."),
    output_name: z.string().default("scene").describe("Name of the analyzer output (used as index source)."),
    store: z.boolean().default(true).describe("Persist output so it can be indexed. Must be true to index."),
  }),
  retryWith: "list_rtstream_understandings",
  handler: async ({ rtstream_id, prompt, window_seconds, frame_count, output_name, store }, vdb) => {
    const rt = await fetchRTStream(vdb, rtstream_id);
    const u = await rt.understand({
      segmentation: { type: "time", window: `${window_seconds}s` },
      analyzers: [{ type: "vlm", name: output_name, sampling: { frame_count }, config: { prompt } }],
      store,
    });
    return u ? pick(u, UNDERSTANDING_KEYS) : { rtstream_id, created: false };
  },
});

const listRTStreamUnderstandings = defineTool({
  name: "list_rtstream_understandings",
  title: "List stream understandings",
  description: "List the continuous understanding jobs on a real-time stream with their status, segmentation, analyzers and output descriptors.",
  kind: "read",
  input: z.object({ rtstream_id: RTSTREAM_ID }),
  handler: async ({ rtstream_id }, vdb) => (await fetchRTStream(vdb, rtstream_id)).listUnderstanding().then((xs) => xs.map((x) => pick(x, UNDERSTANDING_KEYS))),
});

const setRTStreamUnderstandingStatus = defineTool({
  name: "set_rtstream_understanding_status",
  title: "Start or stop an understanding",
  description: "Resume or pause a continuous understanding job on a real-time stream. Existing records stay readable while paused.",
  kind: "update",
  input: z.object({ rtstream_id: RTSTREAM_ID, understanding_id: z.string().describe("Understanding ID (und-…)."), action: ACTION }),
  handler: async ({ rtstream_id, understanding_id, action }, vdb) => {
    const u = understanding(vdb, rtstream_id, understanding_id);
    await (action === "start" ? u.start() : u.stop());
    return { rtstream_id, understanding_id, status: u.status };
  },
});

const getRTStreamUnderstandingRecords = defineTool({
  name: "get_rtstream_understanding_records",
  title: "Get understanding records",
  description: "Read the analysis records an understanding produced for a Unix-second time range (start and end required). Paginated.",
  kind: "read",
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    understanding_id: z.string().describe("Understanding ID (und-…)."),
    start: UNIX_START,
    end: UNIX_END,
    output: z.string().default("scene").describe("Analyzer output name (output_name given to understand_rtstream)."),
    page: PAGE,
    page_size: PAGE_SIZE,
  }),
  handler: async ({ rtstream_id, understanding_id, start, end, output, page, page_size }, vdb) =>
    understanding(vdb, rtstream_id, understanding_id).getRecords(start, end, output, page, page_size),
});

const createRTStreamIndex = defineTool({
  name: "create_rtstream_index",
  title: "Index an understanding output",
  description:
    "Materialise an understanding output into a continuously updated searchable index (requires understand_rtstream with store=true). Returns the index; search it with search_rtstream and attach alerts with create_rtstream_alert (index_kind=index).",
  kind: "create",
  input: z.object({
    rtstream_id: RTSTREAM_ID,
    understanding_id: z.string().describe("Understanding ID from understand_rtstream."),
    output: z.string().default("scene").describe("Which analyzer output of the understanding to index."),
    name: z.string().optional().describe("Index name."),
    use_for: z.array(z.string()).optional().describe('Index capabilities; server default ["semantic"].'),
  }),
  retryWith: "list_rtstream_indexes",
  handler: async ({ rtstream_id, understanding_id, output, name, use_for }, vdb) => {
    const rt = await fetchRTStream(vdb, rtstream_id);
    const u = await rt.getUnderstanding(understanding_id);
    const source = u?.outputs?.[output] as Record<string, unknown> | undefined;
    if (!source) throw new Error(`Understanding ${understanding_id} has no output "${output}". Available: ${Object.keys(u?.outputs ?? {}).join(", ") || "none"}.`);
    const idx = await rt.index({ source, name, useFor: use_for });
    return idx ? pick(idx, INDEX_KEYS) : { rtstream_id, created: false };
  },
});

const listRTStreamIndexes = defineTool({
  name: "list_rtstream_indexes",
  title: "List stream indexes",
  description: "List the understanding-backed indexes on a real-time stream with their status, source understanding and capabilities.",
  kind: "read",
  input: z.object({ rtstream_id: RTSTREAM_ID }),
  handler: async ({ rtstream_id }, vdb) => (await fetchRTStream(vdb, rtstream_id)).listIndexes().then((xs) => xs.map((x) => pick(x, INDEX_KEYS))),
});

const setRTStreamIndexStatus = defineTool({
  name: "set_rtstream_index_status",
  title: "Start or stop an index",
  description: "Resume or pause an understanding-backed index on a real-time stream. Existing records stay searchable while paused.",
  kind: "update",
  input: z.object({ rtstream_id: RTSTREAM_ID, index_id: z.string().describe("Index ID (idx-…)."), action: ACTION }),
  handler: async ({ rtstream_id, index_id, action }, vdb) => {
    const idx = v2Index(vdb, rtstream_id, index_id);
    await (action === "start" ? idx.start() : idx.stop());
    return { rtstream_id, index_id, status: idx.status };
  },
});

const getRTStreamIndexRecords = defineTool({
  name: "get_rtstream_index_records",
  title: "Get index records",
  description: "Read the records materialised into an understanding-backed index, optionally limited to a Unix-second start/end window. Paginated.",
  kind: "read",
  input: z.object({ rtstream_id: RTSTREAM_ID, index_id: z.string().describe("Index ID (idx-…)."), start: UNIX_START.optional(), end: UNIX_END.optional(), page: PAGE, page_size: PAGE_SIZE }),
  handler: async ({ rtstream_id, index_id, start, end, page, page_size }, vdb) => v2Index(vdb, rtstream_id, index_id).getRecords(start, end, page, page_size),
});

export const rtstream: Toolset = {
  name: "rtstream",
  description: "Real-time streams (RTSP/live): connect, index live, alerts, search, export.",
  defaultEnabled: false,
  tools: [
    connectRTStream,
    listRTStreams,
    getRTStream,
    setRTStreamStatus,
    getRTStreamStream,
    exportRTStreamRecording,
    getRTStreamTranscript,
    setRTStreamTranscriptStatus,
    indexRTStreamScenes,
    indexRTStreamAudio,
    listRTStreamSceneIndexes,
    getRTStreamScenes,
    setRTStreamSceneIndexStatus,
    searchRTStream,
    createEvent,
    listEvents,
    createRTStreamAlert,
    listRTStreamAlerts,
    setRTStreamAlertStatus,
    understandRTStream,
    listRTStreamUnderstandings,
    setRTStreamUnderstandingStatus,
    getRTStreamUnderstandingRecords,
    createRTStreamIndex,
    listRTStreamIndexes,
    setRTStreamIndexStatus,
    getRTStreamIndexRecords,
  ],
};
