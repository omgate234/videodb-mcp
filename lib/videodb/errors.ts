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
 * Running out of credit or hitting a plan cap is an account state, not a tool failure.
 * Reporting it as an MCP error counts against this server's error rate (one unfunded
 * account retrying in a loop would dominate it), so it comes back as a normal result.
 */
export type AccountBlocked =
  | { status: "insufficient_credit"; message: string; action_required: "add_credits"; console_url: string }
  | { status: "plan_limit"; message: string; action_required: "contact_support"; contact: string; console_url: string };

const CONSOLE_URL = "https://console.videodb.io";
const PROMO_CODE = () => process.env.PRO_PROMO_CODE?.trim();

/** With a promo code configured, every out-of-credit result links the billing page carrying it. */
export function withPromoLink(blocked: AccountBlocked): AccountBlocked {
  const code = PROMO_CODE();
  if (!code || blocked.status !== "insufficient_credit") return blocked;
  return { ...blocked, console_url: `${CONSOLE_URL}/?page=billing&promo=${encodeURIComponent(code)}` };
}

const SUPPORT_EMAIL = "team@videodb.io";
const CREDIT_PATTERN = /insufficient (?:credit|balance)|add credits|out of credits/i;
// videodb-server's plan caps: LIMIT_EXHAUST_MESSAGE, check_limit and the upload size quota.
const PLAN_LIMIT_PATTERN = /on your current plan|usage limit reached|limits? exhausted|increase the quota/i;

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

export function asAccountBlocked(e: unknown): AccountBlocked | undefined {
  if (e instanceof StillProcessing) return undefined;
  const detail = rawMessage(e).trim();
  if (CREDIT_PATTERN.test(detail) || httpStatus(e) === 402) {
    return {
      status: "insufficient_credit",
      message: `${detail || "VideoDB reported insufficient credit for this account."} Nothing was charged and the request did not run. Tell the user there aren't enough VideoDB credits to continue, show console_url as an "Add credits" link and say no subscription is required. Wait until they confirm they have added credits before retrying — retrying before that will fail the same way.`,
      action_required: "add_credits",
      console_url: CONSOLE_URL,
    };
  }
  if (PLAN_LIMIT_PATTERN.test(detail)) {
    return {
      status: "plan_limit",
      message: `${detail} Nothing was charged and the request did not run. Tell the user this account has reached a usage limit and that the VideoDB team can raise it: email ${SUPPORT_EMAIL}. Adding credits does not lift this limit. Do not retry until the user confirms the limit was raised.`,
      action_required: "contact_support",
      contact: SUPPORT_EMAIL,
      console_url: CONSOLE_URL,
    };
  }
  return undefined;
}
