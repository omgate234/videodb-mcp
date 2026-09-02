import { z } from "zod";
import { Index, Understanding } from "videodb";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { CALLBACK_URL, COLLECTION_ID, VIDEO_ID } from "@/lib/mcp/schemas";
import { fetchVideo } from "@/lib/videodb/resolve";
import { pick } from "@/lib/videodb/serialize";

/**
 * Indexing. Legacy (v1): spoken-word + scene indexes consumed by search_video /
 * search_collection. v2: understand (extract) → create_index (make retrievable)
 * consumed by semantic_search / query_index / aggregate_index / ask_*.
 */

const V2_FLOW = "v2 pipeline: understand_video (extract) → create_index (make retrievable) → semantic_search / query_index / aggregate_index / ask_video.";
const RECORD_CAP = 200;

const INDEX_KEYS = ["index_id", "name", "status", "error", "use_for", "record_count", "fields", "field_schema"];
const RECORD_KEYS = ["video_id", "understanding_id", "scene_id", "start", "end", "data"];

const ANALYZER_TYPES = ["speech_transcription", "spoken_words", "vlm", "ocr", "object_detection", "brand_detection", "activity_recognition", "location_detection"] as const;
const USE_FOR = z.enum(["semantic", "query", "aggregate"]);
const FIELD_CAP = z.enum(["semantic", "fts", "filter", "aggregate", "sort"]);

const UNDERSTANDING_ID = z.string().describe("Understanding run ID (from understand_video / list_understandings).");
const INDEX_ID = z.string().describe("Index ID (from create_index / list_indexes).");
const ANALYZER_REF = {
  analyzer_name: z.string().optional().describe("Analyzer name inside the run, e.g. 'transcript', 'scene', 'objects'. Give this or analyzer_id."),
  analyzer_id: z.string().optional().describe("Analyzer ID (an_...). Give this or analyzer_name."),
};

const analyzerRef = (name?: string, id?: string): string => {
  const ref = name ?? id;
  if (!ref) throw new Error("Provide analyzer_name or analyzer_id.");
  return ref;
};

// Analyzers hold a back-reference to their Understanding; flatten explicitly.
const understandingToPlain = (u: Understanding) => ({
  id: u.id,
  video_id: u.videoId,
  status: u.status,
  analyzers: u.analyzers.map((a) => ({ id: a.id, name: a.name, type: a.type, status: a.status })),
});

// Understanding/Index shells need only ids — no GET /video round-trip.
const understandingShell = (vdb: Parameters<typeof fetchVideo>[0], collectionId: string, videoId: string, id: string) =>
  new Understanding(vdb.vhttp, videoId, { id, collectionId });
const indexShell = (vdb: Parameters<typeof fetchVideo>[0], collectionId: string, videoId: string, indexId: string) =>
  new Index(vdb.vhttp, videoId, collectionId, { index_id: indexId });

/** Cap a raw list, or every top-level list inside a raw object, to RECORD_CAP items. */
function capRecords(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return value.length > RECORD_CAP ? { records: value.slice(0, RECORD_CAP), truncated: true, total: value.length } : { records: value };
  }
  if (!value || typeof value !== "object") return { output: value };
  let truncated = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length > RECORD_CAP) {
      out[k] = v.slice(0, RECORD_CAP);
      out[`${k}_total`] = v.length;
      truncated = true;
    } else out[k] = v;
  }
  return truncated ? { ...out, truncated: true } : out;
}

const indexSpokenWords = defineTool({
  name: "index_spoken_words",
  title: "Index spoken words",
  description:
    "Transcribe and index everything spoken in a video so it becomes searchable with search_video / search_collection (legacy v1 index). Run once per video; takes roughly real-time ÷ 10. With callback_url the call returns immediately.",
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    language_code: z.string().optional().describe("Optional language hint, e.g. 'en', 'hi', 'es'."),
    force: z.boolean().default(false).describe("Re-index even if an index already exists."),
    segmentation_type: z.enum(["sentence", "llm"]).optional().describe("How the transcript is chunked for indexing: 'sentence' (default) or 'llm' (topic-aware chunks)."),
    callback_url: CALLBACK_URL,
  }),
  retryWith: "search_video",
  handler: async ({ video_id, collection_id, language_code, force, segmentation_type, callback_url }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    await v.indexSpokenWords(language_code, segmentation_type, force, callback_url);
    if (callback_url) return { accepted: true, video_id, index_type: "spoken_word" };
    return { indexed: true, video_id, index_type: "spoken_word" };
  },
});

const indexScenes = defineTool({
  name: "index_scenes",
  title: "Index scenes (visual)",
  description:
    "Visually index a video (legacy v1 scene index): samples frames per shot or per time window and describes what's on screen so visual moments become searchable (search_video with index_type='scene'). Optionally steer descriptions with a prompt, e.g. 'focus on products shown'. With callback_url the call returns immediately.",
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    prompt: z.string().optional().describe("Instruction for how to describe scenes."),
    name: z.string().optional().describe("Name for this scene index."),
    batch_type: z.enum(["shot", "time"]).default("shot").describe("Split by detected shots or fixed time windows."),
    batch_value: z.number().positive().optional().describe("Shot threshold (default 20) or window seconds (default 10)."),
    frame_count: z.number().int().min(1).max(10).default(1).describe("Frames sampled per scene."),
    model_name: z.string().optional().describe("Vision model tier or name used to describe scenes, e.g. 'basic', 'pro', 'ultra'. Omit for the default."),
    callback_url: CALLBACK_URL,
  }),
  retryWith: "list_scene_indexes",
  handler: async ({ video_id, collection_id, prompt, name, batch_type, batch_value, frame_count, model_name, callback_url }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    const scene_index_id = await v.indexVisuals({
      prompt,
      name,
      batchConfig: { type: batch_type, value: batch_value, frameCount: frame_count },
      modelName: model_name,
      callbackUrl: callback_url,
    });
    if (callback_url) return { accepted: true, scene_index_id, video_id };
    return { scene_index_id, video_id };
  },
});

const listSceneIndexes = defineTool({
  name: "list_scene_indexes",
  title: "List scene indexes",
  description: "List the visual (scene) indexes that exist for a video, including their IDs, names and status. Useful before a scene search.",
  kind: "read",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID }),
  handler: async ({ video_id, collection_id }, vdb) => (await fetchVideo(vdb, collection_id, video_id)).listSceneIndex(),
});

const getSceneIndex = defineTool({
  name: "get_scene_index",
  title: "Get scene index records",
  description:
    "Return the per-scene records (start, end, description) of one visual scene index created by index_scenes. Output is capped at 200 scenes.",
  kind: "read",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    scene_index_id: z.string().describe("Scene index ID (from index_scenes / list_scene_indexes)."),
  }),
  handler: async ({ video_id, collection_id, scene_index_id }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    const scenes = await v.getSceneIndex(scene_index_id);
    return { scene_index_id, video_id, ...capRecords({ scenes }) };
  },
});

const deleteSceneIndex = defineTool({
  name: "delete_scene_index",
  title: "Delete scene index",
  description: "Permanently delete one visual scene index of a video (the video itself is kept). This cannot be undone.",
  kind: "destructive",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    scene_index_id: z.string().describe("Scene index ID to delete."),
  }),
  handler: async ({ video_id, collection_id, scene_index_id }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    await v.deleteSceneIndex(scene_index_id);
    return { deleted: true, scene_index_id, video_id };
  },
});

const ANALYZER = z
  .looseObject({
    type: z
      .string()
      .describe(`Analyzer type: ${ANALYZER_TYPES.join(", ")} (spoken_words is an alias of speech_transcription). Default output names: transcript, scene, text, objects, brands, activity, location.`),
    name: z.string().optional().describe("Output name for this analyzer; needed when running two analyzers of the same type."),
  })
  .describe("Analyzer spec. Extra keys (e.g. prompt, model, language, labels, config, inputs) are passed through as analyzer configuration.");

const understandVideo = defineTool({
  name: "understand_video",
  title: "Understand video (run analyzers)",
  description:
    `Run one or more analyzers over a video to extract artifacts (transcript, scene descriptions, on-screen text, objects, brands, activities, locations). Returns the understanding run with its analyzers; artifacts are not searchable until create_index is run on them. ${V2_FLOW} With callback_url the call returns immediately.`,
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    analyzers: z.array(ANALYZER).min(1).describe("Analyzers to run, e.g. [{type:'spoken_words'}, {type:'vlm', prompt:'Describe the scene'}]."),
    segmentation: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("How the video is split into scenes for visual analyzers: {type:'time', seconds:5} or {type:'shot', threshold:30}."),
    callback_url: CALLBACK_URL,
  }),
  retryWith: "get_understanding",
  handler: async ({ video_id, collection_id, analyzers, segmentation, callback_url }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    const u = await v.understand(analyzers, { segmentation, callbackUrl: callback_url });
    const plain = understandingToPlain(u);
    if (callback_url) return { accepted: true, understanding_id: u.id, video_id, analyzers: plain.analyzers };
    return plain;
  },
});

const getUnderstanding = defineTool({
  name: "get_understanding",
  title: "Get understanding run",
  description: `Get the status of one understanding run and of each analyzer in it (pending, running, done, failed). ${V2_FLOW}`,
  kind: "read",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID, understanding_id: UNDERSTANDING_ID }),
  handler: async ({ video_id, collection_id, understanding_id }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    return understandingToPlain(await v.getUnderstanding(understanding_id));
  },
});

const listUnderstandings = defineTool({
  name: "list_understandings",
  title: "List understanding runs",
  description: `List every understanding run of a video with its status and analyzers. ${V2_FLOW}`,
  kind: "read",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID }),
  handler: async ({ video_id, collection_id }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    return (await v.listUnderstandings()).map(understandingToPlain);
  },
});

const deleteUnderstanding = defineTool({
  name: "delete_understanding",
  title: "Delete understanding run",
  description: "Permanently delete an understanding run and its stored analyzer artifacts (indexes built from it keep their own data). This cannot be undone.",
  kind: "destructive",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID, understanding_id: UNDERSTANDING_ID }),
  handler: async ({ video_id, collection_id, understanding_id }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    await v.deleteUnderstanding(understanding_id);
    return { deleted: true, understanding_id, video_id };
  },
});

const getAnalyzerOutput = defineTool({
  name: "get_analyzer_output",
  title: "Get analyzer output",
  description:
    "Return the raw artifact one analyzer produced in an understanding run, such as transcript segments or per-scene descriptions with start/end. Requires the analyzer status to be done (see get_understanding). Lists are capped at 200 items.",
  kind: "read",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID, understanding_id: UNDERSTANDING_ID, ...ANALYZER_REF }),
  handler: async ({ video_id, collection_id, understanding_id, analyzer_name, analyzer_id }, vdb) => {
    const u = understandingShell(vdb, collection_id, video_id, understanding_id);
    return capRecords(await u.getAnalyzerOutput(analyzerRef(analyzer_name, analyzer_id)));
  },
});

const createIndex = defineTool({
  name: "create_index",
  title: "Create index from analyzer output",
  description:
    `Build a retrieval-ready index from one analyzer's output of an understanding run (requires understand_video with that analyzer done). ${V2_FLOW} use_for picks capabilities (default semantic + query + aggregate); fields maps record fields to capabilities. With callback_url the call returns immediately.`,
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    understanding_id: UNDERSTANDING_ID,
    ...ANALYZER_REF,
    name: z.string().optional().describe("Index name; used by semantic_search index_names and get_index."),
    use_for: z.array(USE_FOR).optional().describe("Retrieval capabilities: semantic (embeddings), query (filter/sort), aggregate (group/count)."),
    fields: z
      .record(z.string(), z.array(FIELD_CAP))
      .optional()
      .describe("Per-field capabilities, e.g. {description:['semantic'], label:['filter','aggregate']}. Omit for VideoDB defaults."),
    callback_url: CALLBACK_URL,
  }),
  retryWith: "get_index",
  handler: async ({ video_id, collection_id, understanding_id, analyzer_name, analyzer_id, name, use_for, fields, callback_url }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    const u = await v.getUnderstanding(understanding_id);
    const analyzer = await u.getAnalyzer(analyzerRef(analyzer_name, analyzer_id));
    const index = await v.index(analyzer, { name, useFor: use_for, fields, callbackUrl: callback_url });
    if (callback_url) return { accepted: true, index_id: index?.indexId, video_id, understanding_id };
    return index ? { ...pick(index, INDEX_KEYS), video_id } : { video_id, understanding_id };
  },
});

const getIndex = defineTool({
  name: "get_index",
  title: "Get index",
  description: "Get one v2 index manifest by ID or name: status (building/ready/failed), record count, capabilities and field schema.",
  kind: "read",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    index_id: z.string().optional().describe("Index ID. Give this or name."),
    name: z.string().optional().describe("Index name. Give this or index_id."),
  }),
  handler: async ({ video_id, collection_id, index_id, name }, vdb) => {
    if (!index_id && !name) throw new Error("Provide index_id or name.");
    const v = await fetchVideo(vdb, collection_id, video_id);
    const index = await v.getIndex({ indexId: index_id, name });
    if (!index) throw new Error(`Index not found: ${index_id ?? name}`);
    return { ...pick(index, INDEX_KEYS), video_id };
  },
});

const listIndexes = defineTool({
  name: "list_indexes",
  title: "List indexes",
  description: `List the v2 indexes of a video (ID, name, status, capabilities, record count). ${V2_FLOW}`,
  kind: "read",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    use_for: USE_FOR.optional().describe("Only indexes supporting this capability."),
  }),
  handler: async ({ video_id, collection_id, use_for }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    return (await v.listIndexes(use_for)).map((i) => pick(i, INDEX_KEYS));
  },
});

const deleteIndex = defineTool({
  name: "delete_index",
  title: "Delete index",
  description: "Permanently delete a v2 index (its retrieval structures only; the video and understanding artifacts are kept). This cannot be undone.",
  kind: "destructive",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID, index_id: INDEX_ID }),
  handler: async ({ video_id, collection_id, index_id }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    await v.deleteIndex(index_id);
    return { deleted: true, index_id, video_id };
  },
});

const getIndexRecords = defineTool({
  name: "get_index_records",
  title: "Get index records",
  description: "Page through the records stored in a v2 index (scene_id, start, end, data). Pass next_cursor from the previous page to continue.",
  kind: "read",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    index_id: INDEX_ID,
    limit: z.number().int().min(1).max(RECORD_CAP).default(20).describe("Records per page."),
    cursor: z.string().optional().describe("next_cursor from the previous page."),
  }),
  handler: async ({ video_id, collection_id, index_id, limit, cursor }, vdb) => {
    const page = await indexShell(vdb, collection_id, video_id, index_id).records(limit, cursor);
    return { index_id, records: page.records.map((r) => pick(r, RECORD_KEYS)), next_cursor: page.nextCursor };
  },
});

export const indexing: Toolset = {
  name: "indexing",
  description: "Spoken/scene indexes (v1) and understand → index pipeline (v2).",
  defaultEnabled: true,
  tools: [
    indexSpokenWords,
    indexScenes,
    listSceneIndexes,
    getSceneIndex,
    deleteSceneIndex,
    understandVideo,
    getUnderstanding,
    listUnderstandings,
    deleteUnderstanding,
    getAnalyzerOutput,
    createIndex,
    getIndex,
    listIndexes,
    deleteIndex,
    getIndexRecords,
  ],
};
