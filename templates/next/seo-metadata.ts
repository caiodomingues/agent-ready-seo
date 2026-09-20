/**
 * One source for title, description, canonical path and social image, read by
 * every surface that repeats them: the HTML head, the Open Graph block, the
 * markdown twin's front matter, the sitemap and the JSON-LD `headline`.
 *
 * CONTRACT (framework-neutral):
 *   - The <title> the crawler reads is produced by exactly one function, and
 *     that function is what tests and the production crawl measure. Not the
 *     raw string on the content object: the rendered tag, suffix included.
 *   - Whether a page family carries the site name is a policy table, not a
 *     per-page choice. Changing a family is changing one line.
 *   - A year token is added only when the title has none and the result still
 *     fits the budget.
 *   - Experiment variants override title and description by canonical path,
 *     carry an experiment id and a start date, and are reverted by deleting
 *     the entry. The original stays on the content object.
 *   - The `rel=alternate` to the markdown twin is emitted only for paths the
 *     twin registry knows, so the head never announces a twin that 404s.
 *
 * Pure on purpose: no database, no filesystem. sitemap.ts, llms.txt, the
 * markdown exporter and the tests all import it. Pages whose title depends on
 * a database value (the published period, a figure) pass it in as a parameter.
 *
 * File: src/lib/seo-metadata.ts
 */

import type { Metadata } from "next";
import { getGuide, getPublishedGuides } from "@/content/guides";
import { getPublishedPosts } from "@/lib/blog-data";
import { mdTwinFor } from "@/lib/md-twins";

export const SITE_URL = "https://example.com";
export const SITE_NAME = "Site";
export const TITLE_SUFFIX = ` | ${SITE_NAME}`;
/** Desktop results truncate close to this; a longer title is cut, usually at the year or the suffix. */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

export type SeoFamily = "guides" | "tools" | "blog" | "data" | "comparisons" | "site";

/**
 * `suffix`: does the rendered <title> carry TITLE_SUFFIX. `enforceLimits`: do
 * the tests fail a title over TITLE_MAX or a description over DESCRIPTION_MAX.
 * Content and tool pages usually drop the suffix (it displaces the words that
 * describe the page); the home page and institutional pages keep it.
 */
export const FAMILY_POLICY: Record<SeoFamily, { suffix: boolean; enforceLimits: boolean }> = {
  guides: { suffix: false, enforceLimits: true },
  tools: { suffix: false, enforceLimits: true },
  blog: { suffix: false, enforceLimits: true },
  data: { suffix: true, enforceLimits: false },
  comparisons: { suffix: true, enforceLimits: false },
  site: { suffix: true, enforceLimits: false },
};

export interface PageSeo {
  family: SeoFamily;
  /** Canonical path, leading slash, no host. */
  path: string;
  /** The bare title: front matter of the twin, Open Graph, JSON-LD headline. */
  headline: string;
  /** The exact <title>, suffix included where the family keeps it. */
  title: string;
  description: string;
  og: { type: "website" | "article"; title: string; description: string; image: string };
  /** True when `${path}.md` is registered in the twin registry. */
  markdownTwin: boolean;
}

/* ------------------------------ overrides ------------------------------ */

export interface SeoOverride {
  /** Bare title; the family decides whether it gains the suffix. */
  title: string;
  description: string;
  /** Identifier of the row in the experiments register. */
  experiment: string;
  /** Date (YYYY-MM-DD) the variant went live. */
  since: string;
}

/**
 * Keyed by canonical path. Reverting an experiment is deleting its entry; the
 * previous title is still on the content object. Only title and description:
 * canonical, H1 and the social image keep coming from the family.
 */
export const SEO_OVERRIDES: Record<string, SeoOverride> = {
  // "/guides/example-segment": {
  //   title: "How much to charge for X? Free calculator",
  //   description: "...",
  //   experiment: "ctr-cohort-1",
  //   since: "2026-09-18",
  // },
};

/* ------------------------------- assembly ------------------------------- */

export function renderTitle(family: SeoFamily, headline: string): string {
  return FAMILY_POLICY[family].suffix ? `${headline}${TITLE_SUFFIX}` : headline;
}

/**
 * Freshness token, added only when the headline has no year and the result
 * still fits. Without the guard a 55-character title gains seven and is cut
 * exactly on the year it was trying to show.
 */
export function withYear(headline: string, year = new Date().getFullYear()): string {
  if (/\b20\d{2}\b/.test(headline)) return headline;
  const dated = `${headline} (${year})`;
  return dated.length <= TITLE_MAX ? dated : headline;
}

export function hasMarkdownTwin(path: string): boolean {
  return mdTwinFor(path) !== null;
}

export function ogImageUrl(title: string, description: string, tag?: string): string {
  const q = new URLSearchParams({ title, description });
  if (tag) q.set("tag", tag);
  return `${SITE_URL}/api/og?${q.toString()}`;
}

interface PageInput {
  family: SeoFamily;
  path: string;
  headline: string;
  description: string;
  og?: { type?: PageSeo["og"]["type"]; tag?: string };
}

function page(input: PageInput): PageSeo {
  const override = SEO_OVERRIDES[input.path];
  const headline = override?.title ?? input.headline;
  const description = override?.description ?? input.description;
  return {
    family: input.family,
    path: input.path,
    headline,
    title: renderTitle(input.family, headline),
    description,
    og: {
      type: input.og?.type ?? "website",
      title: headline,
      description,
      image: ogImageUrl(headline, description, input.og?.tag),
    },
    markdownTwin: hasMarkdownTwin(input.path),
  };
}

/** Next.js `Metadata`. Page-specific extras (robots, keywords) spread in afterwards. */
export function toMetadata(seo: PageSeo): Metadata {
  const url = `${SITE_URL}${seo.path}`;
  return {
    // `absolute` escapes the layout template; the policy table already decided
    // whether the suffix is present.
    title: { absolute: seo.title },
    description: seo.description,
    alternates: {
      canonical: url,
      ...(seo.markdownTwin ? { types: { "text/markdown": `${url}.md` } } : {}),
    },
    openGraph: {
      type: seo.og.type,
      url,
      siteName: SITE_NAME,
      title: seo.og.title,
      description: seo.og.description,
      images: [{ url: seo.og.image, width: 1200, height: 630, alt: seo.og.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.og.title,
      description: seo.og.description,
      images: [seo.og.image],
    },
  };
}

/* ------------------------------ families ------------------------------ */

export function guideSeo(slug: string, year?: number): PageSeo | null {
  const guide = getGuide(slug);
  if (!guide) return null;
  return page({
    family: "guides",
    path: `/guides/${guide.slug}`,
    headline: withYear(guide.metaTitle, year),
    description: guide.metaDescription,
    og: { type: "article", tag: guide.category },
  });
}

export function postSeo(slug: string): PageSeo | null {
  const post = getPublishedPosts().find((p) => p.slug === slug);
  if (!post) return null;
  return page({
    family: "blog",
    path: `/blog/${post.slug}`,
    headline: post.title,
    description: post.description,
    og: { type: "article", tag: post.tag },
  });
}

/**
 * Every page whose metadata this module owns, for the tests and the crawl.
 * `year` is a parameter so the test is deterministic across New Year.
 */
export function listAllPages(year = new Date().getFullYear()): PageSeo[] {
  return [
    ...getPublishedGuides().map((g) => guideSeo(g.slug, year)!),
    ...getPublishedPosts().map((p) => postSeo(p.slug)!),
  ];
}

/* ------------------------------ the tests ------------------------------ */

/*
 * src/lib/seo-metadata.test.ts. The ratchet: pages over the limit when the
 * test was written are listed with their measured length. The list can only
 * shrink. A new page over the limit fails; a listed page that gets fixed fails
 * until its entry is deleted; a listed page whose length changes fails until
 * the entry is updated; a listed path that left the site fails.
 *
 *   const pages = listAllPages(2026);
 *   const enforced = pages.filter((p) => FAMILY_POLICY[p.family].enforceLimits);
 *
 *   const LEGACY_OVER_LIMIT: Record<string, { title?: number; description?: number }> = {
 *     "/guides/example": { title: 64 },
 *     "/blog/another-example": { description: 157 },
 *   };
 *
 *   test("rendered title fits", () => {
 *     const over = enforced
 *       .filter((p) => p.title.length > TITLE_MAX)
 *       .filter((p) => LEGACY_OVER_LIMIT[p.path]?.title !== p.title.length)
 *       .map((p) => `${p.path} (${p.title.length}): ${p.title}`);
 *     expect(over).toEqual([]);
 *   });
 *
 *   test("legacy debt only shrinks", () => {
 *     const byPath = new Map(pages.map((p) => [p.path, p]));
 *     for (const [path, legacy] of Object.entries(LEGACY_OVER_LIMIT)) {
 *       const p = byPath.get(path);
 *       expect(p, `${path} left the site; delete the entry`).toBeDefined();
 *       if (legacy.title !== undefined) expect(p!.title.length).toBe(legacy.title);
 *       if (legacy.description !== undefined) expect(p!.description.length).toBe(legacy.description);
 *     }
 *   });
 *
 *   test("no two paths share a title", () => {
 *     const seen = new Map<string, string>();
 *     const dupes = pages.flatMap((p) => {
 *       const other = seen.get(p.title);
 *       seen.set(p.title, p.path);
 *       return other ? [`${other} and ${p.path}: "${p.title}"`] : [];
 *     });
 *     expect(dupes).toEqual([]);
 *   });
 *
 *   test("families without suffix never carry it", () => {
 *     for (const p of pages) {
 *       expect(p.title.endsWith(TITLE_SUFFIX)).toBe(FAMILY_POLICY[p.family].suffix);
 *       expect(p.headline.endsWith(TITLE_SUFFIX)).toBe(false);
 *     }
 *   });
 */

/* VERIFY, against production, because the tag the crawler reads is the one
 * that matters:
 *
 *   curl -s https://example.com/guides/example | grep -oE "<title>[^<]*" | cut -c8- | awk '{ print length, $0 }'
 *
 * Then diff the rendered title against `guideSeo("example").title`. Any gap is
 * a surface that still writes its own string.
 */

/* PORTING
 * The policy table, the year guard and the override map are plain data and
 * functions. What changes is how the framework lets a page escape a global
 * title template; if it has none, `renderTitle` is already the whole title and
 * every page calls it. The twin registry dependency (`mdTwinFor`) is the same
 * one the rewrites use; see rewrites.ts.
 */
