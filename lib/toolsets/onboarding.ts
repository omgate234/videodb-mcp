import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";

/** Agent-facing guidance, adapted from videodb-skills-main's connector workflows. */
const GUIDE = `You are helping a new VideoDB MCP user get their first useful result.
This is guidance for the agent, not a script to paste into chat or a checklist to complete.

START WITH THEIR GOAL
If the user already gave a goal or media, use it and proceed. Otherwise briefly explain:
"I can help you understand a video, find a moment, or turn it into a clip. Share a YouTube/public video link, or we can use a video already in your library. What would you like to try?"
Offer two or three concrete examples, such as summarizing a talk, finding a product demo moment, or cutting a short clip. Ask only for the missing information needed for the next action. If they are unsure, suggest a transcript summary of a short video they choose, followed by an optional clip of a useful moment.
Use connected tools directly; do not ask an already connected user for API keys or SDK installation. Use only tools exposed by this deployment, and their current schemas. If a path is unavailable, explain that and offer an available path.

GET OR REUSE MEDIA
Reuse media IDs already in the conversation. Use search_videos_by_title or list_videos for existing library videos; confirm an ambiguous match rather than choosing arbitrarily. Preserve the collection_id returned with the asset.
For a public URL or YouTube link, use upload_media(url), then wait for the completed job and retain its media ID and duration. Audio and image URLs use media_type="audio" or "image". The connector cannot upload a local filesystem path: direct local-file users to https://console.videodb.io, then locate their uploaded media.
Do not upload another copy or create a collection just to demonstrate onboarding. Do not invent sample URLs or media IDs.

CHOOSE ONLY THE WORK NEEDED
These are independent entry points. The user can switch paths at any time, including from understanding straight to editing without search or indexing.

1. Speech, a transcript, or a one-off question about what was said
Read an existing transcript with get_transcript(media_id, timestamped=true, segmenter="sentence"). If it has not been transcribed, use generate_transcript(media_id), wait, then get_transcript. This works for video and audio and requires neither a VLM nor create_index.
Summarize or locate relevant speech using the returned text and timestamps. Transcript job output can be truncated; always read with get_transcript. If that result is truncated, use start/end windows or a coarser segmenter. Do not claim to summarize unseen parts. Repeated questions or very long transcripts may justify the indexed retrieval path below.

2. What is visible, on-screen text, or scene understanding
Check list_understandings for reusable completed analysis. If needed, call understand_video with only the relevant analyzers, e.g. [{"type":"vlm","name":"scene","config":{"prompt":"Describe the scenes and relevant on-screen text."}}]. Tailor the prompt to the question. For speech analysis use {"type":"spoken_words","name":"transcript"}; do not add visual analysis to a speech-only task.
If show_understanding is available, open it immediately with the returned understanding_id so the user can watch progress. When the next action needs completed output, follow get_understanding until the needed analyzer is done, then get_analyzer_output to read its timestamped artifacts. You can answer from those artifacts or use their time ranges to edit immediately. create_index is not required merely to read analyzer output. Respect truncated outputs and distinguish visual evidence from spoken evidence. Object detection requires an active compatible sandbox; consult the exposed sandbox tools when needed, and do not make it a default beginner step.

3. Search or ask questions across a video or library
Check list_indexes first and reuse suitable ready indexes. If needed, reuse a completed understanding or run only the required analyzer, then create_index with its understanding_id and analyzer_name. Use get_index until status is ready before retrieval; a completed understanding alone is not a searchable index. Create only the indexes relevant to the requested search.
Use search_video(query, include_clip=true) for timestamped moments or ask_video(question, include_sources=true) for an answer with sources; include video_id. Use search_collection or ask_collection for a library, checking that the relevant videos have suitable indexes rather than silently processing the whole library.
For advanced exact filters/counts use query_index or aggregate_index with fields from the actual index schema; do not invent labels or field paths.
If nothing matches, say so. Label approximate matches and never invent quotes or timestamps.

4. Cut, edit, caption, or reframe
Known time ranges go directly to generate_clip(video_id, timeline=[[start,end], ...]) in seconds. No understanding, transcript, index or search is required. Check bounds against video duration. For moments discovered in a transcript, analyzer output or search, reuse those ranges. compile_clips joins shots across videos.
For titles, supplied music, logos, transitions or multiple tracks, use render_timeline. Assets need VideoDB IDs; upload/reuse supplied audio and images. Timeline clip start is its placement; asset.start is the source offset. Use the tool schema for the full composition.
For subtitles, obtain a transcript first, then add_subtitles. Animated captions use render_timeline with a caption asset and require transcription before rendering. Index creation is not a prerequisite for captions. translate_transcript supports a translated transcript. reframe_video supports a vertical/social version.
If the user asks for prompt-based highlights, create_highlight_clip returns shots; inspect the result and use compile_clips to make the playable reel when needed.

WAIT AND DELIVER
Jobs returning status="processing" and output_url are polled with get_job_result(output_url), waiting the returned retry_after seconds between reads, until success or failure. Never restart a write because it is still processing. Understanding and index operations use get_understanding and get_index instead; follow their returned status/IDs. Surface failures and the specific recovery needed rather than polling failed jobs forever. For insufficient_credit or usage_limit_reached, follow the server instructions and returned console_url; do not automatically retry blocked work.
Give brief progress updates in everyday language: "transcribing" or "making the video searchable" rather than explaining indexing internals. Deliver the requested result first: a grounded summary, timestamped moments, transcript, or playable player_url. Use returned URLs, never fabricate them. When available, use show_video with the returned stream_url for inline playback, show_assets to browse media, and show_index to review transcripts or indexes. These views load their own data; do not fetch it just to open a view. If an MP4 is requested, use download_stream for a stream or download_timeline_render for a timeline render and share the completed download URL.
After the first result, offer one relevant optional next step: "Want a clip of that moment?" or "Would captions help?" Stop if the user is satisfied. Do not run every capability as a tour.

DOCUMENTATION (offer the relevant link, not a reading assignment)
Console and local uploads: https://console.videodb.io
Search and retrieval: https://docs.videodb.io/pages/understand/search-and-retrieval/intelligent-search
Timeline editing: https://docs.videodb.io/pages/act/programmable-editing/timeline-architecture
Further VideoDB documentation: https://docs.videodb.io
`;

export const onboarding: Toolset = {
  name: "onboarding",
  description: "Goal-based guidance for a new VideoDB MCP user's first workflow.",
  defaultEnabled: true,
  tools: [defineTool({
    name: "onboarding",
    title: "Get started with VideoDB",
    description: "Return an agent-facing guide for helping new VideoDB MCP users choose their first workflow: upload or reuse media, transcribe, understand visuals, search, or edit. Covers optional paths, prerequisites and documentation; does not process media or change the account.",
    kind: "read",
    input: z.object({}),
    handler: async () => GUIDE,
  })],
};
