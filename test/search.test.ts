import { describe, expect, it } from "vitest";
import { search } from "@/lib/toolsets/search";
import { call, fakeConnection, toolNamed } from "./harness";

const VIDEO = { id: "m-1", collectionId: "c-1", name: "Keynote", length: 120, size: "1", streamUrl: "https://stream/x.m3u8", playerUrl: "https://player/x" };
const RESULTS = [{ videoId: "m-1", title: "Keynote", length: 120, docs: [{ start: 1, end: 5, text: "pricing", score: 0.9 }] }];
const SHOT = { video_id: "m-1", video_title: "Keynote", start: 1, end: 5, text: "pricing", search_score: 0.9 };

describe("search", () => {
  it("search_video routes v2 params to /search/v2 and returns the envelope + shots", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/search/v2": (body: any) => {
        expect(body).toEqual({ query: "pricing", top_k: 3, mode: "deepsearch", include_clip: true, session_id: "s-1" });
        return { responseType: "deepsearch", sessionId: "s-2", waitingFor: "none", results: RESULTS };
      },
    });
    const { data, isError } = await call(
      toolNamed(search, "search_video"),
      { video_id: "m-1", collection_id: "c-1", query: "pricing", top_k: 3, mode: "deepsearch", include_clip: true, session_id: "s-1" },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ response_type: "deepsearch", session_id: "s-2", waiting_for: "none", shots: [SHOT] });
  });

  it("search_video with no params keeps the legacy defaults", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/search": (body: any) => {
        expect(body).toMatchObject({ query: "pricing", search_type: "semantic", index_type: "spoken_word", result_threshold: 5 });
        return { results: RESULTS };
      },
    });
    const { data } = await call(toolNamed(search, "search_video"), { video_id: "m-1", query: "pricing" }, vdb);
    expect(data).toEqual({ shots: [SHOT] });
  });

  it("search_video surfaces the SDK error when legacy and v2 params are mixed", async () => {
    const vdb = fakeConnection({ "GET video/m-1": VIDEO });
    const { data, isError } = await call(toolNamed(search, "search_video"), { video_id: "m-1", query: "x", index_type: "scene", top_k: 5 }, vdb);
    expect(isError).toBe(true);
    expect(String(data)).toContain("Cannot mix legacy search params");
    expect(vdb.http.post).not.toHaveBeenCalled();
  });

  it("search_collection routes legacy scene params to /collection/{id}/search", async () => {
    const vdb = fakeConnection({
      "POST collection/c-1/search": (body: any) => {
        expect(body).toMatchObject({ query: "podium", search_type: "semantic", index_type: "scene", result_threshold: 2 });
        return { results: RESULTS };
      },
    });
    const { data, isError } = await call(
      toolNamed(search, "search_collection"),
      { collection_id: "c-1", query: "podium", index_type: "scene", result_threshold: 2 },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ shots: [SHOT] });
    expect(vdb.http.get).not.toHaveBeenCalled();
  });

  it("search_collection v2 returns raw results for non-shot response types", async () => {
    const vdb = fakeConnection({
      "POST collection/c-1/search/v2": (body: any) => {
        expect(body).toEqual({ query: "how many brands", top_k: 10 });
        return { responseType: "aggregate", results: [{ key: "acme", count: 3 }] };
      },
    });
    const { data } = await call(toolNamed(search, "search_collection"), { collection_id: "c-1", query: "how many brands", top_k: 10 }, vdb);
    expect(data).toEqual({ response_type: "aggregate", waiting_for: "none", results: [{ key: "acme", count: 3 }] });
  });

  it("ask_video posts the question and returns answer + sources", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/ask": (body: any) => {
        expect(body).toEqual({ question: "What is the price?", top_k: 5, mode: "default", include_sources: true });
        return { answer: "$10/month", sources: RESULTS };
      },
    });
    const { data, isError } = await call(
      toolNamed(search, "ask_video"),
      { video_id: "m-1", collection_id: "c-1", question: "What is the price?", top_k: 5, include_sources: true },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ answer: "$10/month", sources: [SHOT] });
  });

  it("ask_collection applies SDK defaults and returns the answer", async () => {
    const vdb = fakeConnection({
      "POST collection/c-1/ask": (body: any) => {
        expect(body).toEqual({ question: "Summarise", top_k: 15, mode: "default", include_sources: false });
        return { answer: "A keynote." };
      },
    });
    const { data, isError } = await call(toolNamed(search, "ask_collection"), { collection_id: "c-1", question: "Summarise" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ answer: "A keynote.", sources: [] });
  });

  it("semantic_search scopes to the video when video_id is given", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/semantic-search": (body: any) => {
        expect(body).toEqual({
          query: "person at a podium",
          index_names: ["scene"],
          index_ids: undefined,
          top_k: 20,
          score_threshold: 0.5,
          filter: [{ field: "label", op: "==", value: "phone" }],
          return_fields: "all",
        });
        return { results: RESULTS };
      },
    });
    const { data, isError } = await call(
      toolNamed(search, "semantic_search"),
      { video_id: "m-1", collection_id: "c-1", query: "person at a podium", index_names: ["scene"], top_k: 20, score_threshold: 0.5, filter: [{ field: "label", op: "==", value: "phone" }], return_fields: "all" },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ shots: [SHOT] });
  });

  it("semantic_search falls back to the collection when video_id is omitted", async () => {
    const vdb = fakeConnection({
      "POST collection/c-1/semantic-search": (body: any) => {
        expect(body).toMatchObject({ query: "podium", index_ids: ["idx-1"], top_k: 10 });
        return { results: RESULTS };
      },
    });
    const { data } = await call(toolNamed(search, "semantic_search"), { collection_id: "c-1", query: "podium", index_ids: ["idx-1"] }, vdb);
    expect(data).toEqual({ shots: [SHOT] });
    expect(vdb.http.get).not.toHaveBeenCalled();
  });

  it("query_index posts filter/sort/limit and flattens shots", async () => {
    const vdb = fakeConnection({
      "POST collection/c-1/query": (body: any) => {
        expect(body).toEqual({
          index_name: "moderation",
          index_id: undefined,
          filter: [{ field: "moderation_label", op: "==", value: "CONTENT_SAFE" }],
          limit: 50,
          return_fields: undefined,
          sort: [["start", "asc"]],
        });
        return { results: RESULTS };
      },
    });
    const { data, isError } = await call(
      toolNamed(search, "query_index"),
      { collection_id: "c-1", index_name: "moderation", filter: [{ field: "moderation_label", op: "==", value: "CONTENT_SAFE" }], sort: [["start", "asc"]], limit: 50 },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ shots: [SHOT] });
  });

  it("aggregate_index posts group_by/metric and returns the raw rows", async () => {
    const vdb = fakeConnection({
      "GET video/m-1": VIDEO,
      "POST video/m-1/aggregate": (body: any) => {
        expect(body).toEqual({ index_name: "brands", index_id: undefined, filter: undefined, group_by: "brand_names", metric: "count", limit: 100, sort: undefined });
        return { results: [{ key: "acme", count: 3 }], warnings: [] };
      },
    });
    const { data, isError } = await call(toolNamed(search, "aggregate_index"), { video_id: "m-1", collection_id: "c-1", index_name: "brands", group_by: "brand_names" }, vdb);
    expect(isError).toBe(false);
    expect(data).toEqual({ results: [{ key: "acme", count: 3 }], warnings: [] });
    expect(vdb.http.post).toHaveBeenCalledWith(["video", "m-1", "aggregate"], expect.anything(), undefined, { convert: false });
  });

  it("aggregate_index caps oversized row lists", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ key: `k${i}`, count: i }));
    const vdb = fakeConnection({ "POST collection/c-1/aggregate": { results: rows } });
    const { data } = await call(toolNamed(search, "aggregate_index"), { collection_id: "c-1", group_by: "label" }, vdb);
    expect(data).toMatchObject({ truncated: true, total: 250 });
    expect((data as any).results).toHaveLength(200);
  });
});
