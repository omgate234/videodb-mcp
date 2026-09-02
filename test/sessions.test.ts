import { describe, expect, it } from "vitest";
import { sessions } from "@/lib/toolsets/sessions";
import { call, fakeConnection, toolNamed } from "./harness";

const CHANNELS = [{ channelId: "display:1", name: "Screen", type: "video", isPrimary: true, store: true }];
const SESSION = {
  status: "stopped",
  endUserId: "user_abc",
  clientId: "client-1",
  callbackUrl: "https://hook",
  metadata: { app: "desktop" },
  exportedVideoId: "m-9",
  createdAt: 1700000000,
  channels: CHANNELS,
  primaryVideoChannelId: "display:1",
  exportStatus: "exported",
};

describe("sessions", () => {
  it("record_meeting posts snake_case config and returns the trimmed meeting", async () => {
    const vdb = fakeConnection({
      "POST collection/c-1/meeting/record": (body: any) => {
        expect(body).toEqual({
          meeting_url: "https://meet.google.com/abc-defg-hij",
          bot_name: "Notetaker",
          bot_image_url: undefined,
          meeting_title: "Standup",
          callback_url: undefined,
          callback_data: {},
          time_zone: "UTC",
        });
        return { meetingId: "meet-1", status: "initializing", botName: "Notetaker", meetingTitle: "Standup", meetingUrl: body.meeting_url, timeZone: "UTC" };
      },
    });
    const t = toolNamed(sessions, "record_meeting");
    expect(t.kind).toBe("create");
    const { data, isError } = await call(t, { meeting_url: "https://meet.google.com/abc-defg-hij", collection_id: "c-1", bot_name: "Notetaker", meeting_title: "Standup" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ id: "meet-1", collection_id: "c-1", status: "initializing", bot_name: "Notetaker", meeting_title: "Standup", meeting_url: "https://meet.google.com/abc-defg-hij", time_zone: "UTC" });
  });

  it("record_meeting with callback_url passes it through and returns accepted", async () => {
    const vdb = fakeConnection({
      "POST collection/default/meeting/record": (body: any) => {
        expect(body).toMatchObject({ callback_url: "https://hook/meeting", time_zone: "Asia/Kolkata" });
        return { meetingId: "meet-2", status: "initializing" };
      },
    });
    const { data } = await call(toolNamed(sessions, "record_meeting"), { meeting_url: "https://zoom.us/j/1", callback_url: "https://hook/meeting", time_zone: "Asia/Kolkata" }, vdb);
    expect(data).toEqual({ accepted: true, id: "meet-2", collection_id: "default", status: "initializing" });
  });

  it("get_meeting refreshes via GET collection/{id}/meeting/{mid}", async () => {
    const vdb = fakeConnection({
      "GET collection/c-1/meeting/meet-1": { status: "done", videoId: "m-5", meetingTitle: "Standup", speakerTimeline: { a: [[0, 3]] } },
    });
    const t = toolNamed(sessions, "get_meeting");
    expect(t.kind).toBe("read");
    const { data, isError } = await call(t, { meeting_id: "meet-1", collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(vdb.http.get).toHaveBeenCalledWith(["collection", "c-1", "meeting", "meet-1"]);
    expect(data).toEqual({ id: "meet-1", collection_id: "c-1", status: "done", meeting_title: "Standup", video_id: "m-5", speaker_timeline: { a: [[0, 3]] } });
  });

  it("list_capture_sessions forwards the status filter and trims sessions", async () => {
    const vdb = fakeConnection({ "GET collection/c-1/capture/session": { sessions: [{ id: "cap-1", ...SESSION }] } });
    const t = toolNamed(sessions, "list_capture_sessions");
    expect(t.kind).toBe("read");
    const { data, isError } = await call(t, { collection_id: "c-1", status: "stopped" }, vdb);
    expect(isError).toBe(false);
    expect(vdb.http.get).toHaveBeenCalledWith(["collection", "c-1", "capture", "session"], { params: { status: "stopped" } });
    expect(data).toEqual([
      {
        id: "cap-1",
        collection_id: "c-1",
        status: "stopped",
        end_user_id: "user_abc",
        exported_video_id: "m-9",
        export_status: "exported",
        primary_video_channel_id: "display:1",
        channels: [{ channel_id: "display:1", name: "Screen", type: "video", is_primary: true, store: true }],
        created_at: 1700000000,
        metadata: { app: "desktop" },
      },
    ]);
  });

  it("get_capture_session returns the session with trimmed rtstreams", async () => {
    const vdb = fakeConnection({
      "GET collection/c-1/capture/session/cap-1": {
        ...SESSION,
        rtstreams: [{ rtstreamId: "rts-1", channelId: "mic:default", mediaTypes: ["audio"], status: "connected", sampleRate: 16000 }],
      },
    });
    const t = toolNamed(sessions, "get_capture_session");
    expect(t.kind).toBe("read");
    const { data, isError } = await call(t, { session_id: "cap-1", collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(vdb.http.get).toHaveBeenCalledWith(["collection", "c-1", "capture", "session", "cap-1"]);
    expect(data).toMatchObject({ id: "cap-1", collection_id: "c-1", status: "stopped", exported_video_id: "m-9", primary_video_channel_id: "display:1" });
    expect((data as any).rtstreams).toEqual([{ id: "rts-1", channel_id: "mic:default", media_types: ["audio"], status: "connected" }]);
    expect(data).not.toHaveProperty("client_id");
  });

  it("export_capture_session posts the channel and returns export status + urls", async () => {
    const vdb = fakeConnection({
      "POST collection/c-1/capture/session/cap-1/export": (body: any) => {
        expect(body).toEqual({ video_channel_id: "display:1" });
        return { exportStatus: "exported", videoId: "m-9", streamUrl: "https://stream/cap.m3u8", playerUrl: "https://player/cap" };
      },
    });
    const t = toolNamed(sessions, "export_capture_session");
    expect(t.kind).toBe("create");
    expect(t.retryWith).toBe("get_capture_session");
    const { data, isError } = await call(t, { session_id: "cap-1", collection_id: "c-1", video_channel_id: "display:1" }, vdb);
    expect(isError).toBe(false);
    expect(vdb.http.get).not.toHaveBeenCalled();
    expect(data).toEqual({ session_id: "cap-1", export_status: "exported", video_id: "m-9", stream_url: "https://stream/cap.m3u8", player_url: "https://player/cap" });
  });
});
