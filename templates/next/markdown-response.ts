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

const SITE_URL = "https://example.com";

/** A 404 an agent can recover from, instead of a dead end. */
const NOT_FOUND_BODY = `404 - not found

This path does not exist. Try:
- ${SITE_URL}/llms.txt (index of everything)
- ${SITE_URL}/sitemap.xml
- ${SITE_URL}/guides (nearest hub)
`;

export function markdownResponse(body: string | null): Response {
  if (body === null) {
    return new Response(NOT_FOUND_BODY, {
      status: 404,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
    "X-Robots-Tag": "all",
    // Required when the same URL can also answer as HTML through Accept
    // negotiation. Without it a CDN serves whichever variant it cached first.
    Vary: "Accept",
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

/* ------------------------------------------------------------------ */
/* Content negotiation: the same URL answering markdown on request      */
/* ------------------------------------------------------------------ */

/**
 * The suffix (`/path.md`) is one way to ask. `Accept: text/markdown` on the
 * ordinary URL is the other, and external readiness scanners test for it.
 * Implement both: the suffix serves an agent holding only a URL string, and
 * negotiation serves an agent that fetches properly and should not have to
 * guess a URL shape.
 *
 * Compliance is four things: serve markdown when asked, set `Vary: Accept`,
 * return 406 for a type you cannot serve, and honor q-values so a browser still
 * gets HTML.
 */

interface AcceptEntry {
  type: string;
  q: number;
}

function parseAccept(header: string | null): AcceptEntry[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [type, ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([0-9.]+)\s*$/.exec(p)).find(Boolean)?.[1];
      return { type: type.trim().toLowerCase(), q: q === undefined ? 1 : Number(q) };
    })
    .filter((e) => e.type)
    .sort((a, b) => b.q - a.q);
}

/** True when the client prefers markdown over HTML. */
export function prefersMarkdown(acceptHeader: string | null): boolean {
  const entries = parseAccept(acceptHeader);
  if (entries.length === 0) return false;

  const md = entries.find((e) => e.type === "text/markdown")?.q ?? 0;
  if (md === 0) return false;

  const html = Math.max(
    entries.find((e) => e.type === "text/html")?.q ?? 0,
    entries.find((e) => e.type === "text/*")?.q ?? 0,
    entries.find((e) => e.type === "*/*")?.q ?? 0,
  );
  return md > html;
}

/** True when the client accepts nothing this resource can produce, so 406. */
export function acceptsNothingWeServe(acceptHeader: string | null): boolean {
  const entries = parseAccept(acceptHeader);
  if (entries.length === 0) return false;
  const servable = new Set(["text/html", "text/markdown", "text/*", "*/*"]);
  return !entries.some((e) => e.q > 0 && servable.has(e.type));
}

/*
 * In middleware (or proxy.ts, depending on the Next.js version). The matcher
 * must exclude `.md` and the other static extensions, so a request that
 * already carries the suffix is never renegotiated into a twin of the twin.
 *
 *   export function middleware(req: NextRequest) {
 *     const twin = mdTwinFor(req.nextUrl.pathname);   // registry in rewrites.ts
 *     if (!twin) return NextResponse.next();
 *
 *     const accept = req.headers.get("accept");
 *
 *     if (acceptsNothingWeServe(accept)) {
 *       return new NextResponse("406 - not acceptable\n", {
 *         status: 406,
 *         headers: { "Content-Type": "text/plain; charset=utf-8", Vary: "Accept" },
 *       });
 *     }
 *
 *     if (prefersMarkdown(accept)) {
 *       const res = NextResponse.rewrite(new URL(twin, req.url));
 *       res.headers.set("Vary", "Accept");
 *       return res;
 *     }
 *
 *     return NextResponse.next();
 *   }
 *
 *   export const config = {
 *     matcher: ["/((?!api/|_next/|.*\\.(?:md|txt|xml|json|svg|png|jpg|webp|ico|css|js|map|woff2?)$).*)"],
 *   };
 *
 * The HTML response goes out WITHOUT `Vary: Accept`, and that is not an
 * oversight. Next.js rebuilds the Vary of a page response for its own routing
 * (rsc, router-state) and drops the value set here, by a rewrite, or by
 * `headers()` in the config; all three were tried against a production build.
 * It is safe because the variant is chosen here, before any cache lookup, and
 * each variant lives at its own path: a client that prefers markdown is
 * rewritten to `/x.md` and never reads the cache entry for `/x`. The markdown
 * variant is the one that must carry Vary, and does.
 *
 * `mdTwinFor` must read the same registry the rewrites use. A route that
 * negotiates but has no twin returns 404 for a page that renders fine in a
 * browser, which is the worst possible outcome of adding this.
 *
 *   curl -sI -H "Accept: text/markdown" https://example.com/guides/onboarding \
 *     | grep -iE "^HTTP|content-type|vary"          # 200, text/markdown, Vary: Accept
 *   curl -sI -H "Accept: text/markdown" https://example.com/guides/onboarding.md \
 *     | grep -iE "^HTTP"                            # 200, not renegotiated
 */

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
