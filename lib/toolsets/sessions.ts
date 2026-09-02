import { z } from "zod";
import { CaptureSession } from "videodb";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID, CALLBACK_URL } from "@/lib/mcp/schemas";
import { collection } from "@/lib/videodb/resolve";
import type { Connection } from "@/lib/videodb/client";
import { pick } from "@/lib/videodb/serialize";

/**
 * Meeting recorder bots + desktop capture sessions. Capture sessions are
 * created and recorded by the VideoDB desktop capture client; here we only
 * observe and export them.
 */

const MEETING_ID = z.string().describe("VideoDB meeting recording ID returned by record_meeting.");
const SESSION_ID = z.string().describe("VideoDB capture session ID (starts with cap-).");
const SESSION_STATUS = z.enum(["created", "starting", "active", "stopped", "exported", "failed"]);

const MEETING_KEYS = ["id", "collection_id", "status", "bot_name", "meeting_title", "meeting_url", "time_zone", "video_id", "speaker_timeline"];
const SESSION_KEYS = ["id", "collection_id", "status", "end_user_id", "exported_video_id", "export_status", "primary_video_channel_id", "channels", "created_at", "metadata"];
const RTSTREAM_KEYS = ["id", "channel_id", "media_types", "status"];

const CAPTURE_CLIENT_NOTE =
  "Capture sessions are created and recorded by the VideoDB desktop capture client; this connector only observes and exports them.";

// Shell needs only ids; refresh() is the same GET as getCaptureSession but also hydrates rtstreams.
const sessionShell = (vdb: Connection, collectionId: string, id: string) =>
  new CaptureSession(vdb.vhttp, { id, collectionId });

const sessionToPlain = (s: CaptureSession) => ({
  ...pick(s, SESSION_KEYS),
  rtstreams: s.rtstreams.map((r) => pick(r, RTSTREAM_KEYS)),
});

const recordMeeting = defineTool({
  name: "record_meeting",
  title: "Record meeting",
  description:
    "Send a VideoDB recorder bot to a Zoom, Google Meet or Microsoft Teams meeting URL. Returns immediately with the meeting ID and status (initializing, joined, processing or done); the recording appears as a video (video_id) once status is done. Poll with get_meeting.",
  kind: "create",
  input: z.object({
    meeting_url: z.string().url().describe("Join URL of the meeting the bot should record."),
    collection_id: COLLECTION_ID,
    bot_name: z.string().optional().describe("Display name the bot joins with."),
    bot_image_url: z.string().url().optional().describe("Avatar image URL for the bot."),
    meeting_title: z.string().optional().describe("Title for the resulting recording."),
    time_zone: z.string().default("UTC").describe("IANA time zone for the recording metadata, e.g. America/New_York."),
    callback_url: CALLBACK_URL,
  }),
  retryWith: "get_meeting",
  handler: async ({ meeting_url, collection_id, bot_name, bot_image_url, meeting_title, time_zone, callback_url }, vdb) => {
    const meeting = await collection(vdb, collection_id).recordMeeting({
      meetingUrl: meeting_url,
      botName: bot_name,
      botImageUrl: bot_image_url,
      meetingTitle: meeting_title,
      timeZone: time_zone,
      callbackUrl: callback_url,
    });
    const out = pick(meeting, MEETING_KEYS);
    return callback_url ? { accepted: true, ...out } : out;
  },
});

const getMeeting = defineTool({
  name: "get_meeting",
  title: "Get meeting recording status",
  description:
    "Get the current state of a meeting recorder bot started with record_meeting: status (initializing, joined, processing, done), the recorded video_id once done, and the speaker timeline when available.",
  kind: "read",
  input: z.object({ meeting_id: MEETING_ID, collection_id: COLLECTION_ID }),
  handler: async ({ meeting_id, collection_id }, vdb) => {
    return pick(await collection(vdb, collection_id).getMeeting(meeting_id), MEETING_KEYS);
  },
});

const listCaptureSessions = defineTool({
  name: "list_capture_sessions",
  title: "List capture sessions",
  description: `List desktop capture sessions in a collection with their status, channels and exported video ID. ${CAPTURE_CLIENT_NOTE}`,
  kind: "read",
  input: z.object({
    collection_id: COLLECTION_ID,
    status: SESSION_STATUS.optional().describe("Only return sessions in this status."),
  }),
  handler: async ({ collection_id, status }, vdb) => {
    const sessions = await collection(vdb, collection_id).listCaptureSessions({ status });
    return sessions.map((s) => pick(s, SESSION_KEYS));
  },
});

const getCaptureSession = defineTool({
  name: "get_capture_session",
  title: "Get capture session",
  description: `Get one desktop capture session: status (created, starting, active, stopped, exported, failed), channels, export status, exported video ID and the real-time streams (id, channel, media types) recorded in it. ${CAPTURE_CLIENT_NOTE}`,
  kind: "read",
  input: z.object({ session_id: SESSION_ID, collection_id: COLLECTION_ID }),
  handler: async ({ session_id, collection_id }, vdb) => {
    const session = sessionShell(vdb, collection_id, session_id);
    await session.refresh();
    return sessionToPlain(session);
  },
});

const exportCaptureSession = defineTool({
  name: "export_capture_session",
  title: "Export capture session",
  description: `Export a stopped desktop capture session's recording as a VideoDB video. Returns export_status "exporting" while in progress; call again (or use get_capture_session) until it is "exported" with video_id and stream/player URLs. ${CAPTURE_CLIENT_NOTE}`,
  kind: "create",
  input: z.object({
    session_id: SESSION_ID,
    collection_id: COLLECTION_ID,
    video_channel_id: z.string().optional().describe("Channel ID of the video to export; defaults to the session's primary video channel."),
  }),
  retryWith: "get_capture_session",
  handler: async ({ session_id, collection_id, video_channel_id }, vdb) => {
    const result = await sessionShell(vdb, collection_id, session_id).export(video_channel_id);
    return { session_id, ...result };
  },
});

export const sessions: Toolset = {
  name: "sessions",
  description: "Meeting recording bots and desktop capture sessions.",
  defaultEnabled: false,
  tools: [recordMeeting, getMeeting, listCaptureSessions, getCaptureSession, exportCaptureSession],
};
