/**
 * Sitemap generated from the same registries that render the pages.
 *
 * CONTRACT:
 *   - HTML URLs only. Alternate renderings (.md twins) stay out on purpose:
 *     listing both is asking to be assessed for duplicate content.
 *   - `lastmod` only when a real content date backs it, as YYYY-MM-DD.
 *   - No changefreq or priority: Google ignores both
 *     (developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
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

/**
 * The content date as YYYY-MM-DD, the form sitemap-sharded.ts writes. Next
 * prints a Date as a full timestamp, which claims a time of day the content
 * date does not have.
 */
function toLastmod(contentDate: string): string {
  return contentDate.slice(0, 10);
}

export default function sitemap(): MetadataRoute.Sitemap {
  // Static entries first, then generated ones. Keeping them in one array makes
  // the total count checkable against the deployed sitemap.
  const core: MetadataRoute.Sitemap = [
    { url: SITE_URL },
    { url: `${SITE_URL}/guides` },
    { url: `${SITE_URL}/blog` },
    { url: `${SITE_URL}/data` },
    { url: `${SITE_URL}/about-the-data` },
  ];

  const guides: MetadataRoute.Sitemap = getPublishedGuides().map((g) => {
    const contentDate = g.updatedAt ?? g.publishDate;
    return {
      url: `${SITE_URL}/guides/${g.slug}`,
      // Conditional, never `new Date()`. A per-deploy timestamp claims the whole
      // site changes every deploy, which teaches crawlers to ignore the field.
      ...(contentDate ? { lastModified: toLastmod(contentDate) } : {}),
    };
  });

  const posts: MetadataRoute.Sitemap = getPublishedPosts().map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: toLastmod(p.updatedAt ?? p.publishDate),
  }));

  const tags: MetadataRoute.Sitemap = getAllTags().map((t) => ({
    url: `${SITE_URL}/blog/tag/${t.slug}`,
  }));

  // `comparableCompetitors` excludes your own entry. Generating from the raw
  // registry produces a self-comparison page in the sitemap and the hub.
  const comparisons: MetadataRoute.Sitemap = comparableCompetitors().flatMap((c) => [
    { url: `${SITE_URL}/vs/${c.slug}` },
    { url: `${SITE_URL}/alternatives/${c.slug}` },
  ]);

  return [...core, ...guides, ...posts, ...tags, ...comparisons];
}

/* CHECK AFTER EVERY EXPANSION.
 * Routes added late, especially on-demand ones, are frequently live and absent
 * here for months. Compare the deployed count against the registry:
 *
 *   curl -s https://example.com/sitemap.xml | grep -o "<loc>" | wc -l
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
