/**
 * robots.txt with AI crawlers explicitly allowed.
 *
 * CONTRACT:
 *   - Application routes disallowed for everyone: /api/ and every gated
 *     prefix, read from the same list the session gate reads.
 *   - The social image route allowed explicitly, because it sits under a
 *     disallowed prefix and link-preview fetchers cannot render it otherwise.
 *   - AI search and user-triggered agents get their own permissive groups, so
 *     the intent is visible in review and a future blanket rule cannot catch
 *     them silently.
 *   - AI training crawlers sit in a separate group, allowed by default.
 *     Whether to opt out is the user's decision (SKILL.md, "Decisions that
 *     belong to the user"), not the template's.
 *   - Sitemap declared.
 *
 * Drop at src/app/robots.ts. Without a session gate, drop the import and keep
 * the /api/ line.
 */

import type { MetadataRoute } from "next";
import { GATED_APP_PREFIXES } from "@/lib/app-prefixes";

const SITE_URL = "https://example.com";

/**
 * Authenticated areas: no search value, real crawl cost. A transactional area
 * missing from GATED_APP_PREFIXES (/checkout, /account) belongs in that list,
 * not here, or the gate and the crawl rules disagree.
 */
const DISALLOW = ["/api/", ...GATED_APP_PREFIXES.map((p) => `/${p}/`)];

/*
 * AI user agents by role. Re-check the lists periodically: agents appear and
 * rename themselves. Sources:
 *   developers.openai.com/api/docs/bots
 *   support.claude.com/en/articles/8896518
 *   support.apple.com/en-us/119829
 *   docs.perplexity.ai/guides/bots
 *   developer.amazon.com/amazonbot
 *   docs.mistral.ai/robots
 *   duckduckgo.com/duckduckgo-help-pages/results/duckassistbot
 *   developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers
 */

/**
 * Search and citation: these decide whether the site appears, with a link, in
 * AI answers. Blocking one is what removes the citation. Googlebot, Bingbot
 * and Applebot follow their normal groups (here `*`); Microsoft has no
 * separate AI token, because Copilot grounds on Bingbot's index.
 */
const AI_SEARCH_BOTS = [
  "OAI-SearchBot",
  "Claude-SearchBot",
  "PerplexityBot",
  "Amzn-SearchBot",
  "MistralAI-Index",
  "DuckAssistBot",
];

/**
 * User-triggered: a page fetched because a person asked. OpenAI says robots.txt
 * rules may not apply to ChatGPT-User, and Perplexity says Perplexity-User
 * generally ignores robots.txt; the group states intent for the rest.
 */
const AI_USER_FETCHERS = [
  "ChatGPT-User",
  "Claude-User",
  "Perplexity-User",
  "meta-externalfetcher",
  "Amzn-User",
  "MistralAI-User",
];

/**
 * Training only. Blocking these keeps content out of future models and does
 * not affect citation. Google-Extended has no user agent of its own: it
 * controls Gemini training and grounding outside Search, with no effect on
 * Search, AI Overviews or AI Mode. Applebot-Extended does not crawl either: it
 * controls Apple's use of what Applebot fetched.
 */
const AI_TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
  "Amazonbot",
  "MistralAI-Training",
];

export default function robots(): MetadataRoute.Robots {
  // More specific than the /api/ block, so the image endpoint stays reachable.
  const allow = ["/", "/api/og"];

  // A crawler that matches a named group ignores `*` entirely (RFC 9309), so
  // every group repeats the disallows or it crawls the app paths.
  return {
    rules: [
      { userAgent: "*", allow, disallow: DISALLOW },
      { userAgent: AI_SEARCH_BOTS, allow, disallow: DISALLOW },
      { userAgent: AI_USER_FETCHERS, allow, disallow: DISALLOW },
      // The user's call. To opt out of training, replace this rule with
      // { userAgent: AI_TRAINING_BOTS, disallow: "/" }; keeping `allow: "/"`
      // beside it would win the tie and opt nothing out.
      { userAgent: AI_TRAINING_BOTS, allow, disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

/* WHAT THIS FILE CANNOT DO
 * robots.txt is a crawl instruction, not access control and not a way to keep a
 * URL out of an index. A disallowed URL linked from elsewhere can still surface
 * as a bare result. To keep a page out of the index, let it be crawled and put
 * `noindex` on the page itself.
 *
 * It is also public. Listing a secret path here advertises it.
 */

/* VERIFY
 *   curl -s https://example.com/robots.txt
 *   curl -sI https://example.com/api/og?title=test | head -1     # expect 200
 * Every gated prefix appears as a Disallow in every group:
 *   curl -s https://example.com/robots.txt | grep -c "^Disallow: /dashboard/"   # one per group
 * Then fetch a page as an AI agent to confirm nothing upstream blocks by UA:
 *   curl -sI -A "OAI-SearchBot" https://example.com/ | head -1
 * A WAF or CDN bot rule can block these agents regardless of what this file says,
 * which is the most common reason a correct robots.txt still results in no
 * crawling. Check the edge configuration too.
 */

/* PORTING
 * Any framework: serve a static text file with the same rules. The generated
 * form here exists so the bot lists and the disallows live in code, the
 * disallows read the gate's own list, and both can be reviewed in a diff
 * rather than edited in a file nobody opens.
 */
