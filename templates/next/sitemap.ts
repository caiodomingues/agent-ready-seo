/**
 * Sitemap generated from the same registries that render the pages.
 *
 * CONTRACT:
 *   - HTML URLs only. Alternate renderings (.md twins) stay out on purpose:
 *     listing both is asking to be assessed for duplicate content.
 *   - `lastmod` only when a real content date backs it.
 *   - Publication filtering uses the same function the routes use, so the
 *     sitemap can never advertise a page that 404s.
 *
 * Drop at src/app/sitemap.ts. For corpora above ~40k URLs see sitemap-sharded.ts.
 */

import type { MetadataRoute } from "next";
import { getPublishedGuides } from "@/content/guides";
import { getPublishedPosts, getAllTags } from "@/lib/blog-data";
import { comparableCompetitors } from "@/content/competitors";

const SITE_URL = "https://example.com";

export default function sitemap(): MetadataRoute.Sitemap {
  // Static entries first, then generated ones. Keeping them in one array makes
  // the total count checkable against the deployed sitemap.
  const core: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/guides`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/data`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/about-the-data`, changeFrequency: "monthly", priority: 0.7 },
  ];

  const guides: MetadataRoute.Sitemap = getPublishedGuides().map((g) => ({
    url: `${SITE_URL}/guides/${g.slug}`,
    // Conditional, never `new Date()`. A per-deploy timestamp claims the whole
    // site changes every deploy, which teaches crawlers to ignore the field.
    ...(g.updatedAt ?? g.publishDate ? { lastModified: new Date(g.updatedAt ?? g.publishDate) } : {}),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const posts: MetadataRoute.Sitemap = getPublishedPosts().map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.updatedAt ?? p.publishDate),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const tags: MetadataRoute.Sitemap = getAllTags().map((t) => ({
    url: `${SITE_URL}/blog/tag/${t.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  // `comparableCompetitors` excludes your own entry. Generating from the raw
  // registry produces a self-comparison page in the sitemap and the hub.
  const comparisons: MetadataRoute.Sitemap = comparableCompetitors().flatMap((c) => [
    { url: `${SITE_URL}/vs/${c.slug}`, changeFrequency: "monthly" as const, priority: 0.6 },
    { url: `${SITE_URL}/alternatives/${c.slug}`, changeFrequency: "monthly" as const, priority: 0.6 },
  ]);

  return [...core, ...guides, ...posts, ...tags, ...comparisons];
}

/* CHECK AFTER EVERY EXPANSION.
 * Routes added late, especially on-demand ones, are frequently live and absent
 * here for months. Compare the deployed count against the registry:
 *
 *   curl -s https://example.com/sitemap.xml | grep -c "<loc>"
 *
 * and break it down by section to see which type is missing:
 *
 *   curl -s https://example.com/sitemap.xml \
 *     | grep -oE "<loc>[^<]+" | sed "s|<loc>https://example.com||" \
 *     | awk -F/ '{print ($2==""?"/(home)":"/"$2)}' | sort | uniq -c | sort -rn
 */

/* PORTING
 * The XML is trivial; the discipline is not. Whatever generates it must read the
 * same registry the router reads, apply the same published filter, and omit
 * lastmod rather than invent one.
 */
