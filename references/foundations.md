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

---

## Titles and metadata

**Check for doubled site names.** With a template like `%s | Site Name`, any page
that sets its full title including the suffix produces `Page | Site Name | Site
Name`. It happens on exactly the pages someone wrote by hand, so it survives
review and shows up in the tab and the result.

Audit with a crawl, not by reading code:

```sh
grep -rn "title:" src/app --include=page.tsx | grep -i "site name"
```

**Descriptions are not a ranking factor and are still worth writing,** because
they influence clicks and because answer engines quote them when nothing better
is available. Write one per page type. Generated descriptions that stuff the same
sentence with a substituted variable are worse than none.

**Include a year token where content is periodic.** Generated at render time, so
it stays current without a content edit:

```ts
title: `${label} pricing guide (${new Date().getFullYear()})`
```

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

**Real authorship on editorial content.** A named person, a visible date, a
`Person` entity, and an author page that actually exists and is linked from the
byline. Content without an author is content without anyone accountable for it,
which is what the E-E-A-T guidelines are ultimately measuring.

Do not invent credentials. An honest short bio outperforms an inflated one the
moment anyone checks.

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
