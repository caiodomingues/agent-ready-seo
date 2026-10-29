/**
 * Shared HTTP wrapper for every `.md` twin endpoint.
 *
 * CONTRACT (framework-neutral):
 *   200 -> Content-Type: text/markdown; charset=utf-8
 *          Cache-Control: public, max-age=3600, s-maxage=3600
 *          X-Robots-Tag: all
 *          Vary: Accept
 *          Link: <html-url>; rel="canonical", <site>/llms.txt; rel="describedby"
 *   404 -> Content-Type: text/markdown; charset=utf-8
 *          Vary: Accept
 *          non-empty body with recovery links
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

/** The llms.txt that covers every twin (llmstxt.org). */
export const DESCRIBED_BY = `<${SITE_URL}/llms.txt>; rel="describedby"`;

export function markdownResponse(body: string | null): Response {
  if (body === null) {
    return new Response(NOT_FOUND_BODY, {
      status: 404,
      // The proxy also returns this 404 for an unknown path, chosen by Accept.
      headers: { "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept" },
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
  headers.Link = canonical ? `<${canonical}>; rel="canonical", ${DESCRIBED_BY}` : DESCRIBED_BY;

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

interface AcceptRange {
  type: string;
  subtype: string;
  q: number;
}

function parseAccept(header: string | null): AcceptRange[] {
  if (!header) return [];
  return header.split(",").flatMap((part) => {
    const [range = "", ...params] = part.split(";").map((s) => s.trim().toLowerCase());
    const [type, subtype] = range.split("/");
    if (!type || !subtype) return [];
    const q = Number(params.find((p) => p.startsWith("q="))?.slice(2) ?? 1);
    return [{ type, subtype, q: Number.isNaN(q) ? 1 : q }];
  });
}

const EXACT = 2;

/**
 * The range that sets a type's q is the most specific one that matches it
 * (RFC 9110 12.5.1): `text/html;q=0.1` next to a full wildcard at q=0.9
 * gives HTML 0.1, not 0.9.
 */
function mostSpecificRange(ranges: AcceptRange[], mime: string) {
  const [type, subtype] = mime.split("/");
  let best: { q: number; specificity: number } | null = null;
  for (const r of ranges) {
    const specificity =
      r.type === type && r.subtype === subtype ? EXACT
      : r.type === type && r.subtype === "*" ? 1
      : r.type === "*" && r.subtype === "*" ? 0
      : -1;
    if (specificity > (best?.specificity ?? -1)) best = { q: r.q, specificity };
  }
  return best;
}

/** q the client assigns to `mime`; 0 means not acceptable. No header accepts anything. */
export function acceptQuality(acceptHeader: string | null, mime: string): number {
  const ranges = parseAccept(acceptHeader);
  if (ranges.length === 0) return 1;
  return mostSpecificRange(ranges, mime)?.q ?? 0;
}

/** True when the client prefers markdown over HTML. A tie goes to HTML. */
export function prefersMarkdown(acceptHeader: string | null): boolean {
  const md = acceptQuality(acceptHeader, "text/markdown");
  return md > 0 && md > acceptQuality(acceptHeader, "text/html");
}

/** True when the client accepts nothing this resource can produce, so 406. */
export function acceptsNothingWeServe(acceptHeader: string | null): boolean {
  return acceptQuality(acceptHeader, "text/markdown") === 0 && acceptQuality(acceptHeader, "text/html") === 0;
}

/**
 * Picks the 404 body: true only when the client names text/html or
 * application/xhtml+xml itself with q > 0. A wildcard does not count, so curl
 * and most agents get the markdown 404 and browsers get the site's 404 page.
 */
export function acceptsHtml(acceptHeader: string | null): boolean {
  const ranges = parseAccept(acceptHeader);
  return ["text/html", "application/xhtml+xml"].some((mime) => {
    const range = mostSpecificRange(ranges, mime);
    return range !== null && range.specificity === EXACT && range.q > 0;
  });
}

/*
 * In src/proxy.ts (Next 15 and earlier: src/middleware.ts exporting
 * `middleware`). The matcher lets paths with an extension through on purpose:
 * on a gated site `/dashboard/export.csv` must meet the session gate, and a
 * matcher that skips extensions serves it to anyone. `isPageShapedPath` keeps
 * extension paths out of everything after the gate instead: `.md`, so a
 * request that already carries the suffix is never renegotiated into a twin of
 * the twin, and public files, so an image fetch never meets the negotiated
 * 404. The costs: one proxy invocation per asset request (a site without a
 * gate can use the narrower matcher in first-touch.ts), and a page slug
 * containing a dot (`/blog/v1.2-release`) gets no negotiation; keep slugs
 * dot-free.
 *
 *   export function proxy(req: NextRequest) {
 *     const { pathname } = req.nextUrl;
 *     const accept = req.headers.get("accept");
 *
 *     // Gated site only (gated-app-404.ts; hasSession is the app's own check).
 *     // First, before any branch that returns NextResponse.next().
 *     if (!hasSession(req) && (isGatedAppPath(pathname) || (!isKnownPath(pathname) && !mdTwinFor(pathname)))) {
 *       return unauthenticatedResponse(req);
 *     }
 *
 *     // Public files, `.md` URLs and metadata routes (/opengraph-image, /icon:
 *     // no extension, and they match page patterns such as /blog/:slug, so
 *     // without this an image fetch gets 406).
 *     if (!isPageShapedPath(pathname)) return NextResponse.next();
 *
 *     const twin = twinStatus(pathname);               // md-route.ts
 *     if (!twin?.live) {
 *       // A pattern match with no document behind it (/guides/does-not-exist)
 *       // is as unknown as an unrouted path. isKnownPath is only as
 *       // trustworthy as the directory test behind it.
 *       const unknown = twin !== null || !isKnownPath(pathname);
 *       if (unknown && !acceptsHtml(accept)) return markdownResponse(null);
 *       return NextResponse.next();
 *     }
 *
 *     if (acceptsNothingWeServe(accept)) {
 *       return new NextResponse("406 - not acceptable\n", {
 *         status: 406,
 *         headers: { "Content-Type": "text/plain; charset=utf-8", Vary: "Accept" },
 *       });
 *     }
 *
 *     if (prefersMarkdown(accept)) {
 *       const res = NextResponse.rewrite(new URL(twin.md, req.url));
 *       res.headers.set("Vary", "Accept");
 *       return res;
 *     }
 *
 *     const res = NextResponse.next();
 *     // append, not set: the host may add its own Link values (preloads).
 *     res.headers.append("Link", `<${SITE_URL}${twin.md}>; rel="alternate"; type="text/markdown"`);
 *     res.headers.append("Link", DESCRIBED_BY);
 *     return res;
 *   }
 *
 *   export const config = {
 *     matcher: ["/((?!api/|_next/).*)"],
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
 * `twinStatus` reads the same registry the rewrites use, then asks whether a
 * document exists for the slug. A route that negotiates but has no twin
 * returns 404 for a page that renders fine in a browser, which is the worst
 * possible outcome of adding this; a header that announces a twin for a slug
 * with no document is an llms.txt promise that 404s. The gate line can keep
 * the pattern-only `mdTwinFor`: a missing slug under a twin pattern still gets
 * its 404 from the branch above.
 *
 *   curl -sI -H "Accept: text/markdown" https://example.com/guides/onboarding \
 *     | grep -iE "^HTTP|content-type|vary"          # 200, text/markdown, Vary: Accept
 *   curl -sI -H "Accept: text/markdown" https://example.com/guides/onboarding.md \
 *     | grep -iE "^HTTP|^link"                      # 200, not renegotiated; canonical, describedby
 *   curl -s -D - -o /dev/null -H "Accept: text/markdown" https://example.com/nothing-here \
 *     | grep -iE "^HTTP|content-type|vary"          # 404, text/markdown, Vary: Accept
 *   curl -sI https://example.com/guides/onboarding | grep -i "^link"
 *                                                   # rel="alternate" to the twin, rel="describedby"
 *   curl -sI https://example.com/guides/does-not-exist | grep -ic 'rel="alternate"'
 *                                                   # 0: no twin announced for a missing slug
 *   curl -sI -H "Accept: image/*" https://example.com/logo.avif | head -1
 *   curl -sI -H "Accept: image/*" https://example.com/opengraph-image | head -1
 *                                                   # 200 both: assets never negotiate
 *
 * `isKnownPath`, `isPageShapedPath`, `isGatedAppPath` and
 * `unauthenticatedResponse` live in gated-app-404.ts, next to the route lists
 * and the test that keeps them honest.
 * The Link header set here reached the wire on a Next.js 16 production build.
 * The host's own preload Link values only exist on the deployed platform, so
 * check there that both survive.
 */

/* PORTING
 * Express / Hono / Fastify: set the same five headers on the response object;
 *   see ../generic/express-md-route.js.
 * Astro:   src/pages/[...slug].md.ts exporting GET, returning the same Response.
 * Rails:   respond_to { |f| f.md { render plain: body, content_type: "text/markdown" } }
 *          and response.headers["Link"] = ...
 * Django:  HttpResponse(body, content_type="text/markdown; charset=utf-8")
 *          then response["Link"] = ...
 * Static:  emit .md files at build time; set headers in the CDN config. The
 *          canonical Link header is the part static hosts most often cannot do,
 *          in which case keep the twins out of the sitemap and rely on llms.txt.
 * Content-Signal: if the user decided to publish a Content-Signal preference,
 *          send the same `Content-Signal` header on the twin responses. A
 *          Cloudflare zone with Markdown for Agents adds
 *          `Content-Signal: ai-train=yes, search=yes, ai-input=yes` to the
 *          markdown it serves when the origin sends none
 *          (developers.cloudflare.com/fundamentals/reference/markdown-for-agents/).
 */
