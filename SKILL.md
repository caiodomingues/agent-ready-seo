---
name: agent-ready-seo
description: Use when a site needs to be readable and citable by AI answer engines as well as search crawlers. Covers the markdown twin layer, llms.txt, structured data, programmatic pages backed by real data, publishing a citable dataset, and attributing AI referrals. Also use when the user mentions "AEO", "GEO", "answer engine optimization", "generative engine optimization", "llms.txt", "llms-full.txt", "markdown version of my pages", "get cited by ChatGPT", "AI search traffic", "AI crawlers", "JSON-LD", "structured data", "Dataset schema", "programmatic SEO", "thin content", "doorway pages", "sitemap", "canonical", "IndexNow", "title tag", "CTR", "click-through rate", "Search Console", "title experiment", or "where is my AI traffic coming from". For persuasion and page copy see copywriting; for classic on-page issue hunting see seo-audit.
metadata:
  version: 1.2.0
license: MIT
---

# Agent-Ready SEO

Optimizing for search used to have one reader. It now has three, and they want
different things from the same text.

| Discipline | Reader | What success looks like |
| --- | --- | --- |
| **SEO** | The crawler that builds an index | Position and click |
| **AEO** | The agent that fetches and summarizes | Read in full, without noise |
| **GEO** | The model composing an answer | Being the cited source |

Most sites are built for the first reader only. This skill covers the other two
without breaking the first, and the three layers share one content source rather
than becoming three codebases.

**The load-bearing claim:** a generative engine cites numbers, dates, sources and
methods. It does not cite restated common knowledge. So the work splits in two
halves that must both happen. Publish something only you can publish (GEO), and
make it trivially machine-readable (AEO). Doing only the second makes you easy to
read and forgettable.

---

## Start here: what is the task?

Read the reference for the layer in play. Do not read all of them.

| The user wants to | Read | Then copy from |
| --- | --- | --- |
| Serve clean text to LLMs, add `llms.txt`, avoid duplicate-content risk | `references/agent-layer.md` | `templates/next/markdown-response.ts`, `md-route.ts`, `rewrites.ts`, `page-metadata.ts`, `llms-txt.ts` |
| Make a gated SaaS (public marketing + logged-in app) stop answering 200 for every path | `references/agent-layer.md` (gated applications) | `templates/next/gated-app-404.ts` |
| Turn proprietary data into something quotable: an index, a dated snapshot, a methodology page | `references/citable-data.md` | `templates/next/index-basket.ts`, `dataset-jsonld.ts` |
| Generate many pages from data without creating thin content | `references/pseo.md` | `templates/next/sitemap.ts`, `sitemap-sharded.ts` |
| Fix the technical base: sitemap, robots, canonical, titles, IndexNow, social images | `references/foundations.md` | `templates/next/sitemap.ts`, `robots.ts` |
| Decide which structured data type a page needs | `references/schema-catalog.md` | `templates/next/dataset-jsonld.ts` |
| Know whether any of it worked, and where AI traffic lands | `references/measurement.md` | `templates/next/first-touch.ts` |
| Change titles or templates as an experiment, without touching URLs | `references/measurement.md` (experiments), `references/foundations.md` (titles) | `templates/next/seo-metadata.ts` |
| Keep articles correct after the code they explain changes | `references/foundations.md` (entities and authorship) | `templates/generic/content-review.js` |
| Audit an existing site, or review a plan before building | `references/pitfalls.md` | none |
| Check that any of it actually works, in production or in CI | `references/verification.md` | none |

Templates are working code with the framework-neutral contract stated at the top
of each file. `templates/generic/` holds the same contract as raw HTTP plus one
non-framework implementation, for stacks other than Next.js.

---

## The order that works

Each step depends on the one before it. The most common failure is doing them
backwards: writing a hundred pages before having anything different to say.

1. **Survey the competition before writing.** You need to know what is already
   occupied and where the gap is. An afternoon of teardown saves months of
   redundant content.
2. **Find the data only you have.** This decides whether GEO is available to you
   or only SEO. Without proprietary data, all that is left is writing better than
   everyone else, which is much slower.
3. **Fix the technical base.** Sitemap, robots, canonical, titles, structured
   data. Cheap, fast, and what stops the rest of the effort from leaking.
4. **Ship the free tool before the content.** A no-login calculator or checker
   answers practical-intent queries better than any article, and it is what earns
   unsolicited links. It is also what still gets the click: on one property the
   guides sat near one percent click-through and the tools of the same segments
   at three to six, at the same position, because the informational query is
   increasingly answered on the results page and the click that survives is for
   a page that does the thing. The tool must deliver to an anonymous visitor
   what its title promises; gate saving and exporting, not the result.
5. **Only then scale pages per segment,** with real data per page. If a page does
   not answer something only you can answer, it should not exist.
6. **Add the agent layer.** Text version, `llms.txt`, canonical stitching the two.
   Do it after the base is ready, because it mirrors content that already exists.
7. **Instrument before expecting results.** First-touch attribution and search
   console configured before traffic arrives, or the first months are lost data.
   Verify the layer against production, and consider an external scorer as a
   second opinion. See `references/verification.md`. Any later change to
   titles or templates is an experiment with a register, a control and a
   baseline taken before the deploy; see `references/measurement.md`.
8. **Treat the data as a recurring publication.** An index that stops updating
   stops being citable within two months. The routine is part of the asset.

---

## Non-negotiables

These hold regardless of stack, market or CMS. Violating one usually undoes the
rest of the work.

- **Never ask a search engine to index two versions of the same text.** The
  markdown twin stays out of the sitemap and declares the HTML page as canonical.
  Discovery for agents happens through `llms.txt`, `rel=alternate` and a
  predictable URL pattern.
- **Generate, do not copy.** Any second rendering of content (markdown twin,
  `llms.txt`, a pricing summary) must be derived from the same source as the page.
  Where a hand-maintained copy is unavoidable, say so and schedule an audit.
- **Structured data that contradicts the page is worse than no structured data.**
  A model reads the declared block, not your table. A wrong number there gets
  repeated with your name attached.
- **Emit `lastmod` only when a real content date backs it.** A per-deploy
  timestamp teaches crawlers to distrust the field entirely. Absent beats false.
- **Let AI crawlers in, on purpose.** Blocking them guarantees you are never
  cited, at the exact moment that channel is growing. If the strategy is to be
  the source, the reader has to be allowed in.
- **Publish the aggregate, gate the live.** Dated snapshots, methodology and
  educational material are what get cited; per-user, current and personalized
  data is what people pay for. That line is also what keeps a data business from
  giving itself away.
- **A page must answer something only you can answer.** This is the single test
  that separates programmatic SEO from doorway pages, and it applies before the
  template is written, not after the penalty.
- **No invented ratings, no fabricated review counts.** Aggregate rating markup
  without real reviews is the fastest way to lose rich results permanently.
- **An unknown path answers 404, even behind an auth gate.** A default-deny
  middleware that redirects everything to a 200 login page tells every agent
  that every URL exists. Keep the deny; distinguish "gated" from "nothing".
- **Verify against the deployed site, from outside.** The edge can override
  `robots.txt`, the framework can drop a header, and a dev server hides both.

---

## Using the templates

Every template is self-contained and starts with a comment block stating the
contract it implements, so it can be read without this skill loaded.

Adapt rather than transplant:

- Replace `SITE_URL` with the canonical host, including the `www` decision.
- Replace the example content sources (`getGuides`, `getPosts`) with the project's
  real ones. Never leave a template's placeholder data in a shipped file.
- Keep the comments that explain a constraint (why `lastmod` is conditional, why
  the item route precedes the region route). Drop the ones that narrate the
  template itself.
- Check the framework note at the bottom of each file before porting.

When the project is not Next.js, read `templates/generic/contract.http` first: it
states the observable behavior each endpoint must have, which is what actually
matters. The framework is an implementation detail of that contract.

---

## Scope

**In scope.** Publishing and serving: the agent layer, citable datasets,
programmatic pages, the technical base, structured data, attribution of AI
referrals.

**Also out of scope.** Making the *product* operable by an agent: authentication
an agent can complete, controls it can drive, an API or MCP server for your
product, a machine-payable checkout. External scorers weight those heavily, so a
site that follows this skill completely will still not score full marks. That is
expected. See the layer mapping in `references/verification.md`.

**Out of scope.** Acquiring the data in the first place (scraping, licensing,
normalization pipelines) is a separate discipline with its own legal and ethical
constraints. This skill assumes the data exists and is yours to publish.

**Adjacent skills.** `seo-audit` for hunting on-page issues, `programmatic-seo`
for keyword-side opportunity sizing, `schema-markup` for a broader catalog of
types, `copywriting` for the words themselves.
