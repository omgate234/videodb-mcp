import { z } from "zod";
import { Index, Understanding } from "videodb";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { CALLBACK_URL, COLLECTION_ID, VIDEO_ID } from "@/lib/mcp/schemas";
import { fetchVideo } from "@/lib/videodb/resolve";
import { pick, cap } from "@/lib/videodb/serialize";

/**
 * Indexing. Manage existing legacy scene indexes. New indexes use the v2 pipeline:
 * understand (extract) → create_index (make retrievable)
 * consumed by semantic_search / query_index / aggregate_index / ask_*.
 */

const V2_FLOW = "v2 pipeline: understand_video (extract) → create_index (make retrievable) → semantic_search / query_index / aggregate_index / ask_video.";
const RECORD_CAP = 200;

const INDEX_KEYS = ["index_id", "name", "status", "error", "use_for", "record_count", "fields", "field_schema"];
const RECORD_KEYS = ["video_id", "understanding_id", "scene_id", "start", "end", "data"];

const ANALYZER_TYPES = ["speech_transcription", "spoken_words", "vlm", "ocr", "object_detection", "brand_detection", "activity_recognition", "location_detection"] as const;
const USE_FOR = z.enum(["semantic", "query", "aggregate"]);
const FIELD_CAP = z.enum(["semantic", "fts", "filter", "aggregate", "sort", "hydrate", "return"]);

const UNDERSTANDING_ID = z.string().describe("Understanding run ID (from understand_video / list_understandings).");
const INDEX_ID = z.string().describe("Index ID (from create_index / list_indexes).");
const ANALYZER_REF = {
  analyzer_name: z.string().optional().describe("Analyzer name inside the run, e.g. 'transcript', 'scene', 'objects'. Give this or analyzer_id."),
  analyzer_id: z.string().optional().describe("Analyzer ID (an_...). Give this or analyzer_name."),
};

const analyzerRef = (name?: string, id?: string): string => {
  const ref = name?.trim() || id?.trim();
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
  if (Array.isArray(value)) return cap(value, "records", RECORD_CAP);
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
    "Return the per-scene records (start, end, description) of an existing legacy visual scene index. Output is capped at 200 scenes.",
  kind: "read",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    scene_index_id: z.string().describe("Scene index ID (from list_scene_indexes)."),
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

const SAMPLING = z
  .union([
    z.strictObject({
      strategy: z.literal("uniform"),
      frame_count: z.number().int().min(1).describe("Frames taken evenly across each scene. 4-8 for scene description, 1 for a single representative frame."),
    }),
    z.strictObject({
      strategy: z.literal("interval"),
      every: z.number().positive().describe("Seconds between sampled frames inside each scene."),
    }),
  ])
  .describe('Frame selection inside each scene: {"strategy":"uniform","frame_count":4} or {"strategy":"interval","every":2}.');

const TRANSFORM = z
  .strictObject({ resolution: z.string().describe('Frame resolution for visual analyzers, e.g. "480p" or "720p".') })
  .describe("Media preprocessing applied before any analyzer runs.");

const ANALYZER = z
  .strictObject({
    type: z
      .enum(ANALYZER_TYPES)
      .describe(`Analyzer type: ${ANALYZER_TYPES.join(", ")} (spoken_words is an alias of speech_transcription). Default output names: transcript, scene, text, objects, brands, activity, location.`),
    name: z.string().optional().describe("Output name for this analyzer; needed when running two analyzers of the same type."),
    config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Analyzer options; the accepted keys depend on type — see the tool description. Prompts, models, schemas, languages, labels and sandbox_id all belong in here, never at the top level."),
    inputs: z
      .array(z.string().min(1))
      .optional()
      .describe('Names of earlier analyzers in this run whose artifacts this one may use, e.g. ["transcript"] — a list of names, not an object. Reference them in a VLM prompt as {{inputs.<name>}}.'),
    sampling: SAMPLING.optional().describe("Frame selection for this analyzer; overrides the run-level sampling."),
  })
  .describe("Analyzer spec. Put model, language, labels and other analyzer options inside config.");

const SEGMENTATION = z.union([
  z.strictObject({ type: z.literal("shot").default("shot"), threshold: z.number().positive().optional(), min_scene_len: z.number().int().min(1).optional() }),
  z.strictObject({ type: z.literal("time"), seconds: z.number().positive().optional() }),
]);

const understandVideo = defineTool({
  name: "understand_video",
  title: "Understand video (run analyzers)",
  description: `Run analyzers over a video to extract timestamped artifacts: speech, scene descriptions, on-screen text, objects, brands, activities, locations. Artifacts are stored but NOT searchable until create_index runs on them. ${V2_FLOW}

Returns the run and each analyzer's status (pending, running, done, failed). Poll get_understanding, then read an artifact with get_analyzer_output. With callback_url the call returns immediately.

## Shape

Run-level options apply to the whole run; analyzer options apply to one entry in \`analyzers\`.

\`\`\`json
{
  "segmentation": {"type": "shot", "threshold": 30},
  "transform": {"resolution": "480p"},
  "analyzers": [
    {"type": "spoken_words", "name": "transcript", "config": {"language": "en"}},
    {"type": "vlm", "name": "scene", "inputs": ["transcript"],
     "sampling": {"strategy": "uniform", "frame_count": 4},
     "config": {"model": "pro", "prompt": "Describe this scene. Spoken words: {{inputs.transcript}}"}}
  ]
}
\`\`\`

## Analyzer types

| type | default name | produces |
| --- | --- | --- |
| spoken_words | transcript | timed speech text plus word timestamps |
| vlm | scene | your own prompt or JSON schema over sampled frames |
| ocr | text | text visible on screen |
| object_detection | objects | labels, scores, normalized xyxy boxes |
| brand_detection | brands | brand_names plus mentions |
| activity_recognition | activity | the action in each scene |
| location_detection | location | the setting of each scene |

Set \`name\` to run two analyzers of the same type, or to reference one from \`inputs\`.

## config keys, by type

| type | keys |
| --- | --- |
| spoken_words | language ("en", "hi", ...), speaker_labels |
| vlm | model, prompt, schema, sandbox_id |
| object_detection | sandbox_id (required), labels, confidence_threshold, include_bounding_boxes |
| ocr, brand_detection, activity_recognition, location_detection | model |

\`model\` is a hosted tier — mini, basic, pro, ultra — or a provider id such as "google/gemini-2.5-flash". Hosted tiers need no sandbox_id.

object_detection runs on Open Compute only: create_sandbox (small tier) -> get_sandbox until status is \"active\" -> pass its id as config.sandbox_id. Stop it with stop_sandbox afterwards; a sandbox bills for as long as it runs. An open-weight VLM (e.g. "google/gemma-4-31B-it-FP8") needs one too. Its labels come from the COCO 80-label vocabulary ("person", "laptop", "cell phone", ...).

A vlm config.schema returns JSON instead of prose: \`{"activity": "string", "visible_objects": ["string"], "confidence": {"type": "number", "min": 0, "max": 1}}\`.

## inputs

A list of earlier analyzer names whose artifacts this analyzer may read. Reference one in the prompt as \`{{inputs.transcript}}\`; if you list inputs without a placeholder, VideoDB appends the context after the prompt.

## segmentation, sampling, transform

segmentation sets the time ranges every visual analyzer attaches output to; it is shared by the whole run. Default \`{"type":"shot","threshold":30}\`. Use shot for edited video (higher threshold means fewer splits, min_scene_len sets a floor) and \`{"type":"time","seconds":N}\` for streams, surveillance and long unedited footage.

sampling picks frames inside each scene. Pass it per analyzer or once at run level. uniform with frame_count 4-8 suits scene description, frame_count 1 gives one representative frame; interval with every N seconds catches text or motion that appears briefly. spoken_words ignores sampling.

transform \`{"resolution":"480p"}\` lowers cost and latency; keep the source resolution when small text or fine detail matters.`,
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    analyzers: z
      .array(ANALYZER)
      .min(1)
      .describe('Analyzers to run, e.g. [{"type":"spoken_words"}, {"type":"vlm","config":{"prompt":"Describe the scene"}}]. See the tool description for the config keys each type accepts.'),
    segmentation: SEGMENTATION
      .optional()
      .describe('One object, not an array: {"type":"shot","threshold":30} (default) or {"type":"time","seconds":5}. Shared by every visual analyzer in the run.'),
    sampling: SAMPLING.optional().describe("Default frame selection for every visual analyzer; an analyzer's own sampling wins."),
    transform: TRANSFORM.optional().describe('Preprocessing for the whole run, e.g. {"resolution":"480p"} to cut cost and latency.'),
    callback_url: CALLBACK_URL,
  }),
  retryWith: "get_understanding",
  handler: async ({ video_id, collection_id, analyzers, segmentation, sampling, transform, callback_url }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    const u = await v.understand(analyzers, { segmentation, sampling, transform, callbackUrl: callback_url });
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
  description: `Build a retrieval-ready index from one analyzer's artifact of an understanding run; that analyzer must be done (get_understanding). ${V2_FLOW} With callback_url the call returns immediately.

## use_for — what the index may be used for

| value | enables |
| --- | --- |
| semantic | semantic_search and search (embeddings) |
| query | query_index — exact filters and ranges |
| aggregate | aggregate_index — counts, group_by, facets |

Omit it for all three. Drop semantic (e.g. ["query"]) to skip embeddings: cheaper, and ready instantly. get_index reports the index's EFFECTIVE capability, so it can be narrower than what you asked for — aggregate only appears once a field is groupable, and an index with no records reports [].

## fields — which artifact fields join which group

fields maps a group to the field names in it, not the reverse: \`{"semantic":["description"],"filter":["label"],"aggregate":["label"]}\`. Groups are semantic (embedded), fts, filter, aggregate, sort, hydrate and return. A field may join several. Names may be dotted paths into nested data — \`frames.detections.label\` reaches inside every detection. A name that resolves nowhere fails with a 400 listing the fields that do exist.

fields is optional per group: a group you declare is used verbatim, a group you omit is derived from the data.

| artifact field | derived groups |
| --- | --- |
| text, scene_description | semantic |
| language, brand_names | filter, aggregate |
| activity, location | semantic, filter, aggregate |
| frames.detections.label | filter, aggregate |
| frames.detections.score | filter, sort |

Anything else is classified by shape: prose to semantic, short strings and scalar lists to filter and aggregate, numbers also to sort, nested objects stored only. An explicitly empty group opts out and is not refilled — \`{"filter":[]}\` means no filter fields.

## After it returns

The build is rows-first: records are stored before this returns, so query_index and aggregate_index already work while get_index reports "building". Only semantic_search waits for "ready".

Reuse one index name across videos to form a logical group that collection-scoped search can target. Indexes sharing a name must share a field structure; a mismatch is rejected with a 400 showing both.`,
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    understanding_id: UNDERSTANDING_ID,
    ...ANALYZER_REF,
    name: z.string().optional().describe("Index name; used by semantic_search index_names and get_index."),
    use_for: z
      .array(USE_FOR)
      .optional()
      .describe("Capabilities to build: semantic (embeddings), query (filters), aggregate (group/count). Omit for all three; drop semantic to skip embeddings."),
    fields: z
      .partialRecord(FIELD_CAP, z.array(z.string().min(1)))
      .optional()
      .describe('One object mapping each group to the field names in it, e.g. {"semantic":["description"],"filter":["label"],"aggregate":["label"]} — not field to groups. Other groups: fts, sort, hydrate, return. Names may be dotted paths such as "frames.detections.label". An empty array opts a group out; an omitted group is derived from the data.'),
    callback_url: CALLBACK_URL,
  }),
  retryWith: "get_index",
  handler: async ({ video_id, collection_id, understanding_id, analyzer_name, analyzer_id, name, use_for, fields, callback_url }, vdb) => {
    const ref = analyzerRef(analyzer_name, analyzer_id);
    const v = await fetchVideo(vdb, collection_id, video_id);
    const u = await v.getUnderstanding(understanding_id);
    const analyzer = await u.getAnalyzer(ref);
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
    // Match list_indexes: resolve the default alias through the accessible video.
    // Index records endpoints require the canonical collection ID on the wire.
    const video = await fetchVideo(vdb, collection_id, video_id);
    if (!video.collectionId || video.collectionId === "default") {
      throw new Error("VideoDB did not return a canonical collection ID for this video.");
    }
    if (collection_id !== "default" && collection_id !== video.collectionId) {
      throw new Error("The video does not belong to the requested collection.");
    }
    const page = await indexShell(vdb, video.collectionId, video_id, index_id).records(limit, cursor);
    return { index_id, records: page.records.map((r) => pick(r, RECORD_KEYS)), next_cursor: page.nextCursor };
  },
});

export const indexing: Toolset = {
  name: "indexing",
  description: "Understand → index pipeline (v2) and management of existing legacy scene indexes.",
  defaultEnabled: true,
  tools: [
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
