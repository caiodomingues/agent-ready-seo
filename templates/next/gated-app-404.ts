/**
 * A real 404 behind a default-deny auth gate.
 *
 * CONTRACT (framework-neutral):
 *   GET /some-gated-area        (no session) -> 307 /login?callbackUrl=...
 *   GET /definitely-not-a-page  (no session) -> 404
 *       Accept includes text/html  -> the site's own 404 page, status 404
 *       anything else              -> text/markdown body with recovery links
 *   GET /api/anything           (no session) -> unchanged (redirect or 401)
 *   Any authenticated request   -> unchanged
 *
 * The failure this prevents: a middleware that redirects EVERY unknown path to
 * a login page that answers 200 teaches agents that every URL on the site
 * exists. Scorers report it as a domain-wide soft-404; nobody inside notices,
 * because every path a human types is real.
 *
 * Three pieces: a shared list of gated prefixes, a test that keeps the list
 * honest against the route directory, and the branch in the middleware.
 */

// ---------------------------------------------------------------------------
// 1. src/lib/app-prefixes.ts  (dependency-free: imported by the middleware AND
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
// 3. The branch in src/middleware.ts (Next 16: src/proxy.ts), placed where the
//    unauthenticated redirect used to be unconditional.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";

const SITE_URL = "https://example.com";

function notFoundMarkdown(): string {
  return `404 - not found

This path does not exist. Try:

- ${SITE_URL}/llms.txt   (index of everything)
- ${SITE_URL}/sitemap.xml
- ${SITE_URL}/index.md   (the product, in markdown)
`;
}

function acceptsHtml(accept: string | null): boolean {
  return /\btext\/html\b|\bapplication\/xhtml\+xml\b/i.test(accept ?? "");
}

export function unauthenticatedResponse(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (!isGatedAppPath(pathname)) {
    // Never NextResponse.next() here. The rewrite target starts with a dot, so
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
 *
 * PORTING
 * Any middleware that runs before routing can do this. The two things that do
 * not travel are the "impossible path" rewrite (use whatever your framework
 * offers to render its 404 with a 404 status without matching a route) and the
 * directory test, which should read whatever your router treats as the route
 * registry.
 */
