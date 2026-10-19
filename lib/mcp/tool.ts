import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { client, type Connection } from "@/lib/videodb/client";
import { toPlain } from "@/lib/videodb/serialize";
import { withDeadline, StillProcessing } from "@/lib/videodb/deadline";
import { asAccountBlocked, describeError, httpStatus, isGatewayTimeout, withPromoLink, type AccountBlocked } from "@/lib/videodb/errors";
import { fetchPlanId } from "@/lib/videodb/auth";
import { recordToolCall, type Outcome } from "@/lib/telemetry";

/**
 * Tool kinds map 1:1 onto the annotations the Anthropic directory requires.
 * Pick the kind by what the tool does to the account, not by HTTP verb.
 */
export type ToolKind = "read" | "create" | "update" | "destructive";

export const ANNOTATIONS: Record<ToolKind, { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: boolean }> = {
  read: { readOnlyHint: true, openWorldHint: false },
  create: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  update: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  destructive: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
};

export interface ToolDef<S extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  input: S;
  /**
   * Return anything JSON-able or an SDK object — it is flattened by toPlain().
   * `deadline` (default 50s) races the SDK's internal polling; on timeout the
   * tool returns a "processing" result naming `retryWith`.
   */
  handler: (args: z.infer<S>, vdb: Connection) => Promise<unknown>;
  deadlineLabel?: string;
  retryWith?: string;
}

/**
 * Clients send `null` for a parameter the model chose not to fill, which zod
 * rejects on `.optional()`/`.default()` fields. Read null as "not provided" so
 * an unset param falls back to its default instead of failing validation.
 */
function nullAsAbsent(field: z.ZodType): z.ZodType {
  if (!field.safeParse(undefined).success) return field; // required — a null here is a real error
  const { description } = field;
  // The description moves to the wrapper, so the `anyOf` branch does not repeat it in every tool listing.
  const widened = field.meta({ description: undefined }).or(z.null()).transform((v) => (v === null ? field.parse(undefined) : v));
  return description ? widened.describe(description) : widened;
}

/** Rebuild the object with null-tolerant fields; `.refine()` checks are re-attached, since a rebuild drops them. */
function nullTolerant<S extends z.ZodObject<z.ZodRawShape>>(schema: S): S {
  const rebuilt = z.object(Object.fromEntries(Object.entries(schema.shape).map(([k, f]) => [k, nullAsAbsent(f as z.ZodType)])));
  const checks = (schema._zod.def.checks ?? []) as Parameters<typeof rebuilt.check>;
  return (checks.length ? rebuilt.check(...checks) : rebuilt) as unknown as S;
}

export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(def: ToolDef<S>): ToolDef<S> {
  if (def.name.length > 64) throw new Error(`Tool name too long: ${def.name}`);
  if (!/^[a-z][a-z0-9_]*$/.test(def.name)) throw new Error(`Tool name must be snake_case: ${def.name}`);
  return { ...def, input: nullTolerant(def.input) };
}

/** The verified bearer token's claims for this request, if any. */
function authInfoFrom(ctx: unknown): Record<string, any> | undefined {
  const c = ctx as Record<string, any> | undefined;
  return c?.http?.authInfo ?? c?.authInfo ?? c?.requestInfo?.authInfo;
}

/** Pull the VideoDB API key out of the verified bearer token for this request. */
export function apiKeyFrom(ctx: unknown): string {
  const key = authInfoFrom(ctx)?.extra?.videodbApiKey;
  if (typeof key !== "string" || !key) {
    throw new Error("Not authenticated with VideoDB. Connect the VideoDB connector first.");
  }
  return key;
}

type Content = { type: "text"; text: string };
export type ToolResult = { content: Content[]; isError?: boolean };

const text = (data: unknown): Content => ({
  type: "text",
  text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
});

const errorType = (e: unknown) => (e instanceof Error ? e.constructor.name : typeof e);

/** What a tool call settles to: the client's result, telemetry's outcome, and the out-of-credit state if that's why it stopped. */
type Settled = { result: ToolResult; outcome: Outcome; blocked?: AccountBlocked };

/** Map a thrown error to the result the client sees plus the outcome telemetry records. */
export function settleError(e: unknown, def: ToolDef<any>): Settled {
  if (e instanceof StillProcessing) {
    return { result: { content: [text(e.toResult())] }, outcome: { status: "processing", errorType: e.reason } };
  }
  // An upstream gateway timeout killed the request, not the job — reporting it as a
  // failure makes agents retry and duplicate a write that already succeeded.
  if (isGatewayTimeout(e)) {
    const still = new StillProcessing(def.deadlineLabel ?? def.title, def.retryWith, "gateway");
    return { result: { content: [text(still.toResult())] }, outcome: { status: "processing", errorType: "gateway", httpStatus: httpStatus(e) } };
  }
  // The account is out of credit — the user's to fix, so it is a result, not an error.
  // Telemetry's status enum has no slot for it; `result.status` tells the two apart.
  const blocked = asAccountBlocked(e);
  if (blocked) return { result: { content: [text(blocked)] }, outcome: { status: "success" }, blocked };
  const message = describeError(e);
  return {
    result: { content: [text(`Error: ${message}`)], isError: true },
    outcome: { status: "error", errorType: errorType(e), errorMessage: message, httpStatus: httpStatus(e) },
  };
}

/** Run a tool handler with deadline, serialization and error mapping applied. */
export async function run<S extends z.ZodObject<z.ZodRawShape>>(
  def: ToolDef<S>,
  args: z.infer<S>,
  vdb: Connection
): Promise<Settled> {
  try {
    const result = await withDeadline(def.handler(args, vdb), def.deadlineLabel ?? def.title, {
      retryWith: def.retryWith,
    });
    return { result: { content: [text(toPlain(result) ?? { ok: true })] }, outcome: { status: "success" } };
  } catch (e) {
    return settleError(e, def);
  }
}

export async function invoke<S extends z.ZodObject<z.ZodRawShape>>(
  def: ToolDef<S>,
  args: z.infer<S>,
  vdb: Connection
): Promise<ToolResult> {
  return (await run(def, args, vdb)).result;
}

export function register(server: McpServer, def: ToolDef<any>, toolset?: string): void {
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.input,
      annotations: { title: def.title, ...ANNOTATIONS[def.kind] },
    },
    async (args: unknown, ctx: unknown) => {
      const started = performance.now();
      const auth = authInfoFrom(ctx);
      let apiKey: string | undefined;
      let settled: Settled;
      try {
        apiKey = apiKeyFrom(ctx);
        settled = await run(def, args as never, client(apiKey));
        // Only an out-of-credit stop pays for the plan lookup that picks the console link.
        if (settled.blocked) {
          const linked = withPromoLink(settled.blocked, await fetchPlanId(apiKey));
          settled = { ...settled, result: { content: [text(linked)] } };
        }
      } catch (e) {
        settled = settleError(e, def); // no credential in the token
      }
      recordToolCall({
        tool: def.name,
        toolset,
        kind: def.kind,
        args,
        result: settled.result,
        outcome: settled.outcome,
        latencyMs: performance.now() - started,
        apiKey,
        email: typeof auth?.extra?.email === "string" ? auth.extra.email : undefined,
        userId: typeof auth?.extra?.userId === "string" ? auth.extra.userId : undefined,
        userName: typeof auth?.extra?.userName === "string" ? auth.extra.userName : undefined,
        clientId: typeof auth?.clientId === "string" ? auth.clientId : undefined,
      });
      return settled.result;
    }
  );
}
