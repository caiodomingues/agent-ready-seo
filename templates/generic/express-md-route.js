/**
 * The agent layer without a meta-framework: Express, Node, no build step.
 *
 * Implements the same contract as ./contract.http and
 * ../next/markdown-response.ts. Roughly a hundred lines, which is the point:
 * the layer is a handful of headers and a generator, not a platform feature.
 *
 *   node express-md-route.js
 *   curl -sI localhost:3000/guides/onboarding.md
 */

const express = require("express");

const SITE_URL = "https://example.com";
const app = express();

/* --------------------------- content source --------------------------- */

// Replace with the project's real source. Whatever it is, the twin must render
// from the SAME source as the HTML page, or the two drift.
const GUIDES = [
  {
    slug: "onboarding",
    title: "Onboarding guide",
    description: "How to get a new account productive in one session.",
    updated: "2026-05-14",
    body: "Step-by-step, written for someone who has never seen the product.",
  },
];

const getGuide = (slug) => GUIDES.find((g) => g.slug === slug) ?? null;

/* ---------------------------- the wrapper ---------------------------- */

function sourceUrlOf(doc) {
  const m = /^source_url:\s*(\S+)\s*$/m.exec(doc);
  return m ? m[1] : null;
}

function sendMarkdown(res, body) {
  if (body === null) {
    return res
      .status(404)
      .set("Content-Type", "text/plain; charset=utf-8")
      .send("404 - not found\n");
  }

  res.set({
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
    "X-Robots-Tag": "all",
  });

  // Canonical from the document, never from req.path. Rebuilding it from the
  // request means a routing bug produces a self-referential canonical, which is
  // the exact failure this header prevents.
  const canonical = sourceUrlOf(body);
  if (canonical) res.set("Link", `<${canonical}>; rel="canonical"`);

  res.send(body);
}

/* ---------------------------- generators ---------------------------- */

function guideToMarkdown(guide) {
  const url = `${SITE_URL}/guides/${guide.slug}`;
  return [
    "---",
    `title: ${guide.title}`,
    `source_url: ${url}`,
    `updated: ${guide.updated}`,
    "---",
    "",
    `# ${guide.title}`,
    "",
    guide.body,
    "",
  ].join("\n");
}

/* ------------------------------ routes ------------------------------ */

// ORDER MATTERS when patterns overlap: register the specific route before the
// general one. Express matches in declaration order, so a parameter declared
// first will swallow a literal segment declared later.

app.get("/guides/:slug.md", (req, res) => {
  const guide = getGuide(req.params.slug);
  sendMarkdown(res, guide ? guideToMarkdown(guide) : null);
});

// The home twin: canonical is the bare root, not /index.
app.get("/index.md", (_req, res) => {
  sendMarkdown(
    res,
    ["---", "title: Site Name", `source_url: ${SITE_URL}/`, "---", "", "# Site Name", ""].join("\n"),
  );
});

app.get("/llms.txt", (_req, res) => {
  const lines = GUIDES.map(
    (g) => `- [${g.title}](${SITE_URL}/guides/${g.slug}.md): ${g.description}`,
  ).join("\n");

  // Generated from the same array the routes use, so it cannot advertise a page
  // that does not exist.
  const body = [
    "# Site Name",
    "",
    "> One sentence a stranger could quote verbatim.",
    "",
    "Markdown for agents: guide pages also answer as clean markdown by adding",
    "`.md` to the URL.",
    "",
    "## Guides",
    "",
    lines,
    "",
  ].join("\n");

  res.set({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
  }).send(body);
});

app.listen(3000);

/* WHAT IS DELIBERATELY MISSING
 * No sitemap entry for the .md URLs: listing both renderings asks to be assessed
 * for duplicate content. Discovery happens through llms.txt, the rel=alternate
 * tag on the HTML page, and the predictable URL pattern.
 */
