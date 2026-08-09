import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { openAccessToken, mcpResourceUrl } from "@/lib/oauth";
import * as vdb from "@/lib/videodb";

/**
 * VideoDB MCP endpoint (Streamable HTTP).
 *
 * Tool design follows Anthropic's connector directory review criteria:
 * read and write operations are separate tools, every tool carries a title
 * plus readOnlyHint/destructiveHint annotations, and no tool exposes
 * AI media *generation* (not accepted in the directory).
 */

// Allow long-running VideoDB jobs (upload/index/compile) to finish.
// Requires Fluid compute on Vercel (default on new projects); Pro plans can raise to 800.
export const maxDuration = 300;

const COLLECTION_ID = z
  .string()
  .default("default")
  .describe('VideoDB collection ID. Defaults to "default" (every account has one).');

const TIMELINE = z
  .array(z.tuple([z.number().min(0), z.number().min(0)]))
  .min(1)
  .describe("Segments as [start_seconds, end_seconds] pairs, e.g. [[10, 25], [60, 90]].");

/** Pull the VideoDB API key out of the verified bearer token for this request. */
function apiKeyFrom(ctx: unknown): string {
  const c = ctx as Record<string, any> | undefined;
  const authInfo = c?.http?.authInfo ?? c?.authInfo ?? c?.requestInfo?.authInfo;
  const key = authInfo?.extra?.videodbApiKey;
  if (typeof key !== "string" || !key) {
    throw new Error("Not authenticated with VideoDB. Connect the VideoDB connector first.");
  }
  return key;
}

function ok(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) },
    ],
  };
}

function fail(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

type ToolResult = ReturnType<typeof ok> | ReturnType<typeof fail>;

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
}

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

const handler = createMcpHandler(
  (server) => {
    // ---------------- read tools ----------------

    server.registerTool(
      "list_collections",
      {
        title: "List collections",
        description:
          "List all collections in the connected VideoDB account, with their IDs, names, and descriptions.",
        inputSchema: z.object({}),
        annotations: { title: "List collections", ...READ },
      },
      async (_args, ctx) => run(() => vdb.listCollections(apiKeyFrom(ctx)))
    );

    server.registerTool(
      "list_videos",
      {
        title: "List videos",
        description:
          "List videos in a VideoDB collection: IDs, names, durations, and playable stream/player URLs.",
        inputSchema: z.object({ collection_id: COLLECTION_ID }),
        annotations: { title: "List videos", ...READ },
      },
      async ({ collection_id }, ctx) => run(() => vdb.listVideos(apiKeyFrom(ctx), collection_id))
    );

    server.registerTool(
      "get_video",
      {
        title: "Get video details",
        description:
          "Get metadata for one video: name, duration, thumbnail, stream URL, and a player URL for watching it in a browser.",
        inputSchema: z.object({
          video_id: z.string().describe("VideoDB video ID (starts with m-)."),
          collection_id: COLLECTION_ID,
        }),
        annotations: { title: "Get video details", ...READ },
      },
      async ({ video_id, collection_id }, ctx) =>
        run(() => vdb.getVideo(apiKeyFrom(ctx), video_id, collection_id))
    );

    server.registerTool(
      "get_transcript",
      {
        title: "Get transcript",
        description:
          "Get the transcript of a video, either as plain text or with word-level timestamps. Generates the transcript on first call if the video hasn't been transcribed yet (may take a minute).",
        inputSchema: z.object({
          video_id: z.string().describe("VideoDB video ID."),
          timestamped: z
            .boolean()
            .default(false)
            .describe("true → word-level timestamps; false → plain text."),
        }),
        annotations: { title: "Get transcript", ...READ },
      },
      async ({ video_id, timestamped }, ctx) =>
        run(() => vdb.getTranscript(apiKeyFrom(ctx), video_id, timestamped))
    );

    server.registerTool(
      "search_video",
      {
        title: "Search inside a video",
        description:
          "Search within one video and get matching moments with start/end timestamps, text, and relevance scores. Semantic or keyword search over the spoken-word index (run index_spoken_words first) or over a scene index for visual content (run index_scenes first).",
        inputSchema: z.object({
          video_id: z.string().describe("VideoDB video ID."),
          query: z.string().describe("What to look for, e.g. 'moments where pricing is discussed'."),
          search_type: z.enum(["semantic", "keyword"]).default("semantic"),
          index_type: z.enum(["spoken_word", "scene"]).default("spoken_word"),
          result_threshold: z.number().int().min(1).max(50).default(5).describe("Max results."),
        }),
        annotations: { title: "Search inside a video", ...READ },
      },
      async ({ video_id, query, search_type, index_type, result_threshold }, ctx) =>
        run(() =>
          vdb.searchVideo(apiKeyFrom(ctx), video_id, query, {
            searchType: search_type,
            indexType: index_type,
            resultThreshold: result_threshold,
          })
        )
    );

    server.registerTool(
      "search_collection",
      {
        title: "Search across a collection",
        description:
          "Semantic search across every indexed video in a collection. Returns matching moments grouped by video, with timestamps and scores. Only searches videos that have been indexed.",
        inputSchema: z.object({
          collection_id: COLLECTION_ID,
          query: z.string().describe("Natural-language search query."),
          index_type: z.enum(["spoken_word", "scene"]).default("spoken_word"),
          result_threshold: z.number().int().min(1).max(50).default(5).describe("Max results."),
        }),
        annotations: { title: "Search across a collection", ...READ },
      },
      async ({ collection_id, query, index_type, result_threshold }, ctx) =>
        run(() =>
          vdb.searchCollection(apiKeyFrom(ctx), collection_id, query, {
            indexType: index_type,
            resultThreshold: result_threshold,
          })
        )
    );

    server.registerTool(
      "list_scene_indexes",
      {
        title: "List scene indexes",
        description:
          "List the visual (scene) indexes that exist for a video, including their IDs and names. Useful before running a scene search.",
        inputSchema: z.object({
          video_id: z.string().describe("VideoDB video ID."),
          collection_id: COLLECTION_ID,
        }),
        annotations: { title: "List scene indexes", ...READ },
      },
      async ({ video_id, collection_id }, ctx) =>
        run(() => vdb.listSceneIndexes(apiKeyFrom(ctx), video_id, collection_id))
    );

    // ---------------- write tools (non-destructive) ----------------

    server.registerTool(
      "create_collection",
      {
        title: "Create collection",
        description: "Create a new VideoDB collection to organize videos.",
        inputSchema: z.object({
          name: z.string().describe("Collection name."),
          description: z.string().optional().describe("Optional description."),
        }),
        annotations: { title: "Create collection", ...WRITE },
      },
      async ({ name, description }, ctx) =>
        run(() => vdb.createCollection(apiKeyFrom(ctx), name, description))
    );

    server.registerTool(
      "upload_media",
      {
        title: "Upload media from URL",
        description:
          "Upload a video, audio file, or image into VideoDB from a public URL (direct file links and YouTube URLs both work). Waits for processing and returns the created media object with its ID and player URL. Long videos may take a few minutes.",
        inputSchema: z.object({
          url: z.string().url().describe("Public URL of the media (or a YouTube link)."),
          collection_id: COLLECTION_ID,
          name: z.string().optional().describe("Optional display name."),
          media_type: z
            .enum(["video", "audio", "image"])
            .optional()
            .describe("Force a media type; auto-detected if omitted."),
        }),
        annotations: { title: "Upload media from URL", ...WRITE },
      },
      async ({ url, collection_id, name, media_type }, ctx) =>
        run(() => vdb.uploadMedia(apiKeyFrom(ctx), collection_id, url, { name, media_type }))
    );

    server.registerTool(
      "index_spoken_words",
      {
        title: "Index spoken words",
        description:
          "Transcribe and index everything spoken in a video so it becomes searchable with search_video / search_collection. Run once per video; takes roughly real-time ÷ 10.",
        inputSchema: z.object({
          video_id: z.string().describe("VideoDB video ID."),
          language_code: z
            .string()
            .optional()
            .describe("Optional language hint, e.g. 'en_us', 'hi', 'es'."),
        }),
        annotations: { title: "Index spoken words", ...WRITE },
      },
      async ({ video_id, language_code }, ctx) =>
        run(async () => {
          await vdb.indexSpokenWords(apiKeyFrom(ctx), video_id, language_code);
          return { indexed: true, video_id, index_type: "spoken_word" };
        })
    );

    server.registerTool(
      "index_scenes",
      {
        title: "Index scenes (visual)",
        description:
          "Visually index a video: detects scene changes and describes what's on screen so visual moments become searchable (index_type='scene'). Optionally steer descriptions with a prompt, e.g. 'focus on products shown'.",
        inputSchema: z.object({
          video_id: z.string().describe("VideoDB video ID."),
          prompt: z.string().optional().describe("Optional instruction for how to describe scenes."),
          name: z.string().optional().describe("Optional name for this scene index."),
        }),
        annotations: { title: "Index scenes (visual)", ...WRITE },
      },
      async ({ video_id, prompt, name }, ctx) =>
        run(() => vdb.indexScenes(apiKeyFrom(ctx), video_id, { prompt, name }))
    );

    server.registerTool(
      "generate_clip",
      {
        title: "Generate clip",
        description:
          "Cut a clip (or a supercut of several segments) from a single video without re-encoding. Returns a streamable URL and a player URL that can be watched in any browser.",
        inputSchema: z.object({
          video_id: z.string().describe("VideoDB video ID."),
          timeline: TIMELINE,
          collection_id: COLLECTION_ID,
        }),
        annotations: { title: "Generate clip", ...WRITE },
      },
      async ({ video_id, timeline, collection_id }, ctx) =>
        run(() =>
          vdb.generateStream(apiKeyFrom(ctx), video_id, timeline as [number, number][], collection_id)
        )
    );

    server.registerTool(
      "compile_clips",
      {
        title: "Compile clips across videos",
        description:
          "Stitch moments from one or more videos into a single new stream — e.g. turn search results into a highlight reel. Returns stream and player URLs.",
        inputSchema: z.object({
          clips: z
            .array(
              z.object({
                video_id: z.string(),
                collection_id: z.string().default("default"),
                shots: TIMELINE,
              })
            )
            .min(1)
            .describe("Clips in playback order."),
        }),
        annotations: { title: "Compile clips across videos", ...WRITE },
      },
      async ({ clips }, ctx) =>
        run(() =>
          vdb.compileClips(
            apiKeyFrom(ctx),
            clips.map((c) => ({
              video_id: c.video_id,
              collection_id: c.collection_id,
              shots: c.shots as [number, number][],
            }))
          )
        )
    );

    server.registerTool(
      "add_subtitles",
      {
        title: "Add subtitles",
        description:
          "Burn subtitles into a video from its transcript (requires index_spoken_words first). Returns a new stream + player URL with subtitles rendered.",
        inputSchema: z.object({
          video_id: z.string().describe("VideoDB video ID."),
          font_name: z.string().optional().describe("Font family, default Arial."),
          font_size: z.number().int().min(8).max(72).optional().describe("Font size, default 18."),
          bold: z.boolean().optional(),
          italic: z.boolean().optional(),
        }),
        annotations: { title: "Add subtitles", ...WRITE },
      },
      async ({ video_id, font_name, font_size, bold, italic }, ctx) =>
        run(() =>
          vdb.addSubtitles(apiKeyFrom(ctx), video_id, {
            ...(font_name ? { font_name } : {}),
            ...(font_size ? { font_size } : {}),
            ...(bold !== undefined ? { bold } : {}),
            ...(italic !== undefined ? { italic } : {}),
          })
        )
    );

    server.registerTool(
      "generate_thumbnail",
      {
        title: "Generate thumbnail",
        description:
          "Get the default thumbnail of a video, or generate one from a specific timestamp (in seconds).",
        inputSchema: z.object({
          video_id: z.string().describe("VideoDB video ID."),
          time_seconds: z
            .number()
            .min(0)
            .optional()
            .describe("Timestamp to capture; omit for the default thumbnail."),
        }),
        annotations: { title: "Generate thumbnail", ...WRITE },
      },
      async ({ video_id, time_seconds }, ctx) =>
        run(() => vdb.generateThumbnail(apiKeyFrom(ctx), video_id, time_seconds))
    );

    // ---------------- destructive tools ----------------

    server.registerTool(
      "delete_video",
      {
        title: "Delete video",
        description:
          "Permanently delete a video from a VideoDB collection. This cannot be undone.",
        inputSchema: z.object({
          video_id: z.string().describe("VideoDB video ID to delete."),
          collection_id: COLLECTION_ID,
        }),
        annotations: { title: "Delete video", ...DESTRUCTIVE },
      },
      async ({ video_id, collection_id }, ctx) =>
        run(async () => {
          await vdb.deleteVideo(apiKeyFrom(ctx), video_id, collection_id);
          return { deleted: true, video_id };
        })
    );
  },
  {
    serverInfo: { name: "videodb", version: "1.0.0" },
  }
);

/** Verify our sealed bearer tokens and expose the VideoDB API key to tools. */
const verifyToken = async (req: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined;
  const payload = openAccessToken(bearerToken);
  if (!payload) return undefined;

  // RFC 8707 audience check: the token must have been minted for this MCP URL.
  const expected = mcpResourceUrl(req);
  if (payload.aud && payload.aud !== expected) return undefined;

  return {
    token: bearerToken,
    clientId: payload.client_id,
    scopes: payload.scope ? payload.scope.split(" ") : ["videodb"],
    expiresAt: payload.exp,
    extra: { videodbApiKey: payload.key },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
});

export { authHandler as GET, authHandler as POST };
