/**
 * Mapping `/{path}.md` to the route handlers that generate the twins.
 *
 * CONTRACT: the twin answers at the page's own URL plus `.md`, so an agent that
 * knows the page address needs no discovery call to reach the clean version.
 * The handlers live under a private prefix; nothing links to that prefix.
 *
 * Drop into next.config.ts.
 */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Home. Its twin is /index.md because /.md is not a valid path, and its
      // canonical is the bare root, which the generator must emit explicitly.
      { source: "/index.md", destination: "/api/md/home" },

      // Hubs.
      { source: "/blog.md", destination: "/api/md/blog" },
      { source: "/guides.md", destination: "/api/md/guides" },
      { source: "/data.md", destination: "/api/md/data" },

      // Leaf pages.
      { source: "/blog/:slug.md", destination: "/api/md/blog/:slug" },
      { source: "/guides/:slug.md", destination: "/api/md/guides/:slug" },
      { source: "/vs/:slug.md", destination: "/api/md/vs/:slug" },

      // ORDER MATTERS. A literal segment loses to a parameter declared before
      // it, so the specific route has to come first. Reversed, `item` is
      // captured as :category and the wrong generator answers.
      { source: "/data/item/:slug.md", destination: "/api/md/data/item/:slug" },
      { source: "/data/:category/:region.md", destination: "/api/md/data/:category/:region" },

      // A markdown-only page: no HTML twin exists, the canonical points at the
      // closest HTML equivalent (an anchor on another page is acceptable).
      { source: "/pricing.md", destination: "/api/md/pricing" },
      { source: "/plans.md", destination: "/api/md/pricing" },
    ];
  },

  // Required only when a handler reads content files from disk at request time.
  outputFileTracingIncludes: {
    "/api/md/**": ["./src/content/mirror/**/*.md"],
    "/llms-full.txt": ["./src/content/mirror/**/*.md"],
  },
};

export default nextConfig;

/* TEST THE OVERLAPPING PAIR EXPLICITLY.
 * Both routes return 200 on their happy path, so a spot check passes while the
 * ordering bug is live. Assert the resolved generator, not just the status:
 *
 *   expect(await get("/data/item/blue-widget.md")).toContain("source_url: .../data/item/blue-widget")
 *   expect(await get("/data/tools/us-ca.md")).toContain("source_url: .../data/tools/us-ca")
 */

/* PORTING
 * Express: app.get(/^\/(.*)\.md$/, handler) and dispatch on the captured path,
 *          matching most-specific patterns first, in declaration order.
 * Astro:   file-based routing already gives you this: src/pages/guides/[slug].md.ts.
 * Caddy/nginx: rewrite ^/(.*)\.md$ /api/md/$1 with location blocks ordered
 *          specific-first (nginx matches longest prefix, so verify).
 * Rails:   get "/guides/:slug", to: "guides#show", defaults: { format: :md },
 *          constraints on the specific route declared above the general one.
 */
