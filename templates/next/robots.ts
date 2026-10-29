/**
 * robots.txt with AI crawlers explicitly allowed.
 *
 * CONTRACT:
 *   - Application routes disallowed for everyone.
 *   - The social image route allowed explicitly, because it sits under a
 *     disallowed prefix and link-preview fetchers cannot render it otherwise.
 *   - Named AI user agents get their own permissive rule, so the intent is
 *     visible in review and a future blanket rule cannot catch them silently.
 *   - Sitemap declared.
 *
 * Drop at src/app/robots.ts.
 */

import type { MetadataRoute } from "next";

const SITE_URL = "https://example.com";

/** Authenticated and transactional areas. No search value, real crawl cost. */
const BLOCKED_PATHS = [
  "/api/",
  "/account/",
  "/admin/",
  "/checkout/",
  "/dashboard/",
  "/settings/",
];

/**
 * AI crawlers we explicitly want reading and citing the public content.
 *
 * This is a strategic choice. Blocking them guarantees never being cited, at the
 * moment the channel is growing. Re-check the list periodically: agents appear
 * and rename themselves.
 *
 * OpenAI and Anthropic each run three tokens with separate jobs, and each can be
 * allowed or blocked on its own:
 *   - training:      GPTBot, ClaudeBot. Blocking keeps content out of future models.
 *   - search index:  OAI-SearchBot, Claude-SearchBot. These decide whether the site
 *                    appears in ChatGPT and Claude search answers, so blocking them
 *                    is what removes the citation, not blocking the training bot.
 *   - user fetch:    ChatGPT-User, Claude-User, Perplexity-User. A page fetched
 *                    because a person asked; OpenAI states robots.txt may not apply.
 * Sources: https://developers.openai.com/api/docs/bots and
 * https://support.claude.com/en/articles/8896518. `anthropic-ai` is a legacy
 * token neither page lists.
 */
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  // More specific than the /api/ block, so the image endpoint stays reachable.
  const allow = ["/", "/api/og"];

  return {
    rules: [
      { userAgent: "*", allow, disallow: BLOCKED_PATHS },
      ...AI_BOTS.map((bot) => ({ userAgent: bot, allow, disallow: BLOCKED_PATHS })),
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
 * Then fetch a page as an AI agent to confirm nothing upstream blocks by UA:
 *   curl -sI -A "OAI-SearchBot" https://example.com/ | head -1
 * A WAF or CDN bot rule can block these agents regardless of what this file says,
 * which is the most common reason a correct robots.txt still results in no
 * crawling. Check the edge configuration too.
 */

/* PORTING
 * Any framework: serve a static text file with the same rules. The generated
 * form here exists only so the bot list lives in code and can be reviewed in a
 * diff rather than edited in a file nobody opens.
 */
