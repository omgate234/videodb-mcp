import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID, VIDEO_ID } from "@/lib/mcp/schemas";
import { fetchVideo, collection } from "@/lib/videodb/resolve";
import { shotsToPlain } from "@/lib/videodb/serialize";
import { SearchResponse, SearchResult } from "videodb";

/**
 * Search & retrieval. Legacy (v1) search over spoken/scene indexes, v2
 * search/ask/semantic/query/aggregate over understanding-backed indexes.
 */

/** Normalise any SDK search return into { shots, ...envelope }. */
export function searchToPlain(res: unknown) {
  if (res instanceof SearchResponse) {
    const { shots, results, ...envelope } = res;
    return { ...envelope, ...(shots.length ? { shots: shotsToPlain(shots) } : { results }) };
  }
  if (res instanceof SearchResult) return { shots: shotsToPlain(res.shots) };
  return res;
}

const LEGACY = {
  search_type: z.enum(["semantic", "keyword"]).default("semantic"),
  index_type: z.enum(["spoken_word", "scene"]).default("spoken_word"),
  result_threshold: z.number().int().min(1).max(50).default(5).describe("Max results."),
  scene_index_id: z.string().optional().describe("Search a specific scene index (from list_scene_indexes)."),
};

const searchVideo = defineTool({
  name: "search_video",
  title: "Search inside a video",
  description:
    "Search within one video and get matching moments with start/end timestamps, text, and relevance scores. Semantic or keyword search over the spoken-word index (run index_spoken_words first) or over a scene index for visual content (run index_scenes first).",
  kind: "read",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    query: z.string().describe("What to look for, e.g. 'moments where pricing is discussed'."),
    ...LEGACY,
  }),
  handler: async ({ video_id, collection_id, query, search_type, index_type, result_threshold, scene_index_id }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    const res = await video.search(query, {
      searchType: search_type,
      indexType: index_type,
      resultThreshold: result_threshold,
      sceneIndexId: scene_index_id,
    });
    return searchToPlain(res);
  },
});

const searchCollection = defineTool({
  name: "search_collection",
  title: "Search across a collection",
  description:
    "Semantic search across every indexed video in a collection. Returns matching moments grouped by video, with timestamps and scores. Only searches videos that have been indexed.",
  kind: "read",
  input: z.object({
    collection_id: COLLECTION_ID,
    query: z.string().describe("Natural-language search query."),
    index_type: LEGACY.index_type,
    result_threshold: LEGACY.result_threshold,
  }),
  handler: async ({ collection_id, query, index_type, result_threshold }, vdb) => {
    const res = await collection(vdb, collection_id).search(query, {
      searchType: "semantic",
      indexType: index_type,
      resultThreshold: result_threshold,
    });
    return searchToPlain(res);
  },
});

export const search: Toolset = {
  name: "search",
  description: "Search moments, ask questions, query and aggregate indexes.",
  defaultEnabled: true,
  tools: [searchVideo, searchCollection],
};
