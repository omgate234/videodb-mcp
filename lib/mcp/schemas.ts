import { z } from "zod";

/** Shared input atoms. Keep descriptions short and concrete — they are read by the model. */

export const COLLECTION_ID = z
  .string()
  .default("default")
  .describe('VideoDB collection ID. Defaults to "default" (every account has one).');

export const VIDEO_ID = z.string().describe("VideoDB video ID (starts with m-).");
export const AUDIO_ID = z.string().describe("VideoDB audio ID (starts with a-).");
export const IMAGE_ID = z.string().describe("VideoDB image ID (starts with img-).");
export const MEDIA_ID = z.string().describe("VideoDB media ID: m- (video), a- (audio) or img- (image).");
export const RTSTREAM_ID = z.string().describe("VideoDB real-time stream ID (starts with rts-).");

export const TIMELINE = z
  .array(z.tuple([z.number().min(0), z.number().min(0)]))
  .min(1)
  .describe("Segments as [start_seconds, end_seconds] pairs, e.g. [[10, 25], [60, 90]].");

export const CALLBACK_URL = z
  .string()
  .url()
  .optional()
  .describe("Optional webhook URL VideoDB calls when the job finishes (makes the call return immediately).");

export const PAGE = z.number().int().min(1).default(1).describe("Page number (1-based).");
export const PAGE_SIZE = z.number().int().min(1).max(1000).default(100).describe("Items per page.");

/** Infer media kind from VideoDB's ID prefixes. */
export function mediaKind(id: string): "video" | "audio" | "image" {
  if (id.startsWith("a-")) return "audio";
  if (id.startsWith("img-")) return "image";
  return "video";
}
