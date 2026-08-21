/**
 * Sharded sitemap for large corpora: an index pointing at fixed-size shards.
 *
 * CONTRACT:
 *   /sitemap.xml       -> <sitemapindex> listing every shard
 *   /sitemap/0.xml     -> core pages (home, hubs, editorial)
 *   /sitemap/{n}.xml   -> entity pages in fixed blocks
 *
 * The protocol caps a file at 50,000 URLs and 50MB uncompressed. Use 40,000 so a
 * growth spurt between deploys cannot push a shard over.
 *
 * The index and the shards derive from the SAME function, so they can never
 * disagree about how many shards exist. That is the whole point of this file:
 * an index advertising a shard that 404s is worse than no index.
 */

/* ---------- src/lib/sitemap.ts ---------- */

import type { MetadataRoute } from "next";
import { listSitemapEntities, getCorePages } from "@/lib/content";

const SITE_URL = "https://example.com";
export const ENTITIES_PER_SHARD = 40_000;

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/** Shard 0 is core; shards 1..n are entities. */
export async function generateShards(): Promise<Array<{ id: number }>> {
  const entities = await listSitemapEntities();
  const shards = Math.max(1, Math.ceil(entities.length / ENTITIES_PER_SHARD));
  return Array.from({ length: shards + 1 }, (_, id) => ({ id }));
}

export async function getShardData(id: number): Promise<MetadataRoute.Sitemap | null> {
  const entities = await listSitemapEntities();
  const shards = Math.max(1, Math.ceil(entities.length / ENTITIES_PER_SHARD));
  if (id < 0 || id > shards) return null;

  if (id === 0) return getCorePages();

  const start = (id - 1) * ENTITIES_PER_SHARD;
  return entities.slice(start, start + ENTITIES_PER_SHARD).map((e) => ({
    url: absoluteUrl(`/items/${e.slug}`),
    ...(e.updatedAt ? { lastModified: new Date(e.updatedAt) } : {}),
    changeFrequency: "weekly" as const,
    priority: 0.5,
  }));
}

export function renderSitemap(entries: MetadataRoute.Sitemap): string {
  const urls = entries
    .map((e) => {
      const lastmod =
        e.lastModified instanceof Date
          ? `\n    <lastmod>${e.lastModified.toISOString().slice(0, 10)}</lastmod>`
          : "";
      return `  <url>\n    <loc>${e.url}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/* ---------- src/app/sitemap.xml/route.ts ---------- */

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const shards = await generateShards();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${shards.map(({ id }) => `  <sitemap>\n    <loc>${absoluteUrl(`/sitemap/${id}.xml`)}</loc>\n  </sitemap>`).join("\n")}
</sitemapindex>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/* ---------- src/app/sitemap/[id]/route.ts ---------- */

export async function generateStaticParams() {
  return (await generateShards()).map(({ id }) => ({ id: `${id}.xml` }));
}

export async function GET_SHARD(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const data = await getShardData(Number(id.replace(/\.xml$/, "")));
  if (!data) return new Response("Not Found", { status: 404 });

  return new Response(renderSitemap(data), {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/* VERIFY
 *   curl -s https://example.com/sitemap.xml | grep -c "<sitemap>"
 *   for i in 0 1 2; do curl -s https://example.com/sitemap/$i.xml | grep -c "<loc>"; done
 * Every shard the index lists must return 200 with a non-zero count.
 */

/* PORTING
 * Nothing here is framework-specific except the route file layout. The rules
 * that travel: one source of truth for shard count, deterministic slicing,
 * 404 for out-of-range ids, and headroom under the 50k cap.
 */
