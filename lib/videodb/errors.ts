import { AuthenticationError, InvalidRequestError, RequestTimeoutError, VideodbError } from "videodb";
import { StillProcessing } from "./deadline";

/** Map SDK errors to messages an agent can act on. */
export function describeError(e: unknown): string {
  if (e instanceof StillProcessing) return e.message;
  if (e instanceof AuthenticationError) return "Invalid VideoDB API key (401). Reconnect the VideoDB connector.";
  if (e instanceof RequestTimeoutError) return "VideoDB is still processing this job. Retry in a few minutes.";
  if (e instanceof InvalidRequestError) {
    const cause = (e as { cause?: unknown }).cause;
    const detail = typeof cause === "string" ? cause : cause instanceof Error ? cause.message : "";
    return `VideoDB rejected the request${detail ? `: ${detail}` : "."}`;
  }
  if (e instanceof VideodbError) return e.message || "VideoDB request failed.";
  if (e instanceof Error) return e.message;
  return String(e);
}
