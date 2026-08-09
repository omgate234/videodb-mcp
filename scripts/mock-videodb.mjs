/**
 * Mock VideoDB API for local end-to-end testing (scripts/e2e.mjs).
 * Implements the envelope + async-poll wire protocol of api.videodb.io.
 *
 * Usage:  node scripts/mock-videodb.mjs   (listens on :4519)
 * Then run the app with VIDEODB_API_BASE=http://127.0.0.1:4519
 */
import { createServer } from "node:http";

const PORT = process.env.MOCK_PORT || 4519;
const VALID_KEY = "sk-e2e-test-key";

let asyncHits = 0;

const ok = (data, extra = {}) => JSON.stringify({ success: true, data, ...extra });

const routes = {
  "GET /user": () =>
    ok({ user_id: "u-1", user_name: "E2E", user_email: "e2e@videodb.io", collections: ["default"] }),
  "GET /collection": () =>
    ok({ collections: [{ id: "default", name: "Default", description: "", is_public: false }] }),
  "GET /video": () =>
    ok({
      videos: [
        {
          id: "m-1",
          collection_id: "default",
          name: "Big Buck Bunny",
          length: 596,
          stream_url: "https://stream.videodb.io/v3/x.m3u8",
          player_url: "https://player.videodb.io/watch?v=abc",
        },
      ],
    }),
  "GET /video/m-1": () =>
    ok({ id: "m-1", collection_id: "default", name: "Big Buck Bunny", length: 596 }),
  "POST /video/m-1/search": () =>
    ok({
      results: [
        {
          video_id: "m-1",
          collection_id: "default",
          title: "Big Buck Bunny",
          length: 596,
          docs: [{ start: 10.5, end: 21.2, text: "a giant rabbit appears", score: 0.91 }],
        },
      ],
    }),
  // Long-running: first return processing + output_url, then resolve on 2nd poll.
  "POST /video/m-1/stream": () => {
    asyncHits = 0;
    return JSON.stringify({
      success: true,
      status: "processing",
      request_type: "sync",
      data: { output_url: `http://127.0.0.1:${PORT}/async-response/1` },
    });
  },
  "GET /async-response/1": () => {
    asyncHits += 1;
    if (asyncHits < 2) return JSON.stringify({ success: true, status: "processing", data: {} });
    return JSON.stringify({
      response: {
        success: true,
        status: "done",
        data: {
          stream_url: "https://stream.videodb.io/v3/clip.m3u8",
          player_url: "https://player.videodb.io/watch?v=clip",
        },
      },
    });
  },
  "DELETE /video/m-1": () => ok(null),
};

createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const routeKey = `${req.method} ${url.pathname}`;

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");
    if (req.headers["x-access-token"] !== VALID_KEY) {
      res.statusCode = 401;
      res.end(JSON.stringify({ success: false, message: "Invalid API key" }));
      return;
    }
    const handler = routes[routeKey];
    if (!handler) {
      res.statusCode = 404;
      res.end(JSON.stringify({ success: false, message: `mock: no route ${routeKey}` }));
      return;
    }
    res.end(handler(body));
  });
}).listen(PORT, () => {
  console.log(`mock VideoDB API listening on http://127.0.0.1:${PORT} (key: ${VALID_KEY})`);
});
