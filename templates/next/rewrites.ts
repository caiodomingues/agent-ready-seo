/**
 * The twin registry, and the rewrites generated from it.
 *
 * CONTRACT: the twin answers at the page's own URL plus `.md`, so an agent that
 * knows the page address needs no discovery call to reach the clean version.
 * The handlers live under a private prefix; nothing links to that prefix.
 *
 * Five surfaces need to agree on which pages have a twin: the rewrites, the
 * Accept negotiation in the middleware, the `rel=alternate` in page metadata,
 * the claim in llms.txt, and the check that every registered route has a
 * handler. They agree only when all five read this one list. A route that
 * negotiates without a twin turns a page that opens fine in a browser into a
 * 404 for an agent; a head that announces a twin that is not served is an
 * llms.txt promise that 404s, one page at a time.
 *
 * Two files: the registry (dependency-free, because next.config.ts and the
 * edge middleware both import it) and the config that consumes it.
 */

/* ------------------------- src/lib/md-twins.ts ------------------------- */

export interface MdTwinRoute {
  /** HTML page path in rewrite syntax. `null` when only the .md exists. */
  page: string | null;
  /** URL of the markdown twin. */
  md: string;
  /** Handler that generates it. */
  api: string;
}

/**
 * ORDER MATTERS for the rewrites. A literal segment loses to a parameter
 * declared before it in the same position, so the specific pattern has to
 * come first. Reversed, `item` is captured as :category and the wrong
 * generator answers with a plausible 404.
 */
export const MD_TWIN_ROUTES: readonly MdTwinRoute[] = [
  // Home. Its twin is /index.md because /.md is not a valid path, and its
  // canonical is the bare root, which the generator must emit explicitly.
  { page: "/", md: "/index.md", api: "/api/md/home" },

  { page: "/blog", md: "/blog.md", api: "/api/md/blog" },
  // Before /blog/:slug, or "tag" is captured as a post slug.
  { page: "/blog/tag/:tag", md: "/blog/tag/:tag.md", api: "/api/md/blog/tag/:tag" },
  { page: "/blog/:slug", md: "/blog/:slug.md", api: "/api/md/blog/:slug" },

  { page: "/guides", md: "/guides.md", api: "/api/md/guides" },
  { page: "/guides/:slug", md: "/guides/:slug.md", api: "/api/md/guides/:slug" },

  { page: "/data", md: "/data.md", api: "/api/md/data" },
  // Before /data/:category/:region, or the item slug is captured as a region.
  { page: "/data/item/:slug", md: "/data/item/:slug.md", api: "/api/md/data/item/:slug" },
  { page: "/data/:category", md: "/data/:category.md", api: "/api/md/data/:category" },
  { page: "/data/:category/:region", md: "/data/:category/:region.md", api: "/api/md/data/:category/:region" },

  { page: "/vs/:slug", md: "/vs/:slug.md", api: "/api/md/vs/:slug" },
  { page: "/about-the-data", md: "/about-the-data.md", api: "/api/md/about-the-data" },

  // Markdown-only: no HTML page exists at /pricing. The document's canonical
  // points at the closest HTML equivalent (an anchor on the home page).
  { page: null, md: "/pricing.md", api: "/api/md/pricing" },
  { page: null, md: "/plans.md", api: "/api/md/pricing" },
];

/**
 * Pages a pattern above captures that deliberately have no twin. Without this
 * list, `Accept: text/markdown` on the methodology page returns 404 for a page
 * that opens normally, because `/data/:category` matches the literal segment
 * `methodology`. The methodology page is kept without a twin on purpose: a
 * hand-written, precise document is exactly where two renderings drift.
 */
const PAGES_WITHOUT_TWIN = new Set(["/data/methodology"]);

export function mdRewrites(): { source: string; destination: string }[] {
  return MD_TWIN_ROUTES.map((r) => ({ source: r.md, destination: r.api }));
}

function toRegExp(pattern: string): RegExp {
  const source = pattern
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${source}$`);
}

const PAGE_MATCHERS = MD_TWIN_ROUTES.filter(
  (r): r is MdTwinRoute & { page: string } => r.page !== null,
).map((r) => ({ re: toRegExp(r.page), md: r.md, page: r.page }));

/**
 * The twin URL for a concrete page path, or null when the page has none.
 * Read by the middleware (negotiation), by seo-metadata.ts (rel=alternate)
 * and by llms.txt (which sections to claim).
 */
export function mdTwinFor(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (PAGES_WITHOUT_TWIN.has(path)) return null;

  for (const { re, md, page } of PAGE_MATCHERS) {
    if (!re.test(path)) continue;
    if (!md.includes(":")) return md;

    const pageSegments = page.split("/");
    const pathSegments = path.split("/");
    return md
      .split("/")
      .map((seg) => {
        if (!seg.startsWith(":")) return seg;
        const value = pathSegments[pageSegments.indexOf(seg.replace(/\.md$/, ""))];
        return seg.endsWith(".md") ? `${value}.md` : value;
      })
      .join("/");
  }
  return null;
}

/* ---------------------------- next.config.ts ---------------------------- */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return mdRewrites();
  },

  // Required only when a handler reads content files from disk at request time.
  outputFileTracingIncludes: {
    "/api/md/**": ["./src/content/mirror/**/*.md"],
    "/llms-full.txt": ["./src/content/mirror/**/*.md"],
  },
};

export default nextConfig;

/* THE CHECK THAT KEEPS THE REGISTRY HONEST, in CI (see references/verification.md):
 *
 *   for (const route of MD_TWIN_ROUTES) {
 *     const handler = join("src/app", ...route.api.split("/").filter(Boolean), "route.ts")
 *       .replace(/:([^/\\]+)/g, "[$1]");
 *     if (!existsSync(handler)) problems.push(`${route.md}: registered, no handler`);
 *   }
 *
 * TEST THE OVERLAPPING PAIR EXPLICITLY. Both routes return 200 on their happy
 * path, so a spot check passes while the ordering bug is live. Assert the
 * resolved generator, not just the status:
 *
 *   expect(await get("/data/item/blue-widget.md")).toContain("source_url: .../data/item/blue-widget")
 *   expect(await get("/data/tools/us-ca.md")).toContain("source_url: .../data/tools/us-ca")
 *
 * And the exception: `mdTwinFor("/data/methodology")` is null, and
 * `curl -H "Accept: text/markdown" .../data/methodology` returns the HTML page.
 */

/* PORTING
 * Express: app.get(/^\/(.*)\.md$/, handler) and dispatch on the captured path,
 *          matching most-specific patterns first, in declaration order.
 * Astro:   file-based routing already gives you this: src/pages/guides/[slug].md.ts.
 * Caddy/nginx: rewrite ^/(.*)\.md$ /api/md/$1 with location blocks ordered
 *          specific-first (nginx matches longest prefix, so verify).
 * Rails:   get "/guides/:slug", to: "guides#show", defaults: { format: :md },
 *          constraints on the specific route declared above the general one.
 * The registry itself is plain data and travels anywhere; the point is that
 * one list feeds every surface, whatever the router.
 */
