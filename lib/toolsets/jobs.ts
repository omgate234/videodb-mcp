import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import type { Toolset } from "@/lib/mcp/registry";
import { fetchJob, isJobStarted, isVideodbUrl, shapeResult } from "@/lib/videodb/jobs";

/** Read side of the async job protocol; every job-starting tool points here. */

const getJobResult = defineTool({
  name: "get_job_result",
  title: "Get job result",
  description:
    "Fetch the result of a background job started by upload_media, render_timeline, download_timeline_render, download_stream, generate_clip, compile_clips, create_highlight_clip, reframe_video, generate_transcript or translate_transcript. Pass the output_url those tools returned. While the job is running the reply is {status:'processing'} with the same output_url — wait ~30 s and call again; when it finishes the reply is the job's result (media record, stream_url + player_url, download_url, shots, or translated segments). Failures are reported as errors. Only VideoDB job URLs are accepted.",
  kind: "read",
  input: z.object({ output_url: z.string().url().describe("The output_url returned by a job-starting tool.") }),
  handler: async ({ output_url }, vdb) => {
    if (!isVideodbUrl(output_url)) throw new Error("output_url must be a VideoDB job URL returned by another tool.");
    const out = await fetchJob(vdb, output_url);
    return isJobStarted(out) ? out.job : { status: "done", output_url, result: shapeResult(out.data) };
  },
});

export const jobs: Toolset = {
  name: "jobs",
  description: "Read results of background jobs; always enabled alongside the toolsets that start them.",
  defaultEnabled: true,
  tools: [getJobResult],
};
