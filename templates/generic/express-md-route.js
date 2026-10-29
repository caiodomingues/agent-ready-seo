/**
 * The agent layer without a meta-framework: Express, Node, no build step.
 *
 * Implements sections 1 to 5 of ./contract.http (twin, recovery 404, home twin,
 * alternate link, Accept negotiation with 406, negotiated 404, llms.txt), the
 * same behavior as ../next/markdown-response.ts. Sections 6 to 10 (llms-full,
 * robots, sitemap, attribution cookie) belong to the rest of the site. The
 * layer is a handful of headers and a generator, not a platform feature.
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

/** Section hubs a 404 can point back to. Each must return 200 on the real site. */
const HUBS = ["/guides"];

/* --------------------------- negotiation --------------------------- */

function parseAccept(header) {
  return (header ?? "")
    .split(",")
    .map((part) => {
      const [range, ...params] = part.split(";");
      const q = params.map((p) => /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p)).find(Boolean)?.[1];
      return { range: range.trim().toLowerCase(), q: q === undefined ? 1 : Number(q) };
    })
    .filter((r) => r.range);
}

/** The q of the most specific range covering `type`; 0 when nothing covers it. */
function qualityOf(type, ranges) {
  const major = type.split("/")[0];
  const match =
    ranges.find((r) => r.range === type) ??
    ranges.find((r) => r.range === `${major}/*`) ??
    ranges.find((r) => r.range === "*/*");
  return match ? match.q : 0;
}

/** "html", "markdown", or null when neither is acceptable (406). Ties go to HTML. */
function negotiate(accept) {
  const ranges = parseAccept(accept);
  if (ranges.length === 0) return "html";
  const html = qualityOf("text/html", ranges);
  const markdown = qualityOf("text/markdown", ranges);
  if (html === 0 && markdown === 0) return null;
  return markdown > html ? "markdown" : "html";
}

// Unknown paths follow a different rule than pages (contract section 4d): only
// an explicit text/html gets the HTML 404, and */* or no header gets markdown.
function acceptsHtml(accept) {
  return parseAccept(accept).some((r) => r.range === "text/html" && r.q > 0);
}

/* ---------------------------- the wrapper ---------------------------- */

function sourceUrlOf(doc) {
  const m = /^source_url:\s*(\S+)\s*$/m.exec(doc);
  return m ? m[1] : null;
}

function sendMarkdown(res, body) {
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

function sendMarkdown404(req, res) {
  const hub = HUBS.find((h) => req.path.startsWith(`${h}/`));
  const body = [
    "404 - not found",
    "",
    "This path does not exist. Try:",
    ...(hub ? [`- ${SITE_URL}${hub}   (nearest section)`] : []),
    `- ${SITE_URL}/llms.txt   (index of everything)`,
    `- ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
  res.status(404).set("Content-Type", "text/markdown; charset=utf-8").send(body);
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

// Stands in for the site's real template, which owns escaping and layout.
function guideToHtml(guide) {
  const url = `${SITE_URL}/guides/${guide.slug}`;
  return [
    "<!doctype html>",
    `<html><head><title>${guide.title}</title>`,
    `<link rel="canonical" href="${url}">`,
    `<link rel="alternate" type="text/markdown" href="${url}.md">`,
    `</head><body><h1>${guide.title}</h1><p>${guide.body}</p></body></html>`,
  ].join("\n");
}

/* ------------------------------ routes ------------------------------ */

// ORDER MATTERS when patterns overlap: register the specific route before the
// general one. Express matches in declaration order, and `/guides/:slug` also
// matches `onboarding.md`, so the twin route must come first.

// The twin ignores Accept: a .md URL never answers with HTML or a twin of a twin.
app.get("/guides/:slug.md", (req, res) => {
  const guide = getGuide(req.params.slug);
  if (guide) sendMarkdown(res, guideToMarkdown(guide));
  else sendMarkdown404(req, res);
});

// Both variants share one cache key here, so every answer carries Vary: Accept.
app.get("/guides/:slug", (req, res, next) => {
  const guide = getGuide(req.params.slug);
  if (!guide) return next();

  res.vary("Accept");
  const variant = negotiate(req.get("accept"));
  if (variant === null) {
    return res.status(406).set("Content-Type", "text/plain; charset=utf-8").send("406 - not acceptable\n");
  }
  if (variant === "markdown") return sendMarkdown(res, guideToMarkdown(guide));

  res.append("Link", `<${SITE_URL}/guides/${guide.slug}.md>; rel="alternate"; type="text/markdown"`);
  res.type("html").send(guideToHtml(guide));
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

// Last, so every route above wins first.
app.use((req, res) => {
  res.vary("Accept");
  if (acceptsHtml(req.get("accept"))) {
    return res.status(404).type("html").send("<!doctype html><title>Not found</title><h1>Not found</h1>");
  }
  sendMarkdown404(req, res);
});

app.listen(3000);

/* WHAT IS DELIBERATELY MISSING
 * No sitemap entry for the .md URLs: listing both renderings asks to be assessed
 * for duplicate content. Discovery happens through llms.txt, the rel=alternate
 * tag on the HTML page, and the predictable URL pattern.
 */

/* PORTING
 * The 404 body advertises /sitemap.xml and the HUBS, which this file does not
 * serve. Each must return 200 on the deployed site, or the recovery links are
 * themselves dead ends. The HTML 404 here is a placeholder for the site's own.
 * Vary: Accept splits a CDN cache by the raw header; see the cost note in
 * references/agent-layer.md before putting this behind one.
 */
