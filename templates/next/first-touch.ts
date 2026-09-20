/**
 * First-touch attribution that survives AI referrals and does not break caching.
 *
 * CONTRACT:
 *   - Write the cookie only when an EXTERNAL SIGNAL exists (foreign referrer or
 *     campaign parameter). A clean arrival must produce no Set-Cookie, or the
 *     CDN cache for every marketing page is invalidated on every visit.
 *   - Classify to null when there is no signal. There is no "direct" source.
 *   - Persist at account creation, inside error handling. Attribution must never
 *     break a signup.
 *
 * Three files: the classifier, the edge capture, the persistence hook.
 */

/* ------------------- src/lib/acquisition.ts ------------------- */

export type AcquisitionSource =
  | "chatgpt"
  | "perplexity"
  | "claude"
  | "gemini"
  | "google"
  | "bing"
  | "social"
  | "referral"
  | "campaign"
  | "other";

export interface AcquisitionTouch {
  source: AcquisitionSource;
  referrer: string | null;
}

const HOST_RULES: Array<[RegExp, AcquisitionSource]> = [
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, "chatgpt"],
  [/(^|\.)perplexity\.ai$/, "perplexity"],
  [/(^|\.)claude\.ai$|(^|\.)anthropic\.com$/, "claude"],
  [/(^|\.)gemini\.google\.com$/, "gemini"],
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)(x|twitter|linkedin|facebook|instagram|reddit|youtube)\.com$/, "social"],
];

/** Assistants that route around referrers. Useful for reporting, not for logic. */
export const AI_SOURCES = new Set<AcquisitionSource>(["chatgpt", "perplexity", "claude", "gemini"]);

export function classify(
  referer: string | null | undefined,
  utmSource: string | null | undefined,
): AcquisitionTouch | null {
  const referrer = normalizeReferrer(referer);
  const utm = utmSource?.trim().toLowerCase() || null;

  if (utm) return { source: sourceFromHost(utm) ?? "campaign", referrer };
  if (referrer) return { source: sourceFromHost(hostOf(referrer) ?? "") ?? "referral", referrer };

  // NO SIGNAL IS NOT A SOURCE.
  //
  // An in-app browser arriving with no referrer is missing information, not a
  // direct visit. Labeling it "direct" fabricates a number and hides the exact
  // channel this code exists to measure inside a bucket everyone ignores.
  // Count it as unattributed in the report and let the gap stay visible.
  return null;
}

function sourceFromHost(host: string): AcquisitionSource | null {
  return HOST_RULES.find(([re]) => re.test(host))?.[1] ?? null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Drops same-host referrers: internal navigation is not an acquisition event. */
function normalizeReferrer(referer: string | null | undefined): string | null {
  if (!referer) return null;
  const host = hostOf(referer);
  if (!host || host.endsWith("example.com")) return null;
  return referer.slice(0, 512);
}

export const ACQUISITION_COOKIE = "first_touch";
export const ACQUISITION_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

/* --------- src/middleware.ts (or proxy.ts, depending on version) --------- */

/*
 * import { NextResponse, type NextRequest } from "next/server";
 *
 * export function middleware(req: NextRequest) {
 *   const res = NextResponse.next();
 *
 *   // Already captured: first touch wins, never overwrite.
 *   if (req.cookies.has(ACQUISITION_COOKIE)) return res;
 *
 *   const touch = classify(
 *     req.headers.get("referer"),
 *     req.nextUrl.searchParams.get("utm_source"),
 *   );
 *
 *   // No signal, no Set-Cookie. This is what keeps marketing pages cacheable.
 *   if (!touch) return res;
 *
 *   res.cookies.set(ACQUISITION_COOKIE, JSON.stringify({
 *     ...touch,
 *     landingPath: req.nextUrl.pathname,
 *     at: new Date().toISOString(),
 *   }), {
 *     maxAge: ACQUISITION_MAX_AGE,
 *     httpOnly: true,
 *     sameSite: "lax",
 *     secure: true,
 *     path: "/",
 *   });
 *
 *   return res;
 * }
 */

/* ------------------- persistence at account creation ------------------- */

/*
 * Wherever the account is created (an auth callback, a signup handler):
 *
 *   try {
 *     const raw = (await cookies()).get(ACQUISITION_COOKIE)?.value;
 *     if (raw) {
 *       const t = JSON.parse(raw);
 *       await db.update(users).set({
 *         acquisitionSource: t.source,
 *         acquisitionReferrer: t.referrer,
 *         acquisitionLandingPath: t.landingPath,
 *         acquisitionAt: new Date(t.at),
 *       }).where(eq(users.id, userId));
 *     }
 *   } catch {
 *     // Attribution is never worth a failed signup.
 *   }
 */

/* SCHEMA
 *   acquisition_source        text
 *   acquisition_referrer      text     raw value, so rules can be re-applied later
 *   acquisition_landing_path  text     which page received the cold arrival
 *   acquisition_at            timestamp
 *
 * SHIP THE MIGRATION WITH THE CODE. Capture deployed without the columns records
 * nothing, breaks nothing, and leaves an empty dashboard nobody can explain a
 * month later. If the read path tolerates missing columns so the page does not
 * crash, that tolerance also removes the error that would have told you.
 */

/* VERIFY
 *   curl -sI https://example.com/ | grep -i set-cookie                  # expect nothing
 *   curl -sI -H "Referer: https://chatgpt.com/" https://example.com/ \
 *     | grep -i set-cookie                                              # expect the cookie
 *   curl -sI https://example.com/ | grep -iE "cache-control|x-vercel-cache|cf-cache-status"
 * Run all three against a production build. A dev server does not cache, so
 * the regression this protects against is invisible there. The third one is
 * the precondition: if the marketing layout reads the session to render the
 * navbar, every public page is already `private, no-store` and the cookie
 * discipline above protects nothing. Fix that first.
 */

/* PORTING
 * The classifier is plain functions. What changes is where the capture runs:
 * edge middleware, a Rack middleware, an nginx-level cookie rule, or the first
 * server-rendered request. The requirement is only that it runs before the
 * cacheable response is produced, and that it stays silent without a signal.
 */
