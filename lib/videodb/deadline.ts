/**
 * Tool calls must return inside the route's maxDuration. The SDK polls async
 * jobs for up to 500s, so we race it: on timeout the job keeps running server
 * side and the tool returns a "processing" result instead of an error.
 */
export const DEFAULT_TOOL_DEADLINE_MS = Number(process.env.TOOL_DEADLINE_MS) || 240_000;

export interface Processing {
  status: "processing";
  message: string;
  retry_with?: string;
}

/** Whose clock ran out: our own deadline, or the upstream API gateway. */
export type ProcessingReason = "deadline" | "gateway";

export class StillProcessing extends Error {
  constructor(
    public readonly label: string,
    public readonly retryWith?: string,
    public readonly reason: ProcessingReason = "deadline"
  ) {
    super(`${label} is still processing on VideoDB's side.`);
    this.name = "StillProcessing";
  }
  toResult(): Processing {
    const check = this.retryWith ? `check with ${this.retryWith}` : "verify whether it completed";
    return {
      status: "processing",
      message:
        this.reason === "gateway"
          ? `${this.label} outlived VideoDB's API gateway timeout. The job may still be running and may already have finished — ${check} before retrying, or you will create a duplicate.`
          : `${this.label} is still running on VideoDB. It continues in the background — check again in a minute.`,
      ...(this.retryWith ? { retry_with: this.retryWith } : {}),
    };
  }
}

export async function withDeadline<T>(
  work: Promise<T>,
  label: string,
  opts: { ms?: number; retryWith?: string } = {}
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StillProcessing(label, opts.retryWith)), opts.ms ?? DEFAULT_TOOL_DEADLINE_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
