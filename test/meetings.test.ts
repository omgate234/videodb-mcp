import { describe, expect, it } from "vitest";
import { meetings } from "@/lib/toolsets/meetings";
import { call, fakeConnection, toolNamed } from "./harness";

describe("meetings", () => {
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
    const t = toolNamed(meetings, "record_meeting");
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
    const { data } = await call(toolNamed(meetings, "record_meeting"), { meeting_url: "https://zoom.us/j/1", callback_url: "https://hook/meeting", time_zone: "Asia/Kolkata" }, vdb);
    expect(data).toEqual({ accepted: true, id: "meet-2", collection_id: "default", status: "initializing" });
  });

  it("get_meeting refreshes via GET collection/{id}/meeting/{mid}", async () => {
    const vdb = fakeConnection({
      "GET collection/c-1/meeting/meet-1": { status: "done", videoId: "m-5", meetingTitle: "Standup", speakerTimeline: { a: [[0, 3]] } },
    });
    const t = toolNamed(meetings, "get_meeting");
    expect(t.kind).toBe("read");
    const { data, isError } = await call(t, { meeting_id: "meet-1", collection_id: "c-1" }, vdb);
    expect(isError).toBe(false);
    expect(vdb.http.get).toHaveBeenCalledWith(["collection", "c-1", "meeting", "meet-1"]);
    expect(data).toEqual({ id: "meet-1", collection_id: "c-1", status: "done", meeting_title: "Standup", video_id: "m-5", speaker_timeline: { a: [[0, 3]] } });
  });
});
