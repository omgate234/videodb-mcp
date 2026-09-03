import type { MetadataRoute } from "next";
import { SITE } from "./site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE.origin}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
