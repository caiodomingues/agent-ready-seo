/**
 * Shared HTTP wrapper for every `.md` twin endpoint.
 *
 * CONTRACT (framework-neutral):
 *   200 -> Content-Type: text/markdown; charset=utf-8
 *          Cache-Control: public, max-age=3600, s-maxage=3600
 *          X-Robots-Tag: all
 *          Link: <html-url>; rel="canonical"
 *   404 -> Content-Type: text/plain; charset=utf-8, non-empty body
 *
 * Two decisions worth keeping when adapting this:
 *
 * 1. The canonical comes from the document's own front matter, never from the
 *    request path. Rebuilding it from the request means a rewrite bug produces a
 *    self-referential canonical, which is the exact failure this header prevents.
 *
 * 2. `X-Robots-Tag: all` is deliberate. The twin may be indexed if found; the
 *    canonical decides which URL gets credit. `noindex` here would also stop AI
 *    fetchers that respect it, which defeats the purpose of publishing the twin.
 */

/** Reads `source_url:` out of the document front matter. */
export function sourceUrlOf(doc: string): string | null {
  return /^source_url:\s*(\S+)\s*$/m.exec(doc)?.[1] ?? null;
}

export function markdownResponse(body: string | null): Response {
  if (body === null) {
    return new Response("404 - not found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
    "X-Robots-Tag": "all",
  };

  const canonical = sourceUrlOf(body);
  if (canonical) headers.Link = `<${canonical}>; rel="canonical"`;

  return new Response(body, { headers });
}

/**
 * Front matter every generator should emit. `source_url` is required: it is what
 * markdownResponse turns into the canonical header.
 *
 * The home page is the edge case. Its twin lives at `/index.md` while its
 * canonical is the bare root, so pass "/" explicitly rather than deriving it.
 */
export function frontMatter(fields: {
  title: string;
  sourceUrl: string;
  updated?: string;
  description?: string;
}): string {
  const lines = [
    `title: ${fields.title}`,
    `source_url: ${fields.sourceUrl}`,
    ...(fields.updated ? [`updated: ${fields.updated}`] : []),
    ...(fields.description ? [`description: ${fields.description}`] : []),
  ];
  return `---\n${lines.join("\n")}\n---\n\n`;
}

/* PORTING
 * Express / Hono / Fastify: set the same four headers on the response object;
 *   see ../generic/express-md-route.js.
 * Astro:   src/pages/[...slug].md.ts exporting GET, returning the same Response.
 * Rails:   respond_to { |f| f.md { render plain: body, content_type: "text/markdown" } }
 *          and response.headers["Link"] = ...
 * Django:  HttpResponse(body, content_type="text/markdown; charset=utf-8")
 *          then response["Link"] = ...
 * Static:  emit .md files at build time; set headers in the CDN config. The
 *          canonical Link header is the part static hosts most often cannot do,
 *          in which case keep the twins out of the sitemap and rely on llms.txt.
 */
