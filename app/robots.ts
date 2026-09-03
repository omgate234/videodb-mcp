import type { MetadataRoute } from "next";
import { SITE } from "./site";

/** Only the landing page is content. The MCP endpoint, OAuth flow and discovery metadata are machine routes. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/llms.txt"], disallow: ["/mcp", "/oauth/", "/.well-known/"] }],
    sitemap: `${SITE.origin}/sitemap.xml`,
    host: SITE.origin,
  };
}
