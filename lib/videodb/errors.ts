import { AuthenticationError, InvalidRequestError, RequestTimeoutError, VideodbError } from "videodb";
import { StillProcessing } from "./deadline";

/**
 * The SDK wraps HTTP failures as `new InvalidRequestError(response, { cause: apiMessage })`,
 * and Error's options bag puts that object on `.cause` — so the API's message sits at
 * `e.cause.cause`, not `e.cause`. Unwrap both shapes, or every 4xx reads as a bare
 * "rejected the request" with no reason.
 */
function apiDetail(e: unknown): string {
  const cause = (e as { cause?: unknown }).cause;
  const unwrapped =
    typeof cause === "string"
      ? cause
      : cause instanceof Error
        ? cause.message
        : typeof (cause as { cause?: unknown })?.cause === "string"
          ? ((cause as { cause: string }).cause)
          : "";
  if (unwrapped && unwrapped !== "Unknown cause") return unwrapped;
  const body = (e as { response?: { data?: { message?: unknown } } }).response?.data?.message;
  return typeof body === "string" ? body : "";
}

const httpStatus = (e: unknown): number | undefined => (e as { response?: { status?: number } }).response?.status;

/**
 * A gateway timeout means the HTTP request died in transit, not the job: the write
 * keeps running on VideoDB. 500 is ambiguous and stays a real failure.
 */
const GATEWAY_TIMEOUT_STATUSES = new Set([408, 502, 503, 504]);

export function isGatewayTimeout(e: unknown): boolean {
  if (!(e instanceof InvalidRequestError)) return false;
  const status = httpStatus(e);
  return status !== undefined && GATEWAY_TIMEOUT_STATUSES.has(status);
}

/** Map SDK errors to messages an agent can act on. */
export function describeError(e: unknown): string {
  if (e instanceof StillProcessing) return e.message;
  if (e instanceof AuthenticationError) return "Invalid VideoDB API key (401). Reconnect the VideoDB connector.";
  if (e instanceof RequestTimeoutError) return "VideoDB is still processing this job. Retry in a few minutes.";
  if (e instanceof InvalidRequestError) {
    const status = httpStatus(e);
    const detail = apiDetail(e);
    const where = status ? ` (HTTP ${status})` : "";
    return detail ? `VideoDB rejected the request${where}: ${detail}` : `VideoDB rejected the request${where}.`;
  }
  if (e instanceof VideodbError) return e.message || "VideoDB request failed.";
  if (e instanceof Error) return e.message;
  return String(e);
}
