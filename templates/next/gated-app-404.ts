/**
 * A real 404 behind a default-deny auth gate.
 *
 * CONTRACT (framework-neutral):
 *   GET /some-gated-area        (no session) -> 307 /login?callbackUrl=...
 *   GET /definitely-not-a-page  (no session) -> 404
 *       Accept includes text/html  -> the site's own 404 page, status 404
 *       anything else              -> text/markdown body with recovery links
 *   GET /api/anything           (no session) -> unchanged (redirect or 401)
 *   GET /logo.avif, /opengraph-image (outside the gated prefixes) -> unchanged
 *   Any authenticated request   -> unchanged
 *
 * The failure this prevents: a middleware that redirects EVERY unknown path to
 * a login page that answers 200 teaches agents that every URL on the site
 * exists. Scorers report it as a domain-wide soft-404; nobody inside notices,
 * because every path a human types is real.
 *
 * Three pieces: a shared list of gated prefixes, a test that keeps the list
 * honest against the route directory, and the branch in the proxy.
 */

// ---------------------------------------------------------------------------
// 1. src/lib/app-prefixes.ts  (dependency-free: imported by the proxy AND
//    by robots.ts, so the disallow list and the gate never disagree)
// ---------------------------------------------------------------------------

/** First segment of every logged-in area under src/app. */
export const GATED_APP_PREFIXES = [
  "admin",
  "dashboard",
  "settings",
  "onboarding",
] as const;

/** Directories under src/app that are served without a session. */
export const PUBLIC_APP_DIRS = ["blog", "login", "signup", "privacy", "terms", "about", "contact"] as const;

/**
 * A path some route answers: the home, a public directory or a gated one.
 * Twin-bearing pages are already known through the twin registry; this is the
 * fallback for the rest, so an unknown path can get a negotiated 404.
 */
export function isKnownPath(pathname: string): boolean {
  if (pathname === "/") return true;
  const first = pathname.split("/")[1] ?? "";
  return (PUBLIC_APP_DIRS as readonly string[]).includes(first) || isGatedAppPath(pathname);
}

/**
 * Next serves these without an extension, at any depth, and with an id
 * segment under generateImageMetadata. A slug shaped like these
 * (`/blog/icon-design`) is treated as an asset and loses negotiation.
 */
const METADATA_IMAGE_ROUTE = /^(?:opengraph-image|twitter-image|icon|apple-icon)(?:\d+|-[a-z0-9]+)?$/;

/**
 * A path a document can live at, as opposed to a public file or a metadata
 * route. Only these may be negotiated or answered with the markdown 404: an
 * image fetch sends no text/html and would otherwise get a 404 body.
 */
export function isPageShapedPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.at(-1)?.includes(".")) return false;
  return !segments.slice(-2).some((s) => METADATA_IMAGE_ROUTE.test(s));
}

/** A path that exists behind the session gate (page or API). */
export function isGatedAppPath(pathname: string): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  return GATED_APP_PREFIXES.some((p) => pathname === `/${p}` || pathname.startsWith(`/${p}/`));
}

// ---------------------------------------------------------------------------
// 2. src/lib/app-prefixes.test.ts  (what makes the list safe to gate on)
// ---------------------------------------------------------------------------
//
// import { readdirSync } from "node:fs";
//
// const dirs = readdirSync("src/app", { withFileTypes: true })
//   .filter((d) => d.isDirectory() && d.name !== "api" && !d.name.startsWith("("))
//   .map((d) => d.name);
// const known = new Set([...GATED_APP_PREFIXES, ...PUBLIC_APP_DIRS]);
//
// it("covers every route dir", () => expect(dirs.filter((d) => !known.has(d))).toEqual([]));
// it("lists no stale dir", () => expect([...known].filter((p) => !dirs.includes(p))).toEqual([]));
//
// Both directions matter: a new area not registered would 404 for visitors, a
// removed area left in the list would keep redirecting a dead path to login.

// ---------------------------------------------------------------------------
// 3. The branch in src/proxy.ts (Next 15 and earlier: src/middleware.ts),
//    placed where the unauthenticated redirect used to be unconditional.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { acceptsHtml } from "@/lib/markdown-response";

const SITE_URL = "https://example.com";

function notFoundMarkdown(): string {
  return `404 - not found

This path does not exist. Try:

- ${SITE_URL}/llms.txt   (index of everything)
- ${SITE_URL}/sitemap.xml
- ${SITE_URL}/index.md   (the product, in markdown)
`;
}

export function unauthenticatedResponse(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (!isGatedAppPath(pathname)) {
    // Public files and metadata images: the framework serves them or 404s
    // them. Checked only outside the gate, so `/admin/export.csv` still
    // redirects instead of reaching its handler without a session.
    if (!isPageShapedPath(pathname)) return NextResponse.next();

    // Never NextResponse.next() for an unknown page. The rewrite target starts with a dot, so
    // it can never resolve to a real route: the framework renders its 404 page
    // with a real 404 status, and an area someone forgot to register stays
    // closed instead of falling through to its handler.
    if (acceptsHtml(req.headers.get("accept"))) {
      return NextResponse.rewrite(new URL("/.not-found", req.url));
    }
    return new NextResponse(notFoundMarkdown(), {
      status: 404,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

/* VERIFICATION (production build, from outside)
 *
 *   curl -s -o /dev/null -w '%{http_code}\n' $SITE/definitely-not-a-page                        # 404
 *   curl -s -o /dev/null -w '%{http_code}\n' -H "Accept: text/html" $SITE/definitely-not-a-page # 404
 *   curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $SITE/dashboard                    # 307 .../login
 *   curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $SITE/api/me                       # unchanged
 *   curl -s -o /dev/null -w '%{http_code}\n' -H "Accept: image/*" $SITE/logo.avif               # 200
 *   curl -s -o /dev/null -w '%{http_code}\n' -H "Accept: image/*" $SITE/opengraph-image         # 200
 *
 * The proxy matcher excludes every path whose last segment has an extension
 * (see markdown-response.ts); isPageShapedPath covers the extensionless
 * metadata routes the matcher still lets through.
 *
 * PORTING
 * Any middleware that runs before routing can do this. The two things that do
 * not travel are the "impossible path" rewrite (use whatever your framework
 * offers to render its 404 with a 404 status without matching a route) and the
 * directory test, which should read whatever your router treats as the route
 * registry.
 */
