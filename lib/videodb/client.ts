import { connect, type Connection } from "videodb";

// Never let the SDK's .play() helpers spawn a browser inside a serverless function.
process.env.VIDEODB_NO_BROWSER ??= "1";

const BASE_URL = () => process.env.VIDEODB_API_BASE || "https://api.videodb.io";

/** One SDK connection per tool call; the key comes from the verified bearer token. */
export function client(apiKey: string): Connection {
  return connect({ apiKey, baseUrl: BASE_URL(), headers: { client: "videodb-mcp/2.0.0" } });
}

export type { Connection };
