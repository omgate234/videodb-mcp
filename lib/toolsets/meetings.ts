import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { COLLECTION_ID, CALLBACK_URL } from "@/lib/mcp/schemas";
import { collection } from "@/lib/videodb/resolve";
import { pick } from "@/lib/videodb/serialize";

/** Meeting recorder bots: send a bot into a call, then poll it for the recorded video. */

const MEETING_ID = z.string().describe("VideoDB meeting recording ID returned by record_meeting.");

const MEETING_KEYS = ["id", "collection_id", "status", "bot_name", "meeting_title", "meeting_url", "time_zone", "video_id", "speaker_timeline"];

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

export const meetings: Toolset = {
  name: "meetings",
  description: "Meeting recording bots.",
  defaultEnabled: true,
  tools: [recordMeeting, getMeeting],
};
