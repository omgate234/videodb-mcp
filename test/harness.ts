import { vi } from "vitest";
import { Connection } from "videodb";
import { invoke, type ToolDef } from "@/lib/mcp/tool";

/**
 * Every SDK call goes through Connection.vhttp, so tests fake that one seam
 * and let the real SDK classes (Collection, Video, RTStream…) run. Stubs are
 * keyed "METHOD path" and hold the *camelCased* `data` the SDK would see after
 * its snake→camel conversion (what the handler receives), e.g.
 *
 *   const vdb = fakeConnection({
 *     "GET video/m-1": { id: "m-1", collectionId: "c-1", length: 10, streamUrl: "s", ... },
 *     "POST video/m-1/stream": { streamUrl: "https://stream" },
 *   });
 *   const { data } = await call(getVideo, { video_id: "m-1", collection_id: "c-1" }, vdb);
 *   expect(vdb.http.get).toHaveBeenCalledWith(["video", "m-1"], expect.anything(), undefined);
 *
 * A stub may be a function `(body, options) => data` to assert on request bodies.
 * A stub value of `Error` instance is thrown. Wrap a stub in `raw(body)` to
 * return the body verbatim (no {success, data} envelope) — what the SDK yields
 * for unpolled `{wait:false}` calls in lib/videodb/jobs.ts.
 */
const RAW = Symbol("raw");
export const raw = (body: unknown) => ({ [RAW]: body });
type Stub = unknown | ((body: unknown, options: unknown) => unknown);
type Verb = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface FakeConnection extends Connection {
  http: Record<Lowercase<Verb>, ReturnType<typeof vi.fn>>;
}

export function fakeConnection(stubs: Record<string, Stub> = {}): FakeConnection {
  const lookup = (verb: Verb, urlSeries: string[], body: unknown, options: unknown) => {
    const path = urlSeries.join("/");
    const key = `${verb} ${path}`;
    if (!(key in stubs)) throw new Error(`No stub for "${key}". Stubbed: ${Object.keys(stubs).join(", ") || "(none)"}`);
    const stub = stubs[key];
    const data = typeof stub === "function" ? (stub as any)(body, options) : stub;
    if (data instanceof Error) throw data;
    if (data && typeof data === "object" && RAW in data) return Promise.resolve((data as Record<symbol, unknown>)[RAW]);
    return Promise.resolve({ success: true, data });
  };
  const http = {
    get: vi.fn((u: string[], o?: unknown) => lookup("GET", u, undefined, o)),
    delete: vi.fn((u: string[], o?: unknown) => lookup("DELETE", u, undefined, o)),
    post: vi.fn((u: string[], b?: unknown, o?: unknown) => lookup("POST", u, b, o)),
    put: vi.fn((u: string[], b?: unknown, o?: unknown) => lookup("PUT", u, b, o)),
    patch: vi.fn((u: string[], b?: unknown, o?: unknown) => lookup("PATCH", u, b, o)),
  };
  const conn = new Connection("https://api.test", { apiKey: "test-key" }) as FakeConnection;
  conn.vhttp = http as any;
  conn.http = http;
  return conn;
}

/** Invoke a tool exactly as the MCP route does and parse the JSON text back. */
export async function call<S extends ToolDef<any>>(tool: S, args: Record<string, unknown>, vdb: Connection) {
  const parsed = tool.input.parse(args);
  const res = await invoke(tool, parsed, vdb);
  const text = res.content[0]?.text ?? "";
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* plain text result */
  }
  return { data, isError: res.isError === true, raw: res };
}

export const toolNamed = (ts: { tools: ToolDef<any>[] }, name: string): ToolDef<any> => {
  const t = ts.tools.find((x) => x.name === name);
  if (!t) throw new Error(`No tool ${name} in toolset`);
  return t;
};
