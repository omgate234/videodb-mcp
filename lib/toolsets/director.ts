import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { director as forward, directorConfigured, seg } from "@/lib/director";

/** Dataset search over the robot-learning corpus: fire-and-poll turns, stored result sets, exports. */

const CONTENT_ID = z
  .string()
  .min(1)
  .describe("A result set's content_id, from get_search_status → result_sets[].content_id.");

const startSearch = defineTool({
  name: "dataset_search",
  title: "Dataset search",
  description:
    "Search a hosted corpus of robot-learning and human-activity datasets for training data. Use it whenever the user wants to find, count, sample, verify or export episodes, demonstrations or clips for robotics, embodied AI, imitation learning, VLA or policy training, or egocentric/exocentric human-activity video, even if they name no dataset. The corpus currently holds RoboDojo (robot manipulation episodes, real and sim, with recorded state, action and every camera) and Ego-Exo4D (human skilled-activity video with step, proficiency and narration annotations). It does not search the user's own VideoDB videos; use search_* / semantic_search for those.\n\n" +
    "A search agent does the work: it runs semantic search across the corpus, filters by fields, counts episodes, and on request judges each hit against the ask (rows then carry tier: confirmed, partial, rejected or unjudged). Write the message as the user's goal in plain language, including any restriction (\"only sim\", \"arx_x5 arm only\", \"verify each one really opens a drawer\").\n\n" +
    "Returns at once with {session_id, msg_id, status:'running'}; this is not the answer. Next: poll get_search_status(msg_id) about every 10 s until status is 'success' or 'error' (usually 10–90 s). One search runs per conversation at a time; wait for it before sending the next message. Keep session_id and pass it on every follow-up (\"of those, only kitchens\", \"export the confirmed ones\") so the agent can refer to earlier sets; omit it only to start a new, unrelated conversation.",
  kind: "create",
  input: z.object({
    message: z.string().min(1).describe("What to find, in plain language: the task, activity or scene, plus any restriction or verification wanted."),
    session_id: z.string().optional().describe("session_id from an earlier dataset_search, to continue that conversation and refer to its result sets."),
  }),
  handler: (args, vdb) => forward(vdb, "POST", "/search", args),
});

const getSearchStatus = defineTool({
  name: "get_search_status",
  title: "Get search status",
  description:
    "Poll a dataset_search turn by its msg_id; returns immediately. Call about every 10 s while status is 'running' (actions lists what the agent has done so far; show progress to the user if the wait is long). 'success' carries the answer: reply (what was searched, counts, top score, whether anything was capped, a suggested next step) and result_sets, one per set the agent produced, each with content_id, name, count, video_count and up to 10 preview rows. 'error' carries a reply saying what to do next; the conversation stays usable.\n\n" +
    "Relay reply to the user. Then, per result set's content_id: get_result_set for totals and field breakdowns, list_result_shots for every row with a watch_url to present as a link, stream_result_shot for a playable clip only when a row's watch_url is null, export_result_set to turn the set into training files. For a refinement, call dataset_search again with the same session_id.",
  kind: "read",
  input: z.object({ msg_id: z.string().min(1).describe("msg_id returned by dataset_search.") }),
  handler: ({ msg_id }, vdb) => forward(vdb, "GET", `/search/${seg(msg_id)}`),
});

const getResultSet = defineTool({
  name: "get_result_set",
  title: "Get result set",
  description:
    "Summary of a stored result set from dataset_search: name, count (rows), video_count, scope (the query and filters that built it), complete (false when a cap cut it short), tiers (confirmed/partial/rejected/unjudged counts, when the set was judged), score range, and the top value counts of each low-cardinality stored field (e.g. dataset, task_slug, tier). Use it to answer \"how many\" and \"what's in it\" without paging rows, and to pick values for list_result_shots `where`. Sets belong to the caller and persist across conversations.",
  kind: "read",
  input: z.object({ content_id: CONTENT_ID }),
  handler: ({ content_id }, vdb) => forward(vdb, "GET", `/result-sets/${seg(content_id)}`),
});

const listResultShots = defineTool({
  name: "list_result_shots",
  title: "List result shots",
  description:
    "Rows of a result set, at most 200 per page. Each row is one annotated time span: video_id, start/end (seconds), text (the instruction or annotation sentence that matched), score, index_name (which dataset), rank, its stored fields (e.g. episode_index, task_slug, tier) and watch_url, a direct link to the source video seeked to the span, or null when the source is not browser-playable. Present watch_url as a clickable link; when it is null, call stream_result_shot for that row.\n\n" +
    "`where` matches stored fields exactly ({tier:'confirmed'}); take values from get_result_set. `q` is a case-insensitive text match on the sentence. Returns {shots, next_cursor}; pass next_cursor back for the next page, null means the last page. Page only as far as the user needs; export_result_set takes the whole set by content_id, so rows never need to be collected for export.",
  kind: "read",
  input: z.object({
    content_id: CONTENT_ID,
    video_id: z.string().optional().describe("Only rows from this video."),
    min_score: z.number().optional().describe("Drop rows scoring below this."),
    q: z.string().optional().describe("Case-insensitive text match on the row text."),
    where: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Exact matches on stored fields, e.g. {tier:'confirmed'}."),
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
    "Create a playable, trimmed clip for one row of a result set, when that row's watch_url from list_result_shots is null. Pass the row's video_id, start and end; `pad` adds seconds of context on each side, clamped to the video. Only rows of that set can be streamed. Returns {stream_url, player_url}; present player_url as a clickable link. Create one at a time, when someone will actually watch it.",
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
    "Export a whole result set from dataset_search as downloadable training data, by content_id; there is no row cap. Export a finished set only (after get_search_status reports success); to export a subset such as the confirmed tier, ask dataset_search for that set in the same session and export its content_id.\n\n" +
    "Robot rows (RoboDojo) become the training format you pick: lerobot, rlds or mcap (default mcap; one format per export). Each row exports its whole episode with the recorded state, action and every camera; nothing is inferred or synthesized. Human-video rows (Ego-Exo4D) become frame-accurate MP4 clips of their span plus clips/manifest.json with the annotation text; omit formats for a clip-only set. A set mixing embodiments writes one dataset per embodiment inside the format folder.\n\n" +
    "Returns {export_id, status:'queued'} at once. Next: poll get_export_status(export_id).",
  kind: "create",
  input: z.object({
    content_id: CONTENT_ID,
    formats: z.array(z.enum(["lerobot", "rlds", "mcap"])).optional().describe("Training format for robot rows; select one. Omit for a clip-only export of human-video rows."),
    fps: z.number().positive().default(5).describe("Frame rate the exported episodes are sampled at."),
    mcap_profile: z.enum(["foxglove", "ros2"]).default("foxglove").describe("MCAP message encoding: foxglove for Foxglove Studio, ros2 for ROS 2 tooling."),
    rlds_observation_names: z.record(z.string(), z.string()).optional().describe("RLDS only: source stream → observation key, default {front:'image', wrist:'hand_image', state:'robot_state'}."),
    rlds_action_fields: z.record(z.string(), z.union([z.number().int(), z.array(z.number().int())])).optional().describe("RLDS only: split the action vector into named fields, an index for a scalar or a list of indices for a vector. Omit to keep the vector whole."),
  }),
  handler: ({ content_id, ...request }, vdb) => forward(vdb, "POST", `/result-sets/${seg(content_id)}/export`, request),
  retryWith: "get_export_status",
});

const getExportStatus = defineTool({
  name: "get_export_status",
  title: "Get export status",
  description:
    "Poll an export_result_set job by export_id every 15–30 s until status is 'complete' or 'failed'. progress and summary report requested, exported and failed rows; a complete job can still hold a partial dataset, so read summary and tell the user what was left out (per-row reasons are in errors.json inside the download).\n\n" +
    "A complete export carries download.url and download.curl, valid for one hour and bound to the first machine that fetches it. Give the link to the user to download on their own machine; do not fetch it yourself unless you are the one who needs the files. For a machine behind a rotating IP, call again with portable=true for an unbound single-use link. Calling again mints a fresh link for the same bytes; compare download.sha256 with a copy already downloaded before fetching again. Exports are kept for 7 days.",
  kind: "read",
  input: z.object({
    export_id: z.string().regex(/^[0-9a-f]{32}$/).describe("export_id returned by export_result_set."),
    portable: z.boolean().default(false).describe("true for an unbound single-use link, for a machine behind a rotating IP."),
  }),
  handler: ({ export_id, portable }, vdb) =>
    forward(vdb, "GET", `/exports/${seg(export_id)}${portable ? "?portable=true" : ""}`),
});

export const director: Toolset = {
  name: "director",
  description: "Dataset search over the robot-learning corpus, its stored result sets and exports; on when the search service is configured.",
  defaultEnabled: directorConfigured(),
  tools: [startSearch, getSearchStatus, getResultSet, listResultShots, streamResultShot, exportResultSet, getExportStatus],
};
