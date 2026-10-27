import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import { COLLECTION_ID } from "@/lib/mcp/schemas";
import { isJobStarted, shapeResult, startJob } from "@/lib/videodb/jobs";

/** One flat generate tool for the OpenAI surface: kind picks the SDK's generateImage/Video/Music/SoundEffect/Voice. */

const KIND = z.enum(["image", "video", "music", "sound_effect", "voice"]);
type Kind = z.infer<typeof KIND>;

// Same wire bodies the SDK's generate* methods post; posting unpolled skips their 500 s wait.
const request = (kind: Kind, prompt: string, duration: number | undefined, aspect_ratio: string | undefined, voice_name: string | undefined) => {
  switch (kind) {
    case "image":
      return { path: "image", body: { prompt, aspect_ratio: aspect_ratio ?? "1:1" } };
    case "video":
      return { path: "video", body: { prompt, duration: duration ?? 5 } };
    case "music":
      return { path: "audio", body: { prompt, duration: duration ?? 5, audio_type: "music" } };
    case "sound_effect":
      return { path: "audio", body: { prompt, duration: duration ?? 2, audio_type: "sound_effect", config: {} } };
    case "voice":
      return { path: "audio", body: { text: prompt, audio_type: "voice", voice_name: voice_name ?? "Default", model_name: "elevenlabs", config: {} } };
  }
};

export const generateMedia = defineTool({
  name: "generate_media",
  title: "Generate media",
  description:
    "Generate a new asset from a text prompt and save it in the collection. prompt applies to every kind (for voice it is the text to speak). duration applies to video, music and sound_effect. aspect_ratio applies to image only. voice_name applies to voice only. Returns {status:'processing', output_url} when the job is still running; poll get_job_result with that output_url until it returns the new asset.",
  kind: "create",
  input: z.object({
    kind: KIND.describe("What to generate."),
    prompt: z.string().describe("Description of the output, or the text to speak for voice."),
    duration: z.number().min(1).optional().describe("Length in seconds (video, music, sound_effect)."),
    aspect_ratio: z.enum(["1:1", "9:16", "16:9", "4:3", "3:4"]).optional().describe("Image aspect ratio."),
    voice_name: z.string().optional().describe("Voice to speak with."),
    collection_id: COLLECTION_ID,
  }),
  deadlineLabel: "Media generation",
  retryWith: "list_assets",
  handler: async ({ kind, prompt, duration, aspect_ratio, voice_name, collection_id }, vdb) => {
    const { path, body } = request(kind, prompt, duration, aspect_ratio, voice_name);
    const out = await startJob(vdb, ["collection", collection_id, "generate", path], body, "Media generation");
    return isJobStarted(out) ? out.job : shapeResult(out.data);
  },
});
