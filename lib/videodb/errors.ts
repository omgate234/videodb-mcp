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

export const httpStatus = (e: unknown): number | undefined => (e as { response?: { status?: number } }).response?.status;

/** A background job VideoDB reported as failed, with the job body's error_code when it sent one. */
export class JobFailed extends Error {
  constructor(message: string, readonly outputUrl: string, readonly errorCode?: string) {
    super(message);
    this.name = "JobFailed";
  }
}

const errorCode = (e: unknown): string | undefined =>
  e instanceof JobFailed ? e.errorCode : (e as { response?: { data?: { error_code?: string } } }).response?.data?.error_code;

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

/**
 * Running out of credit is an account state the user fixes in the console, not a
 * tool failure. Reporting it as an MCP error counts against this server's error
 * rate — and a single unfunded account retrying in a loop would dominate it — so
 * it comes back as a normal result carrying the instruction instead.
 */
export interface AccountBlocked {
  status: "insufficient_credit";
  message: string;
  action_required: "add_credits";
  console_url: string;
}

const BILLING_URL = "https://console.videodb.io/?page=billing";
const PROMO_CODE = () => process.env.PRO_PROMO_CODE?.trim();

/** With a promo code configured, every out-of-credit result links the billing page carrying it. */
export function withPromoLink(blocked: AccountBlocked): AccountBlocked {
  const code = PROMO_CODE();
  if (!code) return blocked;
  return { ...blocked, console_url: `${BILLING_URL}&promo=${encodeURIComponent(code)}` };
}

const CREDIT_CODES = new Set(["insufficient_credit", "low_credit"]);
const CREDIT_PATTERN = /insufficient (?:credit|balance)|add credits|out of credits/i;

/** The API's own wording, unprefixed — `describeError` decorates it for the failure path. */
function rawMessage(e: unknown): string {
  const detail = apiDetail(e);
  if (detail) return detail;
  return e instanceof Error ? e.message : String(e);
}

/**
 * VideoDB refused the caller's own arguments (a clip past the end of the video, an
 * index name already taken, an id that does not exist). Like running out of credit,
 * that is not a failure of this server: clients grade connector health on tool
 * errors, so it comes back as a normal result that tells the model what to change.
 * Telemetry still records it as an error with the HTTP status, which is how observ
 * tells rejected inputs from failures.
 */
export interface InputRejected {
  status: "rejected";
  http_status: number;
  message: string;
  action_required: "fix_arguments";
}

const REJECTED_STATUSES = new Set([400, 404, 409, 422]);

export function asInputRejected(e: unknown): InputRejected | undefined {
  if (!(e instanceof InvalidRequestError)) return undefined;
  const status = httpStatus(e);
  if (status === undefined || !REJECTED_STATUSES.has(status)) return undefined;
  const detail = apiDetail(e) || "VideoDB rejected the request.";
  return {
    status: "rejected",
    http_status: status,
    message: `${detail} VideoDB refused these arguments; the server is working. Fix the arguments (check ids, ranges and names) and call again. Do not retry unchanged.`,
    action_required: "fix_arguments",
  };
}

/**
 * A Free plan usage limit refused the call. Like running out of credit it is the
 * user's account state, not a tool failure, so it comes back as a result. The
 * limit fields ride along so observ can record when and which limit was hit.
 */
export interface UsageLimited {
  status: "usage_limit_reached";
  message: string;
  action_required: "wait_or_upgrade";
  action?: string;
  window?: string;
  limit?: number;
  resets_at?: string;
  console_url: string;
}

export function asUsageLimited(e: unknown): UsageLimited | undefined {
  if (errorCode(e) !== "usage_limit_reached") return undefined;
  const data = (e as { response?: { data?: { data?: Record<string, unknown> } } }).response?.data?.data ?? {};
  const code = PROMO_CODE();
  return {
    status: "usage_limit_reached",
    message: `${rawMessage(e).trim() || "Free plan usage limit reached."} Nothing was charged and the request did not run. Tell the user which limit they reached and when it resets, and that upgrading to Pro removes the limit now: show console_url as an "Upgrade" link. Do not retry before resets_at; it will fail the same way.`,
    action_required: "wait_or_upgrade",
    action: typeof data.action === "string" ? data.action : undefined,
    window: typeof data.window === "string" ? data.window : undefined,
    limit: typeof data.limit === "number" ? data.limit : undefined,
    resets_at: typeof data.resets_at === "string" ? data.resets_at : undefined,
    console_url: code ? `${BILLING_URL}&promo=${encodeURIComponent(code)}` : BILLING_URL,
  };
}

export function asAccountBlocked(e: unknown): AccountBlocked | undefined {
  if (e instanceof StillProcessing) return undefined;
  const detail = rawMessage(e).trim();
  const isCredit = CREDIT_CODES.has(errorCode(e) ?? "") || httpStatus(e) === 402 || CREDIT_PATTERN.test(detail);
  if (!isCredit) return undefined;
  return {
    status: "insufficient_credit",
    message: `${detail || "VideoDB reported insufficient credit for this account."} Nothing was charged and the request did not run. Tell the user there aren't enough VideoDB credits to continue, show console_url as an "Add credits" link and say no subscription is required. Wait until they confirm they have added credits before retrying — retrying before that will fail the same way.`,
    action_required: "add_credits",
    console_url: BILLING_URL,
  };
}
