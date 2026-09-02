import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID, VIDEO_ID } from "@/lib/mcp/schemas";
import { pick, VIDEO_KEYS } from "@/lib/videodb/serialize";
import { collection, fetchVideo } from "@/lib/videodb/resolve";

/**
 * Media assets: videos, audio, images — list/get/upload/update/delete,
 * thumbnails, signed URLs, YouTube search, transcode.
 */

const listVideos = defineTool({
  name: "list_videos",
  title: "List videos",
  description: "List videos in a VideoDB collection: IDs, names, durations, and playable stream/player URLs.",
  kind: "read",
  input: z.object({ collection_id: COLLECTION_ID }),
  handler: async ({ collection_id }, vdb) => {
    const videos = await collection(vdb, collection_id).getVideos();
    return videos.map((v) => pick(v, VIDEO_KEYS));
  },
});

const getVideo = defineTool({
  name: "get_video",
  title: "Get video details",
  description:
    "Get metadata for one video: name, duration, thumbnail, stream URL, and a player URL for watching it in a browser.",
  kind: "read",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID }),
  handler: async ({ video_id, collection_id }, vdb) => {
    return pick(await fetchVideo(vdb, collection_id, video_id), VIDEO_KEYS);
  },
});

const uploadMedia = defineTool({
  name: "upload_media",
  title: "Upload media from URL",
  description:
    "Upload a video, audio file, or image into VideoDB from a public URL (direct file links and YouTube URLs both work). Waits for processing and returns the created media object with its ID and player URL. Long videos may take a few minutes.",
  kind: "create",
  input: z.object({
    url: z.string().url().describe("Public URL of the media (or a YouTube link)."),
    collection_id: COLLECTION_ID,
    name: z.string().optional().describe("Optional display name."),
    description: z.string().optional(),
    media_type: z.enum(["video", "audio", "image"]).optional().describe("Force a media type; auto-detected if omitted."),
  }),
  retryWith: "list_videos",
  handler: async ({ url, collection_id, name, description, media_type }, vdb) => {
    return collection(vdb, collection_id).uploadURL({ url, name, description, mediaType: media_type });
  },
});

const generateThumbnail = defineTool({
  name: "generate_thumbnail",
  title: "Generate thumbnail",
  description: "Get the default thumbnail of a video, or generate one from a specific timestamp (in seconds).",
  kind: "create",
  input: z.object({
    video_id: VIDEO_ID,
    collection_id: COLLECTION_ID,
    time_seconds: z.number().min(0).optional().describe("Timestamp to capture; omit for the default thumbnail."),
  }),
  handler: async ({ video_id, collection_id, time_seconds }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    const result = await video.generateThumbnail(time_seconds);
    return typeof result === "string" ? { thumbnail_url: result } : result;
  },
});

const deleteVideo = defineTool({
  name: "delete_video",
  title: "Delete video",
  description: "Permanently delete a video from a VideoDB collection. This cannot be undone.",
  kind: "destructive",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID }),
  handler: async ({ video_id, collection_id }, vdb) => {
    await collection(vdb, collection_id).deleteVideo(video_id);
    return { deleted: true, video_id };
  },
});

export const media: Toolset = {
  name: "media",
  description: "Videos, audio and images: list, inspect, upload, thumbnails, delete.",
  defaultEnabled: true,
  tools: [listVideos, getVideo, uploadMedia, generateThumbnail, deleteVideo],
};
