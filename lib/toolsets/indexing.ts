import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID, VIDEO_ID } from "@/lib/mcp/schemas";
import { fetchVideo } from "@/lib/videodb/resolve";

/**
 * Indexing. Legacy (v1): spoken-word + scene indexes consumed by search_video /
 * search_collection. v2: understand (extract) → create_index (make retrievable)
 * consumed by semantic_search / query_index / aggregate_index / ask_*.
 */

const indexSpokenWords = defineTool({
  name: "index_spoken_words",
  title: "Index spoken words",
  description:
    "Transcribe and index everything spoken in a video so it becomes searchable with search_video / search_collection. Run once per video; takes roughly real-time ÷ 10.",
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    language_code: z.string().optional().describe("Optional language hint, e.g. 'en', 'hi', 'es'."),
    force: z.boolean().default(false).describe("Re-index even if an index already exists."),
  }),
  retryWith: "search_video",
  handler: async ({ video_id, collection_id, language_code, force }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    await v.indexSpokenWords(language_code, undefined, force);
    return { indexed: true, video_id, index_type: "spoken_word" };
  },
});

const indexScenes = defineTool({
  name: "index_scenes",
  title: "Index scenes (visual)",
  description:
    "Visually index a video: samples frames per shot or per time window and describes what's on screen so visual moments become searchable (search_video with index_type='scene'). Optionally steer descriptions with a prompt, e.g. 'focus on products shown'.",
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    prompt: z.string().optional().describe("Instruction for how to describe scenes."),
    name: z.string().optional().describe("Name for this scene index."),
    batch_type: z.enum(["shot", "time"]).default("shot").describe("Split by detected shots or fixed time windows."),
    batch_value: z.number().positive().optional().describe("Shot threshold (default 20) or window seconds (default 10)."),
    frame_count: z.number().int().min(1).max(10).default(1).describe("Frames sampled per scene."),
  }),
  retryWith: "list_scene_indexes",
  handler: async ({ video_id, collection_id, prompt, name, batch_type, batch_value, frame_count }, vdb) => {
    const v = await fetchVideo(vdb, collection_id, video_id);
    const scene_index_id = await v.indexVisuals({
      prompt,
      name,
      batchConfig: { type: batch_type, value: batch_value, frameCount: frame_count },
    });
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

export const indexing: Toolset = {
  name: "indexing",
  description: "Spoken/scene indexes (v1) and understand → index pipeline (v2).",
  defaultEnabled: true,
  tools: [indexSpokenWords, indexScenes, listSceneIndexes],
};
