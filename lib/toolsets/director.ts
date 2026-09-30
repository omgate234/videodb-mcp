import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { director as forward, directorConfigured, seg } from "@/lib/director";

/** Director search over the robotics corpus: fire-and-poll turns, stored result sets, exports. */

const CONTENT_ID = z.string().min(1).describe("A result set's content_id from get_search_status.");

const startSearch = defineTool({
  name: "director_search",
  title: "Director search",
  description:
    "Ask the search agent to find, count, filter, sample or look at moments in the robotics corpus. Returns at once with {session_id, msg_id, status:'running'}; the agent works in the background, usually 10–90 s. Poll get_search_status with the msg_id about every 10 s until status is 'success' or 'error'. One search runs per conversation at a time. Pass the returned session_id on follow-ups ('of those, only kitchens') so it can refer to earlier sets; omit it to start a new conversation.",
  kind: "create",
  input: z.object({
    message: z.string().min(1).describe("What to find, in plain language."),
    session_id: z.string().optional().describe("session_id from an earlier director_search, to continue that conversation."),
  }),
  handler: (args, vdb) => forward(vdb, "POST", "/search", args),
});

const getSearchStatus = defineTool({
  name: "get_search_status",
  title: "Get search status",
  description:
    "Status of a director_search turn; returns immediately. status is 'running' (actions lists what the agent has done so far), 'success' or 'error'. A finished turn carries reply (what was searched, counts, top score, whether anything was capped) and result_sets (content_id, counts, up to 10 preview rows). Page the rest with list_result_shots and play a row with stream_result_shot.",
  kind: "read",
  input: z.object({ msg_id: z.string().min(1).describe("msg_id returned by director_search.") }),
  handler: ({ msg_id }, vdb) => forward(vdb, "GET", `/search/${seg(msg_id)}`),
});

const getResultSet = defineTool({
  name: "get_result_set",
  title: "Get result set",
  description: "Metadata and facets of a stored result set: name, count, video_count, scope, complete, tiers when judged, and per-field value counts.",
  kind: "read",
  input: z.object({ content_id: CONTENT_ID }),
  handler: ({ content_id }, vdb) => forward(vdb, "GET", `/result-sets/${seg(content_id)}`),
});

const listResultShots = defineTool({
  name: "list_result_shots",
  title: "List result shots",
  description:
    "Rows of a result set, at most 200 per page. `where` matches stored fields exactly ({tier:'confirmed'}); `q` is a case-insensitive text match. Returns {shots, next_cursor}; pass next_cursor back for the next page.",
  kind: "read",
  input: z.object({
    content_id: CONTENT_ID,
    video_id: z.string().optional().describe("Only rows from this video."),
    min_score: z.number().optional().describe("Drop rows scoring below this."),
    q: z.string().optional().describe("Case-insensitive text match on the row text."),
    where: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Exact matches on stored fields."),
    sort: z.enum(["score", "rank", "start"]).default("score"),
    order: z.enum(["asc", "desc"]).default("desc"),
    cursor: z.string().optional().describe("next_cursor from the previous page."),
    limit: z.number().int().min(1).max(200).default(100),
  }),
  handler: ({ content_id, ...query }, vdb) => forward(vdb, "POST", `/result-sets/${seg(content_id)}/shots`, query),
});

const streamResultShot = defineTool({
  name: "stream_result_shot",
  title: "Stream result shot",
  description:
    "Create a playable stream for one row of a result set, padded by `pad` seconds on each side and clamped to the video. Returns {stream_url, player_url}. Create one at a time, when someone will actually watch it.",
  kind: "create",
  input: z.object({
    content_id: CONTENT_ID,
    video_id: z.string().min(1).describe("The row's video_id."),
    start: z.number().min(0).describe("Row start, seconds."),
    end: z.number().min(0).describe("Row end, seconds."),
    pad: z.number().min(0).default(0).describe("Seconds of context on each side."),
  }),
  handler: ({ content_id, ...shot }, vdb) => forward(vdb, "POST", `/result-sets/${seg(content_id)}/stream`, shot),
});

const exportResultSet = defineTool({
  name: "export_result_set",
  title: "Export result set",
  description:
    "Export a stored result set as files. Robot rows become the training format you pick (lerobot, rlds or mcap; default mcap) with recorded state, action and every camera; nothing is inferred. Human-video rows become MP4 clips plus clips/manifest.json; omit formats for a clip-only set. Returns {export_id, status:'queued'} at once; poll get_export_status. A finished job can hold a partial dataset: inspect summary.",
  kind: "create",
  input: z.object({
    content_id: CONTENT_ID,
    formats: z.array(z.enum(["lerobot", "rlds", "mcap"])).optional().describe("Training formats for robot rows; select one."),
    fps: z.number().positive().default(5),
    mcap_profile: z.enum(["foxglove", "ros2"]).default("foxglove"),
    rlds_observation_names: z.record(z.string(), z.string()).optional(),
    rlds_action_fields: z.record(z.string(), z.union([z.number().int(), z.array(z.number().int())])).optional(),
  }),
  handler: ({ content_id, ...request }, vdb) => forward(vdb, "POST", `/result-sets/${seg(content_id)}/export`, request),
  retryWith: "get_export_status",
});

const getExportStatus = defineTool({
  name: "get_export_status",
  title: "Get export status",
  description:
    "Status of an export_result_set job; poll every 15–30 s until 'complete' or 'failed'. A complete export carries a one-hour download link (download.url, download.curl) bound to the first machine that fetches it; pass portable=true for an unbound single-use link. Compare download.sha256 with a copy you already have before downloading again.",
  kind: "read",
  input: z.object({
    export_id: z.string().regex(/^[0-9a-f]{32}$/).describe("export_id returned by export_result_set."),
    portable: z.boolean().default(false),
  }),
  handler: ({ export_id, portable }, vdb) =>
    forward(vdb, "GET", `/exports/${seg(export_id)}${portable ? "?portable=true" : ""}`),
});

export const director: Toolset = {
  name: "director",
  description: "Director search over the robotics corpus, its stored result sets and exports; on when the search service is configured.",
  defaultEnabled: directorConfigured(),
  tools: [startSearch, getSearchStatus, getResultSet, listResultShots, streamResultShot, exportResultSet, getExportStatus],
};
