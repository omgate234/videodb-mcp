import { describe, expect, it } from "vitest";
import { z } from "zod";
import { annotationsFor } from "@/lib/mcp/tool";
import { createRtstreamAlert } from "@/lib/toolsets/openai/live";
import { call, fakeConnection } from "./harness";

const SCENE_INDEX = { rtstreamIndexId: "rsi-1", extractionType: "time_based", prompt: "Describe", name: "gate", status: "connected" };
const specBytes = (def: typeof createRtstreamAlert) =>
  JSON.stringify({
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: z.toJSONSchema(def.input, { io: "input", unrepresentable: "any" }),
    annotations: { title: def.title, ...annotationsFor(def) },
  }).length;

describe("openai: create_rtstream_alert", () => {
  it("fits the spec budget and is an open-world create tool", () => {
    expect(specBytes(createRtstreamAlert)).toBeLessThanOrEqual(1800);
    expect(createRtstreamAlert.kind).toBe("create");
    expect(annotationsFor(createRtstreamAlert).openWorldHint).toBe(true);
  });

  it("creates the event, pre-flights the scene index, attaches the alert and returns both ids", async () => {
    const vdb = fakeConnection({
      "POST rtstream/event": (body: any) => {
        expect(body).toEqual({ event_prompt: "A person enters the gate", label: "a_person_enters_the_gate" });
        return { eventId: "ev-1" };
      },
      "GET rtstream/rts-1/index/scene": { sceneIndexes: [SCENE_INDEX] },
      "POST rtstream/rts-1/index/rsi-1/alert": (body: any) => {
        expect(body).toEqual({ event_id: "ev-1", callback_url: "https://hook.example/alert" });
        return { alertId: "al-1" };
      },
    });
    const { data, isError } = await call(
      createRtstreamAlert,
      { rtstream_id: "rts-1", index_id: "rsi-1", event_prompt: "A person enters the gate", callback_url: "https://hook.example/alert" },
      vdb
    );
    expect(isError).toBe(false);
    expect(data).toEqual({ event_id: "ev-1", label: "a_person_enters_the_gate", alert_id: "al-1", rtstream_id: "rts-1", index_id: "rsi-1" });
  });

  it("routes idx- ids to the v2 index alert path and keeps an explicit label", async () => {
    const vdb = fakeConnection({
      "POST rtstream/event": { eventId: "ev-2" },
      "GET rtstream/rts-1/indexes": { indexes: [{ indexId: "idx-1", status: "running" }] },
      "POST rtstream/rts-1/indexes/idx-1/alert": { alertId: "al-2" },
    });
    const { data } = await call(createRtstreamAlert, { rtstream_id: "rts-1", index_id: "idx-1", event_prompt: "smoke", event_label: "smoke", callback_url: "https://hook.example/a" }, vdb);
    expect(data).toMatchObject({ event_id: "ev-2", label: "smoke", alert_id: "al-2" });
  });

  it("refuses an unknown index without posting the alert (alerts are undeletable)", async () => {
    const vdb = fakeConnection({ "POST rtstream/event": { eventId: "ev-1" }, "GET rtstream/rts-1/index/scene": { sceneIndexes: [SCENE_INDEX] } });
    const { isError, data } = await call(createRtstreamAlert, { rtstream_id: "rts-1", index_id: "rsi-nope", event_prompt: "fire", callback_url: "https://hook.example/alert" }, vdb);
    expect(isError).toBe(true);
    expect(String(data)).toContain('No scene_index "rsi-nope"');
    expect(vdb.http.post).toHaveBeenCalledTimes(1); // the event only
  });
});
