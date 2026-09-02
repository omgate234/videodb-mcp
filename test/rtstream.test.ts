import { describe, expect, it } from "vitest";
import { rtstream } from "@/lib/toolsets/rtstream";
import { call, fakeConnection, toolNamed } from "./harness";

const RT = { id: "rts-1", name: "Gate cam", collectionId: "c-1", status: "connected", sampleRate: 30, mediaTypes: ["video"], createdAt: "2026-01-01T00:00:00Z" };
const RT_PLAIN = { id: "rts-1", name: "Gate cam", collection_id: "c-1", status: "connected", sample_rate: 30, media_types: ["video"], created_at: RT.createdAt };
const SCENE_INDEX = { rtstreamIndexId: "rsi-1", extractionType: "time_based", extractionConfig: { time: 2, frameCount: 5 }, prompt: "Describe", name: "gate", status: "connected" };
const SCENE_INDEX_PLAIN = { rtstream_index_id: "rsi-1", rtstream_id: "rts-1", extraction_type: "time_based", extraction_config: { time: 2, frame_count: 5 }, prompt: "Describe", name: "gate", status: "connected" };
const UNDERSTANDING = { understandingId: "und-1", status: "running", store: true, segmentation: { type: "time", window: "5s" }, analyzers: [{ type: "vlm", name: "scene" }], outputs: { scene: { understandingId: "und-1", output: "scene" } } };
const INDEX = { indexId: "idx-1", name: "live_scene", status: "running", useFor: ["semantic"], sourceUnderstandingId: "und-1", output: "scene" };
const INDEX_PLAIN = { id: "idx-1", rtstream_id: "rts-1", name: "live_scene", status: "running", use_for: ["semantic"], source_understanding_id: "und-1", output: "scene" };

const t = (name: string) => toolNamed(rtstream, name);

describe("rtstream: streams", () => {
  it("connect_rtstream posts the snake_case body and returns the trimmed stream", async () => {
    const vdb = fakeConnection({
      "POST rtstream": (body: any) => {
        expect(body).toEqual({ collection_id: "c-1", url: "rtsp://cam/1", name: "Gate cam", media_types: ["video", "audio"], sample_rate: 10, store: true, enable_transcript: true });
        return RT;
      },
    });
    const { data, isError } = await call(t("connect_rtstream"), { url: "rtsp://cam/1", name: "Gate cam", collection_id: "c-1", media_types: ["video", "audio"], sample_rate: 10, store: true, enable_transcript: true }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual(RT_PLAIN);
  });

  it("list_rtstreams passes filters as query params", async () => {
    const vdb = fakeConnection({ "GET rtstream": { results: [RT] } });
    const { data } = await call(t("list_rtstreams"), { collection_id: "c-1", limit: 5, status: "connected" }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream"], { params: { limit: 5, offset: 0, status: "connected" } });
    expect(data).toEqual([RT_PLAIN]);
  });

  it("get_rtstream hits GET rtstream/{id}", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1": RT });
    const { data } = await call(t("get_rtstream"), { rtstream_id: "rts-1" }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1"]);
    expect(data).toEqual(RT_PLAIN);
  });

  it("set_rtstream_status patches {action} and reports the new status", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1": RT, "PATCH rtstream/rts-1/status": {} });
    expect(t("set_rtstream_status").kind).toBe("update");
    const { data } = await call(t("set_rtstream_status"), { rtstream_id: "rts-1", action: "stop" }, vdb);
    expect(vdb.http.patch).toHaveBeenCalledWith(["rtstream", "rts-1", "status"], { action: "stop" });
    expect(data).toEqual({ rtstream_id: "rts-1", status: "stopped" });
  });

  it("get_rtstream_stream requests the unix window and returns both urls", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1": RT, "GET rtstream/rts-1/stream": { streamUrl: "https://s/seg.m3u8", playerUrl: "https://p/seg" } });
    const { data } = await call(t("get_rtstream_stream"), { rtstream_id: "rts-1", start: 1700000000, end: 1700000060 }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1", "stream"], { params: { start: 1700000000, end: 1700000060 } });
    expect(data).toEqual({ rtstream_id: "rts-1", start: 1700000000, end: 1700000060, stream_url: "https://s/seg.m3u8", player_url: "https://p/seg" });
  });

  it("export_rtstream_recording posts the name and flattens the export result", async () => {
    const vdb = fakeConnection({
      "GET rtstream/rts-1": RT,
      "POST rtstream/rts-1/export": (body: any) => {
        expect(body).toEqual({ name: "Night shift" });
        return { videoId: "m-9", streamUrl: "https://s/rec.m3u8", playerUrl: "https://p/rec", name: "Night shift", duration: 3600 };
      },
    });
    const { data } = await call(t("export_rtstream_recording"), { rtstream_id: "rts-1", name: "Night shift" }, vdb);
    expect(data).toEqual({ video_id: "m-9", stream_url: "https://s/rec.m3u8", player_url: "https://p/rec", name: "Night shift", duration: 3600 });
  });
});

describe("rtstream: transcripts", () => {
  it("get_rtstream_transcript passes paging and time filters", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1": RT, "GET rtstream/rts-1/transcription": { segments: [{ start: 1, end: 2, text: "hi" }], nextPage: false } });
    const { data } = await call(t("get_rtstream_transcript"), { rtstream_id: "rts-1", page: 2, page_size: 50, since: 1700000000 }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1", "transcription"], { params: { engine: undefined, page: 2, page_size: 50, since: 1700000000 } });
    expect(data).toEqual({ segments: [{ start: 1, end: 2, text: "hi" }], next_page: false });
  });

  it("set_rtstream_transcript_status posts start/stop with mode and engine", async () => {
    const vdb = fakeConnection({
      "GET rtstream/rts-1": RT,
      "POST rtstream/rts-1/transcription": (body: any) => {
        expect(body).toEqual({ action: "stop", mode: "force", engine: "assemblyai" });
        return { status: "stopped", startTime: 1, endTime: 2 };
      },
    });
    const { data } = await call(t("set_rtstream_transcript_status"), { rtstream_id: "rts-1", action: "stop", mode: "force" }, vdb);
    expect(data).toEqual({ status: "stopped", start_time: 1, end_time: 2 });
  });
});

describe("rtstream: scene indexes", () => {
  it("index_rtstream_scenes maps window/frame_count to a time_based extraction", async () => {
    const vdb = fakeConnection({
      "GET rtstream/rts-1": RT,
      "POST rtstream/rts-1/index/scene": (body: any) => {
        expect(body).toEqual({ extraction_type: "time_based", extraction_config: { time: 2, frame_count: 5 }, prompt: "Describe", model_name: undefined, model_config: {}, name: "gate" });
        return SCENE_INDEX;
      },
    });
    const { data } = await call(t("index_rtstream_scenes"), { rtstream_id: "rts-1", prompt: "Describe", window_seconds: 2, frame_count: 5, name: "gate" }, vdb);
    expect(data).toEqual(SCENE_INDEX_PLAIN);
  });

  it("index_rtstream_audio posts a transcript extraction with segmenter config", async () => {
    const vdb = fakeConnection({
      "GET rtstream/rts-1": RT,
      "POST rtstream/rts-1/index/scene": (body: any) => {
        expect(body).toEqual({ extraction_type: "transcript", extraction_config: { segmenter: "word", segmentation_value: 10 }, prompt: "Summarise", model_name: undefined, model_config: {}, name: undefined, auto_start_transcript: true });
        return { ...SCENE_INDEX, extractionType: "transcript" };
      },
    });
    const { data } = await call(t("index_rtstream_audio"), { rtstream_id: "rts-1", prompt: "Summarise", segmenter: "word", segment_value: 10 }, vdb);
    expect(data).toEqual({ ...SCENE_INDEX_PLAIN, extraction_type: "transcript" });
  });

  it("index_rtstream_scenes sends frame_count even without window_seconds", async () => {
    const vdb = fakeConnection({
      "GET rtstream/rts-1": RT,
      "POST rtstream/rts-1/index/scene": (body: any) => {
        expect(body.extraction_config).toEqual({ time: 2, frame_count: 10 });
        return SCENE_INDEX;
      },
    });
    const { isError } = await call(t("index_rtstream_scenes"), { rtstream_id: "rts-1", frame_count: 10 }, vdb);
    expect(isError).toBe(false);
  });

  it("index_rtstream_audio sends the segmenter even without segment_value", async () => {
    const vdb = fakeConnection({
      "GET rtstream/rts-1": RT,
      "POST rtstream/rts-1/index/scene": (body: any) => {
        expect(body.extraction_config).toEqual({ segmenter: "sentence", segmentation_value: 10 });
        return { ...SCENE_INDEX, extractionType: "transcript" };
      },
    });
    const { isError } = await call(t("index_rtstream_audio"), { rtstream_id: "rts-1", segmenter: "sentence" }, vdb);
    expect(isError).toBe(false);
  });

  it("list_rtstream_scene_indexes lists trimmed indexes", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1": RT, "GET rtstream/rts-1/index/scene": { sceneIndexes: [SCENE_INDEX] } });
    const { data } = await call(t("list_rtstream_scene_indexes"), { rtstream_id: "rts-1" }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1", "index", "scene"]);
    expect(data).toEqual([SCENE_INDEX_PLAIN]);
  });

  it("get_rtstream_scenes reads the index records without a hydrating GET", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1/index/scene/rsi-1": { sceneIndexRecords: [{ start: 1, end: 3, description: "a car" }], nextPage: true } });
    const { data } = await call(t("get_rtstream_scenes"), { rtstream_id: "rts-1", scene_index_id: "rsi-1", start: 1, end: 100, page_size: 10 }, vdb);
    expect(vdb.http.get).toHaveBeenCalledTimes(1);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1", "index", "scene", "rsi-1"], { params: { page: 1, page_size: 10, start: 1, end: 100 } });
    expect(data).toEqual({ rtstream_id: "rts-1", scene_index_id: "rsi-1", scenes: [{ start: 1, end: 3, description: "a car" }], next_page: true });
  });

  it("set_rtstream_scene_index_status patches the index status", async () => {
    const vdb = fakeConnection({ "PATCH rtstream/rts-1/index/scene/rsi-1/status": {} });
    const { data } = await call(t("set_rtstream_scene_index_status"), { rtstream_id: "rts-1", scene_index_id: "rsi-1", action: "start" }, vdb);
    expect(vdb.http.patch).toHaveBeenCalledWith(["rtstream", "rts-1", "index", "scene", "rsi-1", "status"], { action: "start" });
    expect(data).toEqual({ rtstream_id: "rts-1", scene_index_id: "rsi-1", status: "connected" });
  });

  it("search_rtstream posts the query and flattens shots", async () => {
    const vdb = fakeConnection({
      "GET rtstream/rts-1": RT,
      "POST rtstream/rts-1/search": (body: any) => {
        expect(body).toEqual({ query: "person at gate", scene_index_id: "rsi-1", result_threshold: 3, score_threshold: 0.5 });
        return { results: [{ start: 1700000000, end: 1700000002, text: "a person walks in", score: 0.9, sceneIndexId: "rsi-1" }] };
      },
    });
    const { data } = await call(t("search_rtstream"), { rtstream_id: "rts-1", query: "person at gate", scene_index_id: "rsi-1", result_threshold: 3, score_threshold: 0.5 }, vdb);
    expect(data).toEqual({ shots: [{ rtstream_id: "rts-1", rtstream_name: "Gate cam", start: 1700000000, end: 1700000002, text: "a person walks in", search_score: 0.9, scene_index_id: "rsi-1" }] });
  });
});

describe("rtstream: events & alerts", () => {
  it("create_event posts prompt + label and returns the event id", async () => {
    const vdb = fakeConnection({
      "POST rtstream/event": (body: any) => {
        expect(body).toEqual({ event_prompt: "someone enters", label: "entry" });
        return { eventId: "ev-1" };
      },
    });
    const { data } = await call(t("create_event"), { event_prompt: "someone enters", label: "entry" }, vdb);
    expect(data).toEqual({ event_id: "ev-1", label: "entry" });
  });

  it("list_events caps the list at 200 and flags truncation", async () => {
    const events = Array.from({ length: 205 }, (_, i) => ({ eventId: `ev-${i}`, label: "x" }));
    const vdb = fakeConnection({ "GET rtstream/event": { events } });
    const { data } = await call(t("list_events"), {}, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "event"]);
    expect((data as any).events).toHaveLength(200);
    expect((data as any).events[0]).toEqual({ event_id: "ev-0", label: "x" });
    expect((data as any).truncated).toBe(true);
  });

  it("create_rtstream_alert posts to the scene-index alert path by default", async () => {
    const vdb = fakeConnection({
      "POST rtstream/rts-1/index/rsi-1/alert": (body: any) => {
        expect(body).toEqual({ event_id: "ev-1", callback_url: "https://hook.example/alert" });
        return { alertId: "al-1" };
      },
    });
    const { data } = await call(t("create_rtstream_alert"), { rtstream_id: "rts-1", index_id: "rsi-1", event_id: "ev-1", callback_url: "https://hook.example/alert" }, vdb);
    expect(data).toEqual({ alert_id: "al-1", rtstream_id: "rts-1", index_id: "rsi-1", event_id: "ev-1" });
  });

  it("list_rtstream_alerts with index_kind=index reads the v2 index alert path", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1/indexes/idx-1/alert": { alerts: [{ alertId: "al-1", eventId: "ev-1", enabled: true }] } });
    const { data } = await call(t("list_rtstream_alerts"), { rtstream_id: "rts-1", index_id: "idx-1", index_kind: "index" }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1", "indexes", "idx-1", "alert"]);
    expect(data).toEqual({ rtstream_id: "rts-1", index_id: "idx-1", alerts: [{ alert_id: "al-1", event_id: "ev-1", enabled: true }] });
  });

  it("set_rtstream_alert_status patches enable/disable", async () => {
    const vdb = fakeConnection({ "PATCH rtstream/rts-1/index/rsi-1/alert/al-1/status": {} });
    const { data } = await call(t("set_rtstream_alert_status"), { rtstream_id: "rts-1", index_id: "rsi-1", alert_id: "al-1", action: "disable" }, vdb);
    expect(vdb.http.patch).toHaveBeenCalledWith(["rtstream", "rts-1", "index", "rsi-1", "alert", "al-1", "status"], { action: "disable" });
    expect(data).toEqual({ rtstream_id: "rts-1", index_id: "rsi-1", alert_id: "al-1", enabled: false });
  });
});

describe("rtstream: understand → index (v2)", () => {
  it("understand_rtstream builds a single vlm analyzer with time segmentation", async () => {
    const vdb = fakeConnection({
      "GET rtstream/rts-1": RT,
      "POST rtstream/rts-1/understand": (body: any) => {
        expect(body).toEqual({
          segmentation: { type: "time", window: "5s" },
          analyzers: [{ type: "vlm", name: "scene", sampling: { frame_count: 2 }, config: { prompt: "Watch the gate" } }],
          store: true,
        });
        return UNDERSTANDING;
      },
    });
    const { data } = await call(t("understand_rtstream"), { rtstream_id: "rts-1", prompt: "Watch the gate" }, vdb);
    expect(data).toEqual({ id: "und-1", rtstream_id: "rts-1", status: "running", store: true, segmentation: { type: "time", window: "5s" }, analyzers: [{ type: "vlm", name: "scene" }], outputs: { scene: { understanding_id: "und-1", output: "scene" } } });
  });

  it("list_rtstream_understandings lists trimmed understandings", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1": RT, "GET rtstream/rts-1/understand": { understandings: [UNDERSTANDING] } });
    const { data } = await call(t("list_rtstream_understandings"), { rtstream_id: "rts-1" }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1", "understand"]);
    expect((data as any[]).map((u) => u.id)).toEqual(["und-1"]);
  });

  it("set_rtstream_understanding_status patches the understanding status", async () => {
    const vdb = fakeConnection({ "PATCH rtstream/rts-1/understand/und-1/status": {} });
    const { data } = await call(t("set_rtstream_understanding_status"), { rtstream_id: "rts-1", understanding_id: "und-1", action: "stop" }, vdb);
    expect(vdb.http.patch).toHaveBeenCalledWith(["rtstream", "rts-1", "understand", "und-1", "status"], { action: "stop" });
    expect(data).toEqual({ rtstream_id: "rts-1", understanding_id: "und-1", status: "stopped" });
  });

  it("get_rtstream_understanding_records passes the window, output and paging", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1/understand/und-1/records": { records: [{ start: 1, end: 5, text: "empty gate" }], nextPage: false } });
    const { data } = await call(t("get_rtstream_understanding_records"), { rtstream_id: "rts-1", understanding_id: "und-1", start: 1, end: 100 }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1", "understand", "und-1", "records"], { params: { start: 1, end: 100, output: "scene", page: 1, page_size: 100 } });
    expect(data).toEqual({ records: [{ start: 1, end: 5, text: "empty gate" }], next_page: false });
  });

  it("create_rtstream_index resolves the output descriptor from the understanding and posts it as source", async () => {
    const vdb = fakeConnection({
      "GET rtstream/rts-1": RT,
      "GET rtstream/rts-1/understand/und-1": UNDERSTANDING,
      "POST rtstream/rts-1/indexes": (body: any) => {
        expect(body).toEqual({ source: { understandingId: "und-1", output: "scene" }, name: "live_scene", use_for: ["semantic"] });
        return INDEX;
      },
    });
    const { data } = await call(t("create_rtstream_index"), { rtstream_id: "rts-1", understanding_id: "und-1", name: "live_scene", use_for: ["semantic"] }, vdb);
    expect(data).toEqual(INDEX_PLAIN);
  });

  it("create_rtstream_index errors clearly when the output does not exist", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1": RT, "GET rtstream/rts-1/understand/und-1": UNDERSTANDING });
    const { isError, data } = await call(t("create_rtstream_index"), { rtstream_id: "rts-1", understanding_id: "und-1", output: "faces" }, vdb);
    expect(isError).toBe(true);
    expect(String(data)).toContain('no output "faces"');
  });

  it("list_rtstream_indexes lists trimmed indexes", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1": RT, "GET rtstream/rts-1/indexes": { indexes: [INDEX] } });
    const { data } = await call(t("list_rtstream_indexes"), { rtstream_id: "rts-1" }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1", "indexes"]);
    expect(data).toEqual([INDEX_PLAIN]);
  });

  it("set_rtstream_index_status patches the index status", async () => {
    const vdb = fakeConnection({ "PATCH rtstream/rts-1/indexes/idx-1/status": {} });
    const { data } = await call(t("set_rtstream_index_status"), { rtstream_id: "rts-1", index_id: "idx-1", action: "start" }, vdb);
    expect(vdb.http.patch).toHaveBeenCalledWith(["rtstream", "rts-1", "indexes", "idx-1", "status"], { action: "start" });
    expect(data).toEqual({ rtstream_id: "rts-1", index_id: "idx-1", status: "running" });
  });

  it("get_rtstream_index_records passes optional window and paging", async () => {
    const vdb = fakeConnection({ "GET rtstream/rts-1/indexes/idx-1/records": { records: [{ start: 1, end: 5 }], nextPage: false } });
    const { data } = await call(t("get_rtstream_index_records"), { rtstream_id: "rts-1", index_id: "idx-1", start: 1, page_size: 20 }, vdb);
    expect(vdb.http.get).toHaveBeenCalledWith(["rtstream", "rts-1", "indexes", "idx-1", "records"], { params: { page: 1, page_size: 20, start: 1 } });
    expect(data).toEqual({ records: [{ start: 1, end: 5 }], next_page: false });
  });
});
