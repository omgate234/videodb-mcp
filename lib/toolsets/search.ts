import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID, VIDEO_ID } from "@/lib/mcp/schemas";
import { fetchVideo, collection } from "@/lib/videodb/resolve";
import { shotsToPlain, cap } from "@/lib/videodb/serialize";
import { AskResponse, SearchResponse, SearchResult, type Connection } from "videodb";

/**
 * Search & retrieval. Legacy (v1) search over spoken/scene indexes, v2
 * search/ask/semantic/query/aggregate over understanding-backed indexes.
 */

const MAX_SHOTS = 200;

/** Cap unbounded shot lists so one search cannot blow the context window. */
const cappedShots = (shots: readonly object[]) => cap(shotsToPlain(shots), "shots", MAX_SHOTS);

/** Normalise any SDK search return into { shots, ...envelope }. */
export function searchToPlain(res: unknown) {
  if (res instanceof SearchResponse) {
    const { shots, results, responseType, ...envelope } = res;
    const isShots = responseType === "shots" || responseType === "deepsearch";
    return { responseType, ...envelope, ...(isShots ? cappedShots(shots) : { results }) };
  }
  if (res instanceof SearchResult) return cappedShots(res.shots);
  if (res instanceof AskResponse) return { answer: res.answer, sources: shotsToPlain(res.sources) };
  return res;
}

/** Drop undefined keys so the SDK only sees the options the caller actually sent. */
const defined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * Search V2 and the legacy spoken-word/scene search take mutually exclusive
 * parameter sets and the SDK throws when they are mixed, so each family gets
 * its own tool rather than one schema the model has to route by hand.
 */
const V2 = {
  top_k: z.number().int().min(1).max(200).optional().describe("Maximum moments to return."),
  mode: z.enum(["default", "deepsearch"]).optional().describe("default = single-step planned retrieval; deepsearch = multi-step investigation with follow-up sessions."),
  include_clip: z.boolean().optional().describe("Also return a playable clip for each moment."),
  session_id: z.string().optional().describe("Continue a deepsearch session (session_id from a previous response). Only valid with mode=deepsearch."),
};

const V2_NOTE =
  " Uses Search V2 over indexes built by create_index. For the older spoken-word/scene indexes built by index_spoken_words / index_scenes, use the legacy_search_* tools instead.";
const LEGACY_NOTE =
  " Searches the legacy v1 indexes built by index_spoken_words / index_scenes. For indexes built by create_index, use search_video / search_collection instead.";

const v2Options = (a: { top_k?: number; mode?: string; include_clip?: boolean; session_id?: string }) =>
  defined({ topK: a.top_k, mode: a.mode, includeClip: a.include_clip, sessionId: a.session_id });

const searchVideo = defineTool({
  name: "search_video",
  title: "Search inside a video",
  description:
    "Search within one video and get matching moments with start/end timestamps, text, and relevance scores." + V2_NOTE,
  kind: "read",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    query: z.string().describe("What to look for, e.g. 'moments where pricing is discussed'."),
    ...V2,
  }),
  handler: async ({ video_id, collection_id, query, ...rest }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    return searchToPlain(await video.search(query, v2Options(rest)));
  },
});

const searchCollection = defineTool({
  name: "search_collection",
  title: "Search across a collection",
  description:
    "Search every indexed video in a collection and get matching moments grouped by video, with timestamps and scores." + V2_NOTE,
  kind: "read",
  input: z.object({
    collection_id: COLLECTION_ID,
    query: z.string().describe("Natural-language search query."),
    ...V2,
  }),
  handler: async ({ collection_id, query, ...rest }, vdb) => {
    return searchToPlain(await collection(vdb, collection_id).search(query, v2Options(rest)));
  },
});

const SEARCH_TYPE = z.enum(["semantic", "keyword"]).default("semantic").describe("semantic or keyword matching. Keyword works on videos only.");
const INDEX_TYPE = z.enum(["spoken_word", "scene"]).default("spoken_word").describe("Index to search: spoken_word or scene.");
const RESULT_THRESHOLD = z.number().int().min(1).max(50).default(5).describe("Max results.");

const legacySearchVideo = defineTool({
  name: "legacy_search_video",
  title: "Search inside a video (legacy index)",
  description:
    "Search within one video and get matching moments with start/end timestamps, text, and relevance scores." + LEGACY_NOTE,
  kind: "read",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    query: z.string().describe("What to look for, e.g. 'moments where pricing is discussed'."),
    search_type: SEARCH_TYPE,
    index_type: INDEX_TYPE,
    result_threshold: RESULT_THRESHOLD,
    scene_index_id: z.string().trim().min(1).optional().describe("Scene index ID from list_scene_indexes. Required when search_type=keyword and index_type=scene."),
  }).refine(
    (a) => a.search_type !== "keyword" || a.index_type !== "scene" || Boolean(a.scene_index_id),
    { path: ["scene_index_id"], message: "scene_index_id is required when search_type=keyword and index_type=scene." }
  ),
  handler: async ({ video_id, collection_id, query, search_type, index_type, result_threshold, scene_index_id }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    const res = await video.legacySearch(query, search_type, index_type, result_threshold, undefined, undefined, undefined, undefined, scene_index_id);
    return searchToPlain(res);
  },
});

const legacySearchCollection = defineTool({
  name: "legacy_search_collection",
  title: "Search across a collection (legacy index)",
  description:
    "Search every indexed video in a collection and get matching moments grouped by video, with timestamps and scores." + LEGACY_NOTE,
  kind: "read",
  // The SDK's collection legacy path drops scene_index_id and rejects keyword search.
  input: z.object({
    collection_id: COLLECTION_ID,
    query: z.string().describe("Natural-language search query."),
    index_type: INDEX_TYPE,
    result_threshold: RESULT_THRESHOLD,
  }),
  handler: async ({ collection_id, query, index_type, result_threshold }, vdb) => {
    const res = await collection(vdb, collection_id).legacySearch(query, "semantic", index_type, result_threshold);
    return searchToPlain(res);
  },
});

const ASK = {
  question: z.string().describe("Question to answer from the indexed content."),
  top_k: z.number().int().min(1).max(200).optional().describe("Candidate moments retrieved as evidence (default 15)."),
  mode: z.string().optional().describe("Retrieval mode for sources (default 'default')."),
  include_sources: z.boolean().optional().describe("Return the supporting moments alongside the answer (default false)."),
};

const askOptions = (a: { top_k?: number; mode?: string; include_sources?: boolean }) =>
  defined({ topK: a.top_k, mode: a.mode, includeSources: a.include_sources });

const askVideo = defineTool({
  name: "ask_video",
  title: "Ask a question about a video",
  description:
    "Answer a natural-language question from one video's indexed content (requires an index built by create_index). Returns the answer and, optionally, the source moments.",
  kind: "read",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID, ...ASK }),
  handler: async ({ video_id, collection_id, question, ...rest }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    return searchToPlain(await video.ask(question, askOptions(rest)));
  },
});

const askCollection = defineTool({
  name: "ask_collection",
  title: "Ask a question about a collection",
  description:
    "Answer a natural-language question from every indexed video in a collection (requires indexes built by create_index). Returns the answer and, optionally, the source moments.",
  kind: "read",
  input: z.object({ collection_id: COLLECTION_ID, ...ASK }),
  handler: async ({ collection_id, question, ...rest }, vdb) => {
    return searchToPlain(await collection(vdb, collection_id).ask(question, askOptions(rest)));
  },
});

const OPTIONAL_VIDEO_ID = VIDEO_ID.optional().describe("VideoDB video ID (starts with m-). Omit to run against the whole collection.");
const FILTER = z
  .union([z.array(z.record(z.string(), z.unknown())), z.record(z.string(), z.unknown())])
  .optional()
  .describe('Structured filter over index fields, e.g. [{"field": "label", "op": "==", "value": "phone"}] or {"activity": "walking"}.');
const SORT = z
  .union([z.string(), z.array(z.tuple([z.string(), z.enum(["asc", "desc"])]))])
  .optional()
  .describe('Sort order, e.g. [["start", "asc"]].');
const RETURN_FIELDS = z
  .union([z.string(), z.array(z.string()), z.record(z.string(), z.unknown())])
  .optional()
  .describe('Index fields to hydrate into each moment\'s metadata; "all" for everything.');
const INDEX_NAME = z.string().trim().min(1).optional().describe("Index name from list_indexes. Provide exactly one of index_name or index_id.");
const INDEX_ID = z.string().trim().min(1).optional().describe("Index ID from list_indexes. Provide exactly one of index_id or index_name.");
const hasOneIndex = (a: { index_name?: string; index_id?: string }) => Boolean(a.index_name) !== Boolean(a.index_id);
const ONE_INDEX_ERROR = { path: ["index_id"], message: "Provide exactly one of index_id or index_name." };

/** Scope helper: video when video_id is given, else the collection. */
const scope = (vdb: Connection, collection_id: string, video_id?: string) =>
  video_id ? fetchVideo(vdb, collection_id, video_id) : Promise.resolve(collection(vdb, collection_id));

const semanticSearch = defineTool({
  name: "semantic_search",
  title: "Semantic search over indexes",
  description:
    "Vector search over one or more indexes built by create_index (use_for includes 'semantic') in a video or across a collection. Returns matching moments with scores.",
  kind: "read",
  input: z.object({
    collection_id: COLLECTION_ID,
    video_id: OPTIONAL_VIDEO_ID,
    query: z.string().describe("Natural-language query."),
    index_names: z.array(z.string()).optional().describe("Restrict to these index names."),
    index_ids: z.array(z.string()).optional().describe("Restrict to these index IDs."),
    top_k: z.number().int().min(1).max(200).optional().describe("Max moments to return (default 10)."),
    score_threshold: z.number().min(0).max(1).optional().describe("Minimum similarity score."),
    filter: FILTER,
    return_fields: RETURN_FIELDS,
  }),
  handler: async ({ collection_id, video_id, query, index_names, index_ids, top_k, score_threshold, filter, return_fields }, vdb) => {
    const target = await scope(vdb, collection_id, video_id);
    const res = await target.semanticSearch(query, defined({ indexNames: index_names, indexIds: index_ids, topK: top_k, scoreThreshold: score_threshold, filter, returnFields: return_fields }));
    return searchToPlain(res);
  },
});

const queryIndex = defineTool({
  name: "query_index",
  title: "Query an index with filters",
  description:
    "Structured filter/sort over one index built by create_index (use_for includes 'query') in a video or across a collection. Provide exactly one of index_id or index_name. Returns matching moments without semantic ranking.",
  kind: "read",
  input: z.object({
    collection_id: COLLECTION_ID,
    video_id: OPTIONAL_VIDEO_ID,
    index_name: INDEX_NAME,
    index_id: INDEX_ID,
    filter: FILTER,
    sort: SORT,
    limit: z.number().int().min(1).max(1000).optional().describe("Max records (default 100)."),
    return_fields: RETURN_FIELDS,
  }).refine(hasOneIndex, ONE_INDEX_ERROR),
  handler: async ({ collection_id, video_id, index_name, index_id, filter, sort, limit, return_fields }, vdb) => {
    const target = await scope(vdb, collection_id, video_id);
    const res = await target.query(defined({ indexName: index_name, indexId: index_id, filter, sort, limit, returnFields: return_fields }));
    return searchToPlain(res);
  },
});

const aggregateIndex = defineTool({
  name: "aggregate_index",
  title: "Aggregate an index",
  description:
    "Counts, groups and facets over one index built by create_index (use_for includes 'aggregate') in a video or across a collection. Provide exactly one of index_id or index_name. Returns aggregate rows, not moments.",
  kind: "read",
  input: z.object({
    collection_id: COLLECTION_ID,
    video_id: OPTIONAL_VIDEO_ID,
    index_name: INDEX_NAME,
    index_id: INDEX_ID,
    group_by: z.string().optional().describe("Aggregatable field to group by; dotted paths allowed, e.g. frames.detections.label."),
    metric: z.string().optional().describe("count (default), or sum(field), avg(field), min(field), max(field)."),
    filter: FILTER,
    sort: SORT,
    limit: z.number().int().min(1).max(1000).optional().describe("Max groups (default 100)."),
  }).refine(hasOneIndex, ONE_INDEX_ERROR),
  handler: async ({ collection_id, video_id, index_name, index_id, group_by, metric, filter, sort, limit }, vdb) => {
    const target = await scope(vdb, collection_id, video_id);
    const res = await target.aggregate(defined({ indexName: index_name, indexId: index_id, groupBy: group_by, metric, filter, sort, limit }));
    const rows = Array.isArray(res) ? res : Array.isArray(res?.results) ? (res.results as unknown[]) : undefined;
    if (!rows || rows.length <= MAX_SHOTS) return res;
    const capped = cap(rows, "results", MAX_SHOTS);
    return Array.isArray(res) ? capped : { ...res, ...capped };
  },
});

export const search: Toolset = {
  name: "search",
  description: "Search moments, ask questions, query and aggregate indexes.",
  defaultEnabled: true,
  tools: [searchVideo, searchCollection, legacySearchVideo, legacySearchCollection, askVideo, askCollection, semanticSearch, queryIndex, aggregateIndex],
};
