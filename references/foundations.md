# Technical Foundations

The layer every site should have and most have half of, because each item looks
too small to become a task. It is cheap, it is fast, and it is what stops the
rest of the effort from leaking.

---

## Canonical host

Decide once whether the site lives on `www` or the apex, redirect the other with
a permanent redirect, and then **emit only the canonical form everywhere**:
sitemap, `llms.txt`, structured data, social image URLs, absolute links in
content.

Mixed hosts split signals and, more practically, produce a redirect hop on every
crawl of every URL. Hardcode the base URL in one module and import it. A single
`SITE_URL` constant is the cheapest defense against the whole class of bugs.

---

## Sitemap

**Generate it from the same source that renders the pages.** Any list maintained
separately from the router drifts within weeks. When a new page type is added, it
should appear in the sitemap because the generator reads the same registry, not
because someone remembered.

**Emit `lastmod` only when a real content date backs it.**

```ts
// Wrong: every URL looks freshly modified on every deploy.
lastModified: new Date()

// Right: absent unless the content carries a date.
...(post.updatedAt ? { lastModified: new Date(post.updatedAt) } : {})
```

A per-deploy timestamp on a site that deploys daily claims the entire site
changes daily. It is false, it is detectable, and it teaches crawlers to ignore
the field for your domain. An absent `lastmod` is valid and better: the crawler
falls back to its own heuristics.

`changefreq` and `priority` are weak-to-ignored signals. Setting them is harmless;
believing in them is not. Spend the effort on `lastmod` correctness instead.

**Filter by publication state** using the same function the routes use, so the
sitemap can never advertise a page that 404s.

For scale, sharding and the 50,000 URL cap, see `references/pseo.md`.

---

## robots.txt

Three jobs, in order of importance.

**1. Keep crawlers out of the application.** Authenticated areas, dashboards,
settings, checkout. They have no search value and consume crawl budget on a site
whose public pages are the point.

**2. Let AI crawlers in, deliberately.** Declare them by name with an explicit
allow, both so the intent is visible in review and so a future blanket rule does
not catch them by accident.

```
User-agent: GPTBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: anthropic-ai
User-agent: PerplexityBot
User-agent: Google-Extended
User-agent: CCBot
User-agent: Applebot-Extended
Allow: /
```

This is a strategic choice, not an oversight. Blocking these agents guarantees you
are never cited by them. If the plan is to be the source, the reader has to be
allowed in. The list changes over time, so re-check it when revisiting the file.

**3. Watch for over-broad blocks catching useful routes.** The classic case: a
blanket `Disallow: /api/` that also blocks the dynamic social-image endpoint, so
no preview renders anywhere. The more specific allow wins:

```
Disallow: /api/
Allow: /api/og
```

**4. Check that the edge agrees.** A CDN "block AI bots" or "AI labyrinth"
toggle overrides the file silently: the allow rules keep shipping and the bots
never arrive. Verify from outside with the user agent (`curl -A GPTBot`), and
keep a note of the dashboard setting next to the robots source so the next
audit knows to look there.

Remember what `robots.txt` does not do. It is a crawl instruction, not access
control and not a way to keep a page out of the index. A disallowed URL that is
linked from elsewhere can still appear as a bare result. Use `noindex` on the page
for that, which requires the page to be crawlable in order to be read.

Point to the sitemap from `robots.txt`. Free, and some crawlers use it.

---

## Canonical tags

Every page declares its own canonical URL, absolute, on the canonical host.

Where it matters most, in practice:

- **Query parameters.** Filtering, sorting, tracking and session parameters
  multiply URLs for identical content. Self-canonical on the clean path collapses
  them.
- **Pagination.** Each page self-canonicals. Do not point page 2 at page 1: that
  tells the crawler page 2's content does not exist.
- **Alternate renderings** (markdown twins, print views, embeds) point at the HTML
  page. See `references/agent-layer.md`.
- **Syndicated content** points at the original.

A canonical is a hint, not a directive. Contradicting it with internal links,
sitemap entries or redirects that point elsewhere makes it likely to be ignored.

**Never declare it on the root layout.** In frameworks where page metadata
inherits from the layout (Next.js among them), a root canonical is inherited by
every page that does not override it, and each of those then declares itself a
duplicate of the home page. `metadataBase` belongs on the root; `canonical`
belongs on the page.

---

## Titles and metadata

**Measure the rendered `<title>`, not the string in the code.** A layout
template (`%s | Site Name`) appends a suffix, a page helper appends a year, and
the string someone reviewed at 48 characters ships at 72. On one property every
programmatic page rendered between 58 and 91 characters while every raw title
sat under 55; the desktop result cut all of them, and the cut landed on the
year or on the site name. Any test, any audit and any experiment reads the
final tag, from a crawl of production, and the code has one function that
produces exactly that tag.

**The suffix is a budget decision, per page family.** Sixteen or so characters
of site name on a sixty-character line is a quarter of the title. On the home
page and institutional pages it earns its place; on a guide, a tool or an
article it displaces the words that describe the page. Decide per family, write
the decision down as a policy table the tests read, and escape the layout
template on the families that drop it (in Next.js, `title: { absolute }`).
Pages that keep it must never include it in their own string as well, or the
name appears twice; that bug hits exactly the pages someone wrote by hand.

**A year token only when it still fits.** Appending `(2026)` is a cheap
freshness signal on periodic content, and a seven-character surprise on a
title that was already at the limit. Add it conditionally: only when the title
carries no year, and only when the result stays within the budget.

**Ratchet the limits instead of fixing every page at once.** A test that
enumerates every page's rendered title and description, fails anything new
over the limit, and carries a named list of the legacy pages that were over it
when the test was written, with their measured lengths. The list can only
shrink: an entry that gets fixed must be deleted, an entry whose length
changes must be updated, and a path that leaves the site must be removed. Add
a second assertion that no two paths share a title, which is the cheapest
duplicate-content check that exists. Worked implementation:
`templates/next/seo-metadata.ts`.

**One module feeds every surface that repeats the title.** The HTML head, the
Open Graph block, the markdown twin's front matter, the sitemap and the
JSON-LD `headline` all restate the same string, and on one property they were
typed in three places: literals in page files, fields on the content object,
and a second copy inside the markdown exporter. The HTML and the twin drifted
on exactly the pages that had been hand-tuned. Put title, description,
canonical path and social image in a pure module (no database, no filesystem,
so the sitemap and the tests can import it) and have every surface call it.

**Descriptions are not a ranking factor and are still worth writing,** because
they influence clicks and because answer engines quote them when nothing better
is available. Write one per page type. Generated descriptions that stuff the same
sentence with a substituted variable are worse than none.

**Tell the engine the site name explicitly.** Google picks the name shown next to
a result from `og:site_name` and `WebSite.name`. Without them it derives one from
the domain, and on a product living at `product.company.tld` it picks the
company. Emit both from one constant, and once a page declares its own
`openGraph` block, repeat `siteName` there: in Next.js the page object replaces
the layout's, it does not merge.

**Descriptions at scale must differ per instance, not per type.** A hundred
generated pages sharing one templated sentence read as mass-duplicated
descriptions. Put a figure from the instance in it (count, date, place), which
is also the part an answer engine quotes.

---

## Entities and authorship

Search engines and models reason about entities, not loose pages. Two things are
worth wiring.

**One organization identity, referenced everywhere.** Declare the organization
once with a stable `@id`, then reference it by `@id` from every other block and
every other property that names a publisher or creator.

```json
{ "@type": "Organization", "@id": "https://example.com/#organization", "name": "...", "url": "..." }
```

```json
{ "@type": "Dataset", "creator": { "@id": "https://example.com/#organization" } }
```

If you operate more than one property (a main site and a data subdomain), have
both reference the **same** `@id` string. Otherwise they read as different
companies and neither accumulates the other's authority. The failure mode to
watch for: a child property referencing an `@id` that the parent never declares,
so the reference dangles.

**`sameAs` means the same entity, nothing weaker.** A parent company is
`parentOrganization`, not `sameAs`: listing the parent's domain under `sameAs`
merges the two and hands the parent's name to your results. Social accounts go
in `sameAs` only when they are the organization's own. On a site whose public
accounts belong to characters, personas or a founder, leave the property out;
a guessed URL there is worse than none.

**Trust anchors.** Before recommending a business, an agent looks for the pages
a person would: `/about` and `/contact`, public, with real content (who operates
the site, the legal entity, what it does and does not do, how to reach it), and
an `Organization` with `contactPoint` and, where one is public, `address`. Mark
them `AboutPage` and `ContactPage`, tied to the organization by `@id`. They are
the pages readiness scorers check first and most sites never wrote.

**Real authorship on editorial content.** A named person, a visible date, a
`Person` entity, and an author page that actually exists and is linked from the
byline. Content without an author is content without anyone accountable for it,
which is what the E-E-A-T guidelines are ultimately measuring.

Do not invent credentials. An honest short bio outperforms an inflated one the
moment anyone checks.

**Content written by an agent still needs a cadence.** When the blog is authored
through an LLM tool rather than a CMS, nothing forces publication to happen.
Put the rhythm somewhere visible (a schedule on the content object, a recurring
task) and treat a quiet month as a defect, the same way a stalled index is.

**And it needs a re-read when the code under it moves.** An article that
explains a pricing formula, quotes a plan limit or cites the dataset figure is
correct on the day it is written and silently wrong the day the module
changes, because nothing in the build knows the two are related. Make the
relation explicit: each editorial entry declares the source files its claims
depend on, a manifest records a hash of the content and of each dependency
with the review date, and CI fails when either moved without a recorded
review. Give each entry a review period too (dated analyses shorter than
evergreen guides), so a quiet quarter also fails. Recording a review takes an
explicit date, never "now", because the date is itself a claim. Worked
implementation: `templates/generic/content-review.js`.

---

## IndexNow

A minimal protocol: publish a key file at the site root, then POST changed URLs to
have them re-crawled promptly instead of waiting for discovery.

Worth wiring when content is dated or periodic, where a crawl that arrives days
late means the information is already stale. Roughly free to implement.

```
POST https://api.indexnow.org/indexnow
{ "host": "example.com", "key": "<key>", "urlList": ["https://example.com/page"] }
```

Practical notes:

- **Ping after the deploy is live.** Pinging first gets the old content re-crawled
  and wastes the signal.
- **Reuse the sitemap as the URL source** for a full submission, and accept
  explicit paths for a targeted one.
- **Filter by host** before submitting; a wrong-host URL fails the whole batch on
  some endpoints.
- **Batch,** and log the status per batch. Silence here is indistinguishable from
  success.

---

## Social images

The image shown when a link is shared. Not a ranking factor, very much a
click-through factor, and increasingly what a link-preview fetcher renders.

**Generate them from one template** parameterized by title, description and
category, rather than producing files per page. Then re-skinning the brand
re-skins every image with no per-page work, and a new page has an image the moment
it exists.

Gotchas that cost real debugging time:

- The route usually lives under a path blocked by `robots.txt`. Allow it
  explicitly, or no preview renders anywhere.
- Font loading in image-generation runtimes is restrictive. Static TTF files
  resolved through the bundler are the reliable path; webfont formats and
  request-time fetches commonly fail in production while working in dev.
- Verify against a real production build, not the dev server. This is the single
  most common "works locally" surprise in this area.
- Keep text large. These images are consumed as thumbnails.

---

## Quick verification pass

After any change to this layer, check the deployed site rather than the code:

```sh
curl -s https://example.com/robots.txt
curl -s https://example.com/sitemap.xml | grep -c "<loc>"
curl -sI https://example.com/ | grep -i "^location\|^cache-control"
curl -s https://example.com/some/page | grep -i "rel=\"canonical\"\|<title>"
```

Then confirm the counts match what the code should produce. A sitemap with fewer
URLs than the registry has entries means a filter is dropping something silently,
which is how page types disappear for months without anyone noticing.
