import { z } from "zod";
import { defineTool } from "@/lib/mcp/tool";
import { COLLECTION_ID } from "@/lib/mcp/schemas";
import type { Connection } from "@/lib/videodb/client";
import { isJobStarted, shapeResult, startJob } from "@/lib/videodb/jobs";
import { fetchImage } from "@/lib/videodb/resolve";

/** One flat generate tool for the OpenAI surface: kind picks the SDK's generateImage/Video/Music/SoundEffect/Voice. */

const KIND = z.enum(["image", "video", "music", "sound_effect", "voice", "voice_change", "heygen_avatar"]);
type Kind = Exclude<z.infer<typeof KIND>, "heygen_avatar" | "voice_change">;

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

const AVATAR_RATIOS = ["1:1", "9:16", "16:9"];

interface AvatarArgs {
  prompt: string;
  image?: string;
  aspect_ratio?: string;
  voice_name?: string;
  talking_style?: string;
  caption?: boolean;
  collection_id: string;
}

// generateVideo's body with model "heygen". HeyGen fetches the photo itself, so an img- ID becomes its signed URL.
const avatarRequest = async (vdb: Connection, { prompt, image, aspect_ratio, voice_name, talking_style, caption, collection_id }: AvatarArgs) => {
  if (!image) throw new Error("heygen_avatar needs image: the img- ID or public URL of a face photo.");
  if (aspect_ratio && !AVATAR_RATIOS.includes(aspect_ratio)) throw new Error(`heygen_avatar supports aspect_ratio ${AVATAR_RATIOS.join(", ")}.`);
  const isId = image.startsWith("img-");
  if (!isId && !/^https?:\/\//.test(image)) throw new Error("image must be an img- ID or a public http(s) URL.");
  const image_url = isId ? await (await fetchImage(vdb, collection_id, image)).generateUrl() : image;
  if (!image_url) throw new Error(`VideoDB returned no URL for ${image}.`);
  const config = Object.fromEntries(Object.entries({ voice: voice_name, talking_style, caption }).filter(([, v]) => v !== undefined));
  return {
    path: "video",
    body: { prompt, model: "heygen", image_url, ...(aspect_ratio ? { aspect_ratio } : {}), ...(Object.keys(config).length ? { config } : {}) },
  };
};

export const generateMedia = defineTool({
  name: "generate_media",
  title: "Generate media",
  description:
    "Generate an asset and save it in the collection. voice_change re-voices audio_id (≤30 min) in voice_name. heygen_avatar is a HeyGen talking-head video: the face photo in image speaks prompt (≤1,800 chars). duration: video, music, sound_effect. aspect_ratio: image, heygen_avatar. voice_name: voice, voice_change, heygen_avatar. Returns {status:'processing', output_url}; poll it with get_job_result until it returns the asset.",
  kind: "create",
  input: z.object({
    kind: KIND.describe("What to generate."),
    prompt: z.string().optional().describe("Description of the output, or the text to speak."),
    duration: z.number().min(1).optional().describe("Length in seconds (video, music, sound_effect)."),
    aspect_ratio: z.enum(["1:1", "9:16", "16:9", "4:3", "3:4"]).optional().describe("heygen_avatar: 1:1, 9:16, 16:9."),
    voice_name: z.string().optional().describe("Preset voice, e.g. Aria, George."),
    audio_id: z.string().optional().describe("voice_change source (a-)."),
    image: z.string().optional().describe("Face photo: img- ID or public URL."),
    talking_style: z.enum(["stable", "expressive"]).optional().describe("Avatar delivery."),
    caption: z.boolean().optional().describe("Burn avatar subtitles."),
    collection_id: COLLECTION_ID,
  }).refine(
    ({ kind, prompt, audio_id }) => (kind === "voice_change" ? audio_id?.startsWith("a-") : !!prompt),
    { path: ["prompt"], message: "voice_change needs audio_id (an a- audio ID); every other kind needs prompt" },
  ),
  deadlineLabel: "Media generation",
  retryWith: "list_assets",
  handler: async ({ kind, prompt = "", duration, aspect_ratio, voice_name, audio_id, image, talking_style, caption, collection_id }, vdb) => {
    const { path, body } =
      kind === "heygen_avatar"
        ? await avatarRequest(vdb, { prompt, image, aspect_ratio, voice_name, talking_style, caption, collection_id })
        : kind === "voice_change"
          ? // Collection.change_voice's body; the server chunks long audio under ElevenLabs' 5 min cap.
            { path: "audio", body: { audio_type: "voice_change", audio_id, voice_name: voice_name ?? "Default", config: {} } }
          : request(kind, prompt, duration, aspect_ratio, voice_name);
    const out = await startJob(vdb, ["collection", collection_id, "generate", path], body, "Media generation");
    return isJobStarted(out) ? out.job : shapeResult(out.data);
  },
});
