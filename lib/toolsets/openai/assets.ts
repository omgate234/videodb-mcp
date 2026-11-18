import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import { PAGE, PAGE_SIZE } from "@/lib/mcp/schemas";
import { deleteCollection, getCollection, listCollections } from "@/lib/toolsets/collections";
import { deleteAudio, deleteImage, deleteVideo, getAudio, getImage, getVideo, listAudios, listImages, listVideos } from "@/lib/toolsets/media";
import { getRTStream, listRTStreams } from "@/lib/toolsets/rtstream";

/**
 * OpenAI-facing asset tools: one list/get/delete each, dispatched on a closed
 * asset_type enum to the per-type handlers in collections/media/rtstream.
 */

const ASSET_TYPE = z.enum(["collection", "video", "audio", "image", "rtstream"]).describe("Kind of asset.");
const ASSET_ID = z.string().describe("Asset ID: collection ID, m-/a-/img- media ID, or rts- stream ID.");
const COLLECTION = z.string().optional().describe('Collection holding the media (video/audio/image); default "default". Ignored for collection and rtstream.');

const RTSTREAM_LIMIT = 200; // list_rtstreams caps limit at 200

const slice = <T>(rows: T[], page: number, page_size: number) => ({
  items: rows.slice((page - 1) * page_size, page * page_size),
  pagination: { page, page_size, total_count: rows.length, total_pages: Math.max(1, Math.ceil(rows.length / page_size)) },
});

const rowsOf = (out: unknown, key: string) => ((out as Record<string, unknown>)[key] ?? []) as unknown[];

export const listAssets = defineTool({
  name: "list_assets",
  title: "List assets",
  description:
    "List one kind of VideoDB asset. collection: every collection in the account with ID, name, description and visibility. video: videos in collection_id with durations and stream/player URLs. audio: audio files in collection_id with durations and sizes. image: images in collection_id with URLs. rtstream: the account's real-time streams with status and media types. Returns {asset_type, items, pagination}; page/page_size slice the first 200 rows (rtstream pages the API, so totals are omitted).",
  kind: "read",
  input: z.object({ asset_type: ASSET_TYPE, collection_id: COLLECTION, page: PAGE, page_size: PAGE_SIZE }),
  handler: async ({ asset_type, collection_id = "default", page, page_size }, vdb) => {
    // Handlers are typed Promise<unknown>; every list branch resolves to an array of rows.
    const paged = async (rows: Promise<unknown>) => ({ asset_type, ...slice((await rows) as unknown[], page, page_size) });
    switch (asset_type) {
      case "collection":
        return paged(listCollections.handler({}, vdb));
      case "video":
        return paged(listVideos.handler({ collection_id }, vdb).then((o) => rowsOf(o, "videos")));
      case "audio":
        return paged(listAudios.handler({ collection_id }, vdb).then((o) => rowsOf(o, "audios")));
      case "image":
        return paged(listImages.handler({ collection_id }, vdb).then((o) => rowsOf(o, "images")));
      case "rtstream": {
        const limit = Math.min(page_size, RTSTREAM_LIMIT);
        const items = await listRTStreams.handler({ limit, offset: (page - 1) * limit }, vdb);
        return { asset_type, items, pagination: { page, page_size: limit } };
      }
    }
  },
});

export const getAsset = defineTool({
  name: "get_asset",
  title: "Get asset details",
  description:
    "Get one VideoDB asset by ID. collection: ID, name, description, visibility. video: name, duration, thumbnail, stream and player URLs. audio: name, duration, size. image: name and URL. rtstream: name, status, sample rate, media types.",
  kind: "read",
  input: z.object({ asset_type: ASSET_TYPE, asset_id: ASSET_ID, collection_id: COLLECTION }),
  handler: async ({ asset_type, asset_id, collection_id = "default" }, vdb) => {
    switch (asset_type) {
      case "collection":
        return getCollection.handler({ collection_id: asset_id }, vdb);
      case "video":
        return getVideo.handler({ video_id: asset_id, collection_id }, vdb);
      case "audio":
        return getAudio.handler({ audio_id: asset_id, collection_id }, vdb);
      case "image":
        return getImage.handler({ image_id: asset_id, collection_id }, vdb);
      case "rtstream":
        return getRTStream.handler({ rtstream_id: asset_id }, vdb);
    }
  },
});

export const deleteAsset = defineTool({
  name: "delete_asset",
  title: "Delete asset",
  description:
    "Permanently delete one VideoDB asset; cannot be undone. collection: the collection and everything in it (default refused). video: one video. audio: one audio file. image: one image. rtstream: not deletable here (stop or remove it in the VideoDB console).",
  kind: "destructive",
  input: z.object({ asset_type: ASSET_TYPE, asset_id: ASSET_ID, collection_id: COLLECTION }),
  handler: async ({ asset_type, asset_id, collection_id = "default" }, vdb) => {
    switch (asset_type) {
      case "collection":
        return deleteCollection.handler({ collection_id: asset_id }, vdb);
      case "video":
        return deleteVideo.handler({ video_id: asset_id, collection_id }, vdb);
      case "audio":
        return deleteAudio.handler({ audio_id: asset_id, collection_id }, vdb);
      case "image":
        return deleteImage.handler({ image_id: asset_id, collection_id }, vdb);
      case "rtstream":
        throw new Error("Real-time streams cannot be deleted here; stop one with set_rtstream_status instead.");
    }
  },
});
