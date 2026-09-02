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

/** Drop undefined keys so the SDK's legacy-vs-v2 dispatcher only sees what the caller sent. */
const defined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

const LEGACY = {
  search_type: z.enum(["semantic", "keyword"]).optional().describe("Legacy: semantic (default) or keyword matching. Keyword works on videos only."),
  index_type: z.enum(["spoken_word", "scene"]).optional().describe("Legacy: index to search, spoken_word (default) or scene."),
  result_threshold: z.number().int().min(1).max(50).optional().describe("Legacy: max results (default 5)."),
  scene_index_id: z.string().optional().describe("Legacy: search one scene index (from list_scene_indexes)."),
};

const V2 = {
  top_k: z.number().int().min(1).max(200).optional().describe("v2: maximum moments to return."),
  mode: z.enum(["default", "deepsearch"]).optional().describe("v2: default = single-step planned retrieval; deepsearch = multi-step investigation with follow-up sessions."),
  include_clip: z.boolean().optional().describe("v2: also return a playable clip for each moment."),
  session_id: z.string().optional().describe("v2: continue a deepsearch session (session_id from a previous response). Only valid with mode=deepsearch."),
};

const ROUTING =
  " Routing: legacy params (search_type, index_type, result_threshold, scene_index_id where accepted) search the spoken-word/scene indexes built by index_spoken_words/index_scenes; v2 params (top_k, mode, include_clip, session_id) use Search V2 over indexes built by create_index. No params = legacy semantic spoken-word search; any v2 param = Search V2; mixing the two groups is an error.";

type LegacyArgs = { search_type?: "semantic" | "keyword"; index_type?: "spoken_word" | "scene"; result_threshold?: number; scene_index_id?: string };
type V2Args = { top_k?: number; mode?: string; include_clip?: boolean; session_id?: string };

/** Legacy defaults apply only when no v2 param is given, so the v2 route stays reachable. */
function searchOptions(a: LegacyArgs & V2Args) {
  const legacy = defined({ searchType: a.search_type, indexType: a.index_type, resultThreshold: a.result_threshold, sceneIndexId: a.scene_index_id });
  const v2 = defined({ topK: a.top_k, mode: a.mode, includeClip: a.include_clip, sessionId: a.session_id });
  if (Object.keys(v2).length) return { ...legacy, ...v2 };
  return { searchType: "semantic" as const, indexType: "spoken_word" as const, resultThreshold: 5, ...legacy };
}

const searchVideo = defineTool({
  name: "search_video",
  title: "Search inside a video",
  description:
    "Search within one video and get matching moments with start/end timestamps, text, and relevance scores." + ROUTING,
  kind: "read",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    query: z.string().describe("What to look for, e.g. 'moments where pricing is discussed'."),
    ...LEGACY,
    ...V2,
  }),
  handler: async ({ video_id, collection_id, query, ...rest }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    return searchToPlain(await video.search(query, searchOptions(rest)));
  },
});

const searchCollection = defineTool({
  name: "search_collection",
  title: "Search across a collection",
  description:
    "Search every indexed video in a collection and get matching moments grouped by video, with timestamps and scores." + ROUTING,
  kind: "read",
  input: z.object({
    collection_id: COLLECTION_ID,
    query: z.string().describe("Natural-language search query."),
    // The SDK's collection legacy path drops scene_index_id and rejects keyword search.
    index_type: LEGACY.index_type,
    result_threshold: LEGACY.result_threshold,
    ...V2,
  }),
  handler: async ({ collection_id, query, ...rest }, vdb) => {
    return searchToPlain(await collection(vdb, collection_id).search(query, searchOptions(rest)));
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
const INDEX_NAME = z.string().optional().describe("Index name (from list_indexes).");
const INDEX_ID = z.string().optional().describe("Index ID (from list_indexes).");

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
    "Structured filter/sort over one index built by create_index (use_for includes 'query') in a video or across a collection. Returns matching moments without semantic ranking.",
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
  }),
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
    "Counts, groups and facets over one index built by create_index (use_for includes 'aggregate') in a video or across a collection. Returns aggregate rows, not moments.",
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
  }),
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
  tools: [searchVideo, searchCollection, askVideo, askCollection, semanticSearch, queryIndex, aggregateIndex],
};
