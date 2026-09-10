import { describe, expect, it } from "vitest";
import { jobs } from "@/lib/toolsets/jobs";
import { settle, isVideodbUrl, shapeResult } from "@/lib/videodb/jobs";
import { call, fakeConnection, raw, toolNamed } from "./harness";

const get = toolNamed(jobs, "get_job_result");
const URL_ = "https://api.videodb.io/async-response/job-1";
const GET = { wait: false, convert: false };

describe("get_job_result", () => {
  it("is a read tool that refuses non-VideoDB URLs before any wire call", async () => {
    expect(get.kind).toBe("read");
    const vdb = fakeConnection();
    const { isError, data } = await call(get, { output_url: "https://evil.example/steal?x=1" }, vdb);
    expect(isError).toBe(true);
    expect(String(data)).toContain("VideoDB job URL");
    expect(vdb.http.get).not.toHaveBeenCalled();
  });

  it("returns processing with the same output_url while the job runs", async () => {
    const vdb = fakeConnection({ [`GET ${URL_}`]: raw({ status: "processing", data: { id: "job-1", output_url: URL_ } }) });
    const { data, isError } = await call(get, { output_url: URL_ }, vdb);
    expect(isError).toBe(false);
    expect(vdb.http.get).toHaveBeenCalledWith([URL_], undefined, GET);
    expect(data).toMatchObject({ status: "processing", job_id: "job-1", output_url: URL_, poll_with: "get_job_result" });
  });

  it("treats a 404-shaped processing echo (no id) the same way", async () => {
    const vdb = fakeConnection({ [`GET ${URL_}`]: raw({ status: "processing", data: { output_url: URL_ } }) });
    const { data } = await call(get, { output_url: URL_ }, vdb);
    expect(data).toMatchObject({ status: "processing", output_url: URL_ });
  });

  it("unwraps a finished async-response and trims media records", async () => {
    const vdb = fakeConnection({
      [`GET ${URL_}`]: raw({ status: "done", response: { success: true, data: { id: "m-1", collection_id: "c-1", name: "Y", length: 3, stream_url: "https://s/y.m3u8", user_id: "u" } } }),
    });
    const { data } = await call(get, { output_url: URL_ }, vdb);
    expect(data).toEqual({
      status: "done",
      output_url: URL_,
      result: { id: "m-1", collection_id: "c-1", name: "Y", length: 3, stream_url: "https://s/y.m3u8", player_url: expect.stringContaining("y.m3u8") },
    });
  });

  it("reads a finished /download job (plain {success, data} body)", async () => {
    const dl = "https://api.videodb.io/download/dl-1";
    const vdb = fakeConnection({ [`GET ${dl}`]: raw({ success: true, data: { id: "dl-1", status: "done", download_url: "https://files/x.mp4" } }) });
    const { data } = await call(get, { output_url: dl }, vdb);
    expect(data).toEqual({ status: "done", output_url: dl, result: { id: "dl-1", status: "done", download_url: "https://files/x.mp4" } });
  });

  it("surfaces a failed job as a tool error with the server message", async () => {
    const vdb = fakeConnection({ [`GET ${URL_}`]: raw({ status: "done", response: { success: false, message: "Unsupported codec" } }) });
    const { isError, data } = await call(get, { output_url: URL_ }, vdb);
    expect(isError).toBe(true);
    expect(String(data)).toContain("Unsupported codec");
  });
});

describe("jobs kernel", () => {
  it("settle: processing needs an output_url, otherwise the body is the result", () => {
    expect(settle({ status: "processing", data: { id: "x" } }, "T")).toEqual({ data: { id: "x" } });
    expect(settle({ status: "queued", data: { id: "x", output_url: "u" } }, "T")).toMatchObject({ job: { job_id: "x", output_url: "u" } });
    expect(() => settle({ success: false, message: "nope" }, "T")).toThrow("nope");
  });

  it("isVideodbUrl accepts the configured API origin and *.videodb.io only", () => {
    expect(isVideodbUrl("https://api.videodb.io/async-response/1")).toBe(true);
    expect(isVideodbUrl("https://dev-api.videodb.io/download/1")).toBe(true);
    expect(isVideodbUrl("https://videodb.io.evil.com/x")).toBe(false);
    expect(isVideodbUrl("ftp://api.videodb.io/x")).toBe(false);
    expect(isVideodbUrl("not a url")).toBe(false);
  });

  it("shapeResult turns clip payloads into shots and caps long lists", () => {
    expect(shapeResult({ results: [{ video_id: "m-1", collection_id: "c-1", title: "K", docs: [{ start: 1, end: 2, text: "t", score: 0.5 }] }] })).toEqual({
      shots: [{ video_id: "m-1", collection_id: "c-1", video_title: "K", start: 1, end: 2, text: "t", search_score: 0.5 }],
      next: "compile_clips",
    });
    const big = shapeResult({ text: "x", word_timestamps: Array.from({ length: 250 }, (_, i) => i) });
    expect((big.word_timestamps as unknown[]).length).toBe(200);
    expect(big).toMatchObject({ word_timestamps_total: 250, truncated: true });
  });
});
