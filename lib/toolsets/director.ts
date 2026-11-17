import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { director as forward, directorConfigured, seg } from "@/lib/director";

/** Dataset search over the hosted robot-learning corpus: its catalogue, fire-and-poll turns, stored result sets, exports. */

const CONTENT_ID = z
  .string()
  .min(1)
  .describe("A result set's content_id (srs-…), from get_search_status → result_sets[].content_id.");

const listDatasets = defineTool({
  name: "list_datasets",
  title: "List datasets",
  description:
    "The datasets in the hosted robot-learning and human-activity corpus that dataset_search searches. Each entry has its index name (what a row's dataset field holds), the dataset's name, what one record spans, its field groups (semantic: the annotation sentence that search matches; filter, aggregate, sort: the fields that can narrow, group or order it), and its export lane (robot: one of lerobot, rlds or mcap; clip: MP4 clips of each span; blocked: not exportable). Returns at once.\n\n" +
    "Use it to answer questions about the corpus itself (which datasets exist, what each records, which fields or annotation layers it has, what can be exported) and to spell a dataset restriction before a dataset_search. Record counts and the values a field takes are not here; ask dataset_search for those.",
  kind: "read",
  input: z.object({}),
  handler: (_args, vdb) => forward(vdb, "GET", "/corpus"),
});

const startSearch = defineTool({
  name: "dataset_search",
  title: "Dataset search",
  description:
    "Search a hosted corpus of 30+ public robot-learning and human-activity datasets (robot and humanoid manipulation, real and simulated, drone flights, egocentric and exocentric human video) for training data. Use it when the user wants to find, count, sample, filter, verify or export episodes, demonstrations or clips for robotics, embodied AI, imitation learning, VLA or policy training, even if they name no dataset. It searches only this corpus, never the user's own VideoDB videos, and its result sets work only with get_result_set, list_result_shots and export_result_set. For which datasets exist and what fields they have, call list_datasets instead; it answers at once.\n\n" +
    "A search agent does the work. It matches the meaning of each record's annotation sentence, filters on fields, counts episodes and, when asked, judges each sentence against the request (rows then carry tier: confirmed, partial, rejected or unjudged). It reads text and fields only and cannot see the footage: it cannot watch clips or classify what the frames show (blur, focus, lighting, image quality). Don't ask it to; it will say so.\n\n" +
    "Write the message as the user's goal in plain language, one goal per message. State every restriction explicitly, naming datasets as list_datasets spells them (\"only Ego-Exo4D\", \"human video only, no robot datasets\", \"real, not sim\"). Ask for judging only when the user wants hits verified; it is slower.\n\n" +
    "Returns at once with {session_id, msg_id, status:'running'}; this is not the answer. Poll get_search_status(msg_id) about every 10 s until status is 'success' or 'error'. A plain search takes seconds to a minute; judging or a multi-step request can take several minutes. One turn runs per session at a time; wait for it before sending the next message. Pass session_id on every follow-up (\"of those, only kitchens\", \"verify them\", \"export the confirmed ones\") so the agent refines its earlier sets; omit it only for a new, unrelated search.",
  kind: "create",
  input: z.object({
    message: z.string().min(1).describe("The user's goal in plain language: the task, activity or scene, every dataset or field restriction, and whether hits should be verified."),
    session_id: z.string().optional().describe("session_id from an earlier dataset_search, to continue that conversation and refer to its result sets."),
  }),
  handler: (args, vdb) => forward(vdb, "POST", "/search", args),
});

const getSearchStatus = defineTool({
  name: "get_search_status",
  title: "Get search status",
  description:
    "Poll a dataset_search turn by its msg_id; returns immediately. Call about every 10 s while status is 'running' (actions and updates show what the agent has done so far; relay progress if the wait is long). 'success' carries reply (what was searched, counts, top score, whether anything was capped, the next step) and result_sets: one per set the agent produced, each with content_id, name, count (rows), video_count and up to 10 preview rows. 'error' carries a reply saying what to do next; the session stays usable.\n\n" +
    "Relay reply to the user. Then use each content_id: get_result_set for totals and field counts, list_result_shots for the rows with their watch_url links, export_result_set for training files. To refine, call dataset_search again with the same session_id.",
  kind: "read",
  input: z.object({ msg_id: z.string().min(1).describe("msg_id returned by dataset_search.") }),
  handler: ({ msg_id }, vdb) => forward(vdb, "GET", `/search/${seg(msg_id)}`),
});

const getResultSet = defineTool({
  name: "get_result_set",
  title: "Get result set",
  description:
    "Summary of a result set from dataset_search: name, count (rows), video_count, scope (the query and filters that built it), complete (false when a cap cut it short), tiers (confirmed/partial/rejected/unjudged counts, when judged), score range, and the top value counts of each low-cardinality field (e.g. dataset, task, tier). Use it to answer \"how many\" and \"what's in it\" without paging rows, and to pick values for list_result_shots `where`. Many rows can share one annotation sentence, so a large count is not the same as varied data. The dataset counts say what export_result_set will produce; list_datasets gives each dataset's export lane. Sets belong to the caller and persist across conversations.",
  kind: "read",
  input: z.object({ content_id: CONTENT_ID }),
  handler: ({ content_id }, vdb) => forward(vdb, "GET", `/result-sets/${seg(content_id)}`),
});

const listResultShots = defineTool({
  name: "list_result_shots",
  title: "List result shots",
  description:
    "Rows of a result set, at most 200 per page. Each row is one annotated time span: video_id, start/end (seconds), text (the annotation sentence that matched), score, dataset (it decides what export_result_set produces), rank, its stored fields (e.g. episode_index, task, tier) and watch_url, a link to the source footage seeked to the span, or null when the source is not browser-playable. Present watch_url as a clickable link; these rows are not VideoDB media, so the video tools (show_video, generate_clip and the rest) do not take them.\n\n" +
    "`where` matches stored fields exactly ({tier:'confirmed'}, {dataset:'egoexo4d'}); take values from get_result_set. `q` is a case-insensitive substring match on the sentence. Returns {shots, next_cursor}; pass next_cursor back for the next page, null means the last page. A page can take several seconds, so page only as far as the user needs; export_result_set reads rows by content_id, so rows never need to be collected for export.",
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

const exportResultSet = defineTool({
  name: "export_result_set",
  title: "Export result set",
  description:
    "Export a result set from dataset_search as downloadable training data, by content_id, in the set's rank order: at most 50 rows per call for lerobot or rlds, 10 for mcap (also the fallback when formats is omitted). For a larger set, call again with offset set to the previous reply's rows.next_offset until it is null; each call is its own export and download. A slice that is still too large to export at once is refused with a smaller limit to use. Export a finished set only (after get_search_status reports success); to export a subset such as the confirmed tier, ask dataset_search for that set in the same session and export its content_id.\n\n" +
    "The output depends on each row's dataset and its export lane in list_datasets, not on the annotation layer that matched:\n- robot: one training format per export, lerobot, rlds or mcap. Each row exports its whole episode with the recorded state, action and every camera; rows from the same episode become one episode. Only what the source records is exported; multi-dimensional sensor arrays such as depth maps, LiDAR and tactile grids are left out; nothing is inferred or synthesized.\n- clip: MP4 only, frame-accurate clips of each annotated span plus clips/manifest.json with the annotation text. formats does not apply.\n- blocked: skipped and listed in errors.json while the rest of the set exports.\n" +
    "A set with robot rows needs a format: use the one the user named, or ask them (LeRobot/Hugging Face → lerobot, RLDS/TFDS/Open X-Embodiment → rlds, ROS 2/Foxglove → mcap); left out, it falls back to mcap. A mixed set writes the robot format and the MP4 clips side by side.\n\n" +
    "Returns {export_id, status:'queued', rows:{offset, limit, total, next_offset}} at once. Next: poll get_export_status(export_id).",
  kind: "create",
  input: z.object({
    content_id: CONTENT_ID,
    formats: z.array(z.enum(["lerobot", "rlds", "mcap"])).optional().describe("Robot-lane rows only: exactly one of lerobot, rlds, mcap (falls back to mcap if omitted). Clip-lane rows are always MP4 clips; omit for a set with no robot rows."),
    fps: z.number().positive().default(5).describe("Frame rate lerobot and rlds episodes are sampled at; mcap keeps the recorded timing."),
    mcap_profile: z.enum(["foxglove", "ros2"]).default("foxglove").describe("MCAP message encoding: foxglove for Foxglove Studio, ros2 for ROS 2 tooling."),
    rlds_observation_names: z.record(z.string(), z.string()).optional().describe("RLDS only: source stream → observation key, default {front:'image', wrist:'hand_image', state:'robot_state'}."),
    rlds_action_fields: z.record(z.string(), z.union([z.number().int(), z.array(z.number().int())])).optional().describe("RLDS only: split the action vector into named fields, an index for a scalar or a list of indices for a vector. Omit to keep the vector whole."),
    offset: z.number().int().min(0).default(0).describe("First row to export, in rank order; use the previous reply's rows.next_offset."),
    limit: z.number().int().min(1).max(50).optional().describe("Rows to export in this call: at most 50 for lerobot/rlds, 10 for mcap. Omit for that maximum."),
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
  description: "Dataset search over the hosted robot-learning corpus: its catalogue, stored result sets and exports; on when the search service is configured.",
  defaultEnabled: directorConfigured(),
  tools: [listDatasets, startSearch, getSearchStatus, getResultSet, listResultShots, exportResultSet, getExportStatus],
};
