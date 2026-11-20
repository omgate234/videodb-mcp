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

  toResult() {
    return { status: "failed" as const, output_url: this.outputUrl, message: this.message };
  }
}

/** The machine-readable error_code VideoDB attached, from a failed job or an HTTP error body. */
function errorCode(e: unknown): string | undefined {
  if (e instanceof JobFailed) return e.errorCode;
  const code = (e as { response?: { data?: { error_code?: unknown } } }).response?.data?.error_code;
  return typeof code === "string" ? code : undefined;
}

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
  | { status: "plan_limit"; limit: string; message: string; action_required: "contact_support"; contact: string; console_url: string }
  | { status: "plan_limit"; limit: string; message: string; action_required: "add_credits"; console_url: string };

const CONSOLE_URL = "https://console.videodb.io";
const PROMO_CODE = () => process.env.PRO_PROMO_CODE?.trim();

const SUPPORT_EMAIL = "team@videodb.io";
const FREE_PLAN = "Free_v1";
// Caps Pro raises over Free. A Free account that tops up through the promo link is moved to Pro.
const PROMO_LIFTS = /youtube search|translation|dubbing|(?:image|voice|music|video) generation/i;

const promoUrl = (code: string) => `${CONSOLE_URL}/?page=billing&promo=${encodeURIComponent(code)}`;

const contactSupport = (limit: string): AccountBlocked => ({
  status: "plan_limit",
  limit,
  message: `${limit} Nothing was charged and the request did not run. Tell the user this account has reached a usage limit and that the VideoDB team can raise it: email ${SUPPORT_EMAIL}. Adding credits does not lift this limit. Do not retry until the user confirms the limit was raised.`,
  action_required: "contact_support",
  contact: SUPPORT_EMAIL,
  console_url: CONSOLE_URL,
});

const liftByTopUp = (limit: string, code: string): AccountBlocked => ({
  status: "plan_limit",
  limit,
  message: `${limit} Nothing was charged and the request did not run. Tell the user this account has reached a usage limit and that adding credits lifts it: show console_url as an "Add credits" link and say no subscription is required. Wait until they confirm they have added credits before retrying.`,
  action_required: "add_credits",
  console_url: promoUrl(code),
});

/**
 * With a promo code configured, out-of-credit results link the billing page carrying it,
 * and so does a plan cap that a promo top-up lifts (Free account, cap Pro raises).
 * The plan is only looked up for that second case; if the lookup fails the cap stays a support ask.
 */
export async function withPromoLink(blocked: AccountBlocked, planOf: () => Promise<string | undefined>): Promise<AccountBlocked> {
  const code = PROMO_CODE();
  if (!code) return blocked;
  if (blocked.status === "insufficient_credit") return { ...blocked, console_url: promoUrl(code) };
  if (blocked.action_required !== "contact_support" || !PROMO_LIFTS.test(blocked.limit)) return blocked;
  const plan = await planOf().catch(() => undefined);
  return plan === FREE_PLAN ? liftByTopUp(blocked.limit, code) : blocked;
}

const CREDIT_CODES = new Set(["insufficient_credit", "low_credit"]);
// Fallback for the routes that send the credit message without an error_code.
const CREDIT_PATTERN = /insufficient (?:credit|balance)|add credits|out of credits/i;
// videodb-server's plan caps: LIMIT_EXHAUST_MESSAGE and the upload duration quota.
// Free plan usage limits ("usage limit reached") are deliberately not matched.
const PLAN_LIMIT_PATTERN = /on your current plan|increase the quota/i;

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
  if (CREDIT_CODES.has(errorCode(e) ?? "") || httpStatus(e) === 402 || CREDIT_PATTERN.test(detail)) {
    return {
      status: "insufficient_credit",
      message: `${detail || "VideoDB reported insufficient credit for this account."} Nothing was charged and the request did not run. Tell the user there aren't enough VideoDB credits to continue, show console_url as an "Add credits" link and say no subscription is required. Wait until they confirm they have added credits before retrying — retrying before that will fail the same way.`,
      action_required: "add_credits",
      console_url: CONSOLE_URL,
    };
  }
  if (PLAN_LIMIT_PATTERN.test(detail)) return contactSupport(detail);
  return undefined;
}
