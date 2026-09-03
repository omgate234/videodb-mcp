import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { AUDIO_ID, CALLBACK_URL, COLLECTION_ID, IMAGE_ID, MEDIA_ID, PAGE, PAGE_SIZE, VIDEO_ID, mediaKind } from "@/lib/mcp/schemas";
import { ASSET_KEYS, AUDIO_KEYS, IMAGE_KEYS, VIDEO_KEYS, cap, pick } from "@/lib/videodb/serialize";
import { collection, fetchAudio, fetchImage, fetchVideo } from "@/lib/videodb/resolve";
import { listAssets } from "@/lib/videodb/assets";
import type { Connection } from "@/lib/videodb/client";

type VideoConfig = NonNullable<Parameters<Connection["transcode"]>[3]>;

/**
 * Media assets: videos, audio, images — list/get/upload/update/delete,
 * thumbnails, signed URLs, YouTube search, transcode.
 */

const listVideos = defineTool({
  name: "list_videos",
  title: "List videos",
  description:
    "List videos in a VideoDB collection: IDs, names, durations, and playable stream/player URLs. Returns {videos: [...]} with the first 200 videos; `truncated: true` and `total` are set when the collection holds more. The endpoint has no pagination, so use search_videos_by_title or search_collection to reach videos beyond the cap.",
  kind: "read",
  input: z.object({ collection_id: COLLECTION_ID }),
  handler: async ({ collection_id }, vdb) => {
    const videos = await collection(vdb, collection_id).getVideos();
    return cap(videos.map((v) => pick(v, VIDEO_KEYS)), "videos");
  },
});

const listAudios = defineTool({
  name: "list_audios",
  title: "List audio files",
  description:
    "List audio files in a VideoDB collection: IDs, names, durations and sizes. Returns {audios: [...]} with the first 200 files; `truncated: true` and `total` are set when the collection holds more. The endpoint has no pagination, so the rest can only be reached by get_audio with a known ID.",
  kind: "read",
  input: z.object({ collection_id: COLLECTION_ID }),
  handler: async ({ collection_id }, vdb) => {
    const audios = await collection(vdb, collection_id).getAudios();
    return cap(audios.map((a) => pick(a, AUDIO_KEYS)), "audios");
  },
});

const listImages = defineTool({
  name: "list_images",
  title: "List images",
  description:
    "List images in a VideoDB collection: IDs, names and URLs. Returns {images: [...]} with the first 200 images; `truncated: true` and `total` are set when the collection holds more. The endpoint has no pagination, so the rest can only be reached by get_image with a known ID.",
  kind: "read",
  input: z.object({ collection_id: COLLECTION_ID }),
  handler: async ({ collection_id }, vdb) => {
    const images = await collection(vdb, collection_id).getImages();
    return cap(images.map((i) => pick(i, IMAGE_KEYS)), "images");
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

const getAudio = defineTool({
  name: "get_audio",
  title: "Get audio details",
  description: "Get metadata for one audio file: name, duration and size.",
  kind: "read",
  input: z.object({ audio_id: AUDIO_ID, collection_id: COLLECTION_ID }),
  handler: async ({ audio_id, collection_id }, vdb) => {
    return pick(await fetchAudio(vdb, collection_id, audio_id), AUDIO_KEYS);
  },
});

const getImage = defineTool({
  name: "get_image",
  title: "Get image details",
  description: "Get metadata for one image: name and URL.",
  kind: "read",
  input: z.object({ image_id: IMAGE_ID, collection_id: COLLECTION_ID }),
  handler: async ({ image_id, collection_id }, vdb) => {
    return pick(await fetchImage(vdb, collection_id, image_id), IMAGE_KEYS);
  },
});

const uploadMedia = defineTool({
  name: "upload_media",
  title: "Upload media from URL",
  description:
    "Upload a video, audio file, or image into VideoDB from a public URL (direct file links and YouTube URLs both work). Waits for processing and returns the created media object with its ID and player URL; long videos may take a few minutes. With callback_url the upload runs in the background and the call returns immediately.",
  kind: "create",
  input: z.object({
    url: z.string().url().describe("Public URL of the media (or a YouTube link)."),
    collection_id: COLLECTION_ID,
    name: z.string().optional().describe("Optional display name."),
    description: z.string().optional().describe("Optional description stored with the media."),
    media_type: z.enum(["video", "audio", "image"]).optional().describe("Force a media type; auto-detected if omitted."),
    callback_url: CALLBACK_URL,
  }),
  retryWith: "list_videos",
  handler: async ({ url, collection_id, name, description, media_type, callback_url }, vdb) => {
    const media = await collection(vdb, collection_id).uploadURL({
      url,
      name,
      description,
      mediaType: media_type,
      callbackUrl: callback_url,
    });
    if (callback_url) return { accepted: true, collection_id, url, callback_url };
    return media;
  },
});

const searchYoutube = defineTool({
  name: "search_youtube",
  title: "Search YouTube",
  description:
    "Search YouTube for videos matching a query and return titles, URLs and metadata — useful for finding URLs to pass to upload_media. Does not change the account.",
  kind: "read",
  input: z.object({
    query: z.string().describe("Search terms."),
    result_threshold: z.number().int().min(1).max(50).default(10).describe("Requested result count; the server currently ignores it and always returns 10."),
    duration: z.enum(["short", "medium", "long"]).default("medium").describe("YouTube duration filter."),
  }),
  handler: async ({ query, result_threshold, duration }, vdb) => {
    return { results: await vdb.youtubeSearch(query, result_threshold, duration) };
  },
});

const searchVideosByTitle = defineTool({
  name: "search_videos_by_title",
  title: "Search videos by title",
  description: "Find videos in a collection whose title matches a natural-language query. Returns the matching videos with stream/player URLs.",
  kind: "read",
  input: z.object({ collection_id: COLLECTION_ID, query: z.string().describe("Title or phrase to look for.") }),
  handler: async ({ collection_id, query }, vdb) => {
    const results = await collection(vdb, collection_id).searchTitle(query);
    return results.map((r) => pick(r.video, VIDEO_KEYS));
  },
});

const updateVideo = defineTool({
  name: "update_video",
  title: "Rename video",
  description: "Update a video's display name.",
  kind: "update",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID, name: z.string().min(1).describe("New display name.") }),
  handler: async ({ video_id, collection_id, name }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    await video.update({ name });
    return pick(video, VIDEO_KEYS);
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
  retryWith: "list_thumbnails",
  handler: async ({ video_id, collection_id, time_seconds }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    const result = await video.generateThumbnail(time_seconds);
    return typeof result === "string" ? { thumbnail_url: result } : result;
  },
});

const listThumbnails = defineTool({
  name: "list_thumbnails",
  title: "List thumbnails",
  description: "List every thumbnail image generated for a video (see generate_thumbnail), with image IDs and URLs.",
  kind: "read",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID }),
  handler: async ({ video_id, collection_id }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    const thumbs = await video.getThumbnails();
    return thumbs.map((t) => pick(t, IMAGE_KEYS));
  },
});

const getMediaDownloadUrl = defineTool({
  name: "get_media_download_url",
  title: "Get media download URL",
  description:
    "Get a signed, time-limited download URL for an audio file (a-) or image (img-). Video IDs (m-) are not supported here — use download_stream for an MP4 of a video.",
  kind: "read",
  input: z.object({ media_id: MEDIA_ID, collection_id: COLLECTION_ID }),
  handler: async ({ media_id, collection_id }, vdb) => {
    const kind = mediaKind(media_id);
    if (kind === "video") throw new Error(`${media_id} is a video; use download_stream to get an MP4 download URL.`);
    const media = kind === "audio" ? await fetchAudio(vdb, collection_id, media_id) : await fetchImage(vdb, collection_id, media_id);
    const download_url = await media.generateUrl();
    if (!download_url) throw new Error(`VideoDB returned no download URL for ${media_id}.`);
    return { media_id, media_type: kind, download_url };
  },
});

const transcodeMedia = defineTool({
  name: "transcode_media",
  title: "Transcode media",
  description:
    "Start a transcode job for a video at a public URL: change resolution, quality, framerate or aspect ratio, or mute audio. Runs asynchronously — VideoDB calls callback_url when done; poll with get_transcode_status.",
  kind: "create",
  input: z.object({
    source: z.string().url().describe("Public, downloadable URL of the source video."),
    callback_url: z.string().url().describe("Webhook URL VideoDB calls when the job finishes (required)."),
    mode: z.enum(["economy", "lightning"]).default("economy").describe("economy = cheaper/slower, lightning = faster."),
    resolution: z.number().int().min(1).max(4320).optional().describe("Output height in pixels, e.g. 720 or 1080 (max 4K)."),
    quality: z.number().int().min(0).max(51).optional().describe("Encoder CRF quality, lower = better (default 23)."),
    framerate: z.number().int().min(1).max(100).optional().describe("Output frames per second."),
    aspect_ratio: z.string().optional().describe('Output aspect ratio, e.g. "16:9", "9:16", "1:1".'),
    resize_mode: z.enum(["crop", "fit", "pad"]).optional().describe("How to reach aspect_ratio: crop edges, fit (letterbox) or pad with bars."),
    mute: z.boolean().optional().describe("Strip the audio track."),
  }),
  retryWith: "get_transcode_status",
  handler: async ({ source, callback_url, mode, resolution, quality, framerate, aspect_ratio, resize_mode, mute }, vdb) => {
    // The API expects snake_case config keys; the SDK forwards this object verbatim.
    const videoConfig = compact({ resolution, quality, framerate, aspect_ratio, resize_mode }) as VideoConfig;
    const job_id = await vdb.transcode(source, callback_url, mode, videoConfig, compact({ mute }));
    return { accepted: true, job_id, callback_url };
  },
});

const getTranscodeStatus = defineTool({
  name: "get_transcode_status",
  title: "Get transcode status",
  description: "Get the status and output of a transcode job started by transcode_media.",
  kind: "read",
  input: z.object({ job_id: z.string().describe("Transcode job ID returned by transcode_media.") }),
  handler: async ({ job_id }, vdb) => {
    return { job_id, ...(await vdb.getTranscodeDetails(job_id)) };
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

const deleteAudio = defineTool({
  name: "delete_audio",
  title: "Delete audio",
  description: "Permanently delete an audio file from a VideoDB collection. This cannot be undone.",
  kind: "destructive",
  input: z.object({ audio_id: AUDIO_ID, collection_id: COLLECTION_ID }),
  handler: async ({ audio_id, collection_id }, vdb) => {
    await collection(vdb, collection_id).deleteAudio(audio_id);
    return { deleted: true, audio_id };
  },
});

const deleteImage = defineTool({
  name: "delete_image",
  title: "Delete image",
  description: "Permanently delete an image from a VideoDB collection. This cannot be undone.",
  kind: "destructive",
  input: z.object({ image_id: IMAGE_ID, collection_id: COLLECTION_ID }),
  handler: async ({ image_id, collection_id }, vdb) => {
    await collection(vdb, collection_id).deleteImage(image_id);
    return { deleted: true, image_id };
  },
});

const removeVideoStorage = defineTool({
  name: "remove_video_storage",
  title: "Remove video storage",
  description:
    "Delete the stored media bytes of a video while keeping its record, indexes and transcripts. Streaming the original afterwards is no longer possible. This cannot be undone.",
  kind: "destructive",
  input: z.object({ video_id: VIDEO_ID, collection_id: COLLECTION_ID }),
  handler: async ({ video_id, collection_id }, vdb) => {
    const video = await fetchVideo(vdb, collection_id, video_id);
    await video.removeStorage();
    return { storage_removed: true, video_id };
  },
});

/** Drop undefined fields so optional config is not sent as explicit nulls. */
const listAssetsTool = defineTool({
  name: "list_assets",
  title: "List assets",
  description:
    "List videos, audio files and images together in one paginated result, filtered by type, name pattern, duration or file size, and sorted by name, duration or size. Omit collection_id to search the whole account; give it to scope to one collection. Returns {assets: [...], pagination: {page, page_size, total_count, total_pages}}. Rows carry no creation timestamp, so the default created_at order is newest-first within each type rather than a single ordering across types; sort by name, duration or size for a total order. Image rows carry no URL — use get_image or get_media_download_url for one. Prefer this over list_videos/list_audios/list_images whenever the account is large or the answer needs filtering, sorting or paging.",
  kind: "read",
  input: z.object({
    collection_id: z.string().optional().describe("Scope to one collection. Omitted = every collection in the account."),
    asset_type: z
      .array(z.enum(["video", "audio", "image"]))
      .nonempty()
      .optional()
      .describe("Asset types to include. Omitted = all three."),
    name_pattern: z
      .string()
      .max(100)
      .optional()
      .describe("Case-insensitive regular expression matched against the asset name, e.g. 'keynote|demo'."),
    min_duration: z.number().min(0).optional().describe("Minimum duration in seconds (videos and audio)."),
    max_duration: z.number().min(0).optional().describe("Maximum duration in seconds (videos and audio)."),
    min_size: z.number().int().min(0).optional().describe("Minimum file size in bytes."),
    max_size: z.number().int().min(0).optional().describe("Maximum file size in bytes."),
    sort_by: z
      .enum(["created_at", "name", "duration", "size"])
      .default("created_at")
      .describe("Field to sort on. created_at is newest-first per type only, since rows carry no timestamp."),
    sort_order: z.enum(["desc", "asc"]).default("desc").describe("Sort direction."),
    page: PAGE,
    page_size: PAGE_SIZE,
  }),
  handler: async (args, vdb) => {
    const { assets, pagination } = await listAssets(vdb, {
      ...args,
      asset_type: args.asset_type?.join(","),
    });
    return { assets: (assets ?? []).map((a) => pick(a, ASSET_KEYS)), pagination };
  },
});

function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export const media: Toolset = {
  name: "media",
  description: "Videos, audio and images: list, inspect, upload, thumbnails, download URLs, YouTube search, transcode, delete.",
  defaultEnabled: true,
  tools: [
    listAssetsTool,
    listVideos,
    listAudios,
    listImages,
    getVideo,
    getAudio,
    getImage,
    uploadMedia,
    searchYoutube,
    searchVideosByTitle,
    updateVideo,
    generateThumbnail,
    listThumbnails,
    getMediaDownloadUrl,
    transcodeMedia,
    getTranscodeStatus,
    deleteVideo,
    deleteAudio,
    deleteImage,
    removeVideoStorage,
  ],
};
