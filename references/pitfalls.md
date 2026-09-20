# Pitfalls and Audit Checklist

A catalog of failures worth checking for, split by who caused them. Both halves
teach: the first is what to avoid copying from the market, the second is what
tends to rot inside a site that is otherwise doing the work.

Use the checklist at the end when auditing an existing site or reviewing a plan.

---

## Failures commonly seen in the wild

**Geographic doorway pages.** The same page with the place name swapped, backed by
no local data. Fix: a coverage floor per slice, and a 404 below it. See
`references/pseo.md`.

**Endless tag archives.** Hundreds of tag pages with two items each, existing to
multiply URLs. Tags are good when they group real reading, not when they are a
page-count strategy.

**Reasoning in the wrong unit or currency.** A tool localized in language but
computing in another currency or measurement system. It looks like a detail and it
destroys trust on the first calculation a user checks by hand.

**Blocking AI crawlers.** Guarantees never being cited, at the moment the channel
is growing. If there is a deliberate licensing reason, fine. By accident, through
a copied `robots.txt`, it is pure loss.

**Fabricated ratings.** Aggregate rating markup with no real reviews behind it.
The upside is stars in a result; the downside is losing rich results everywhere,
permanently.

**Gating everything behind a login.** No public surface means no citable page and
nothing to rank. Even a data-heavy product can publish aggregates. See the free
versus paid line in `references/citable-data.md`.

**Generic tables that contradict the site's own advice.** A page telling readers
not to copy competitor prices, next to a table of competitor prices. Internal
contradiction is quotable, and a model will quote whichever half is worse for you.

---

## Failures that appear inside your own site

These are the ones found by auditing, and every one of them has been shipped by
teams that knew better.

**Structured data contradicting the visible page.** The worst of the set. A
declared FAQ answer stating a figure the article's own table contradicts. The
model reads the declared block and repeats it in your name. Cause: prose gets
edited, the JSON-LD at the bottom of the file does not.

**Doubled site name in titles.** A page setting its full title while the global
template also appends the site name. Hits exactly the hand-written pages, so it
survives review.

**Sitemap `lastmod` set to build time.** Every URL claims to change on every
deploy. Trains crawlers to ignore the field.

**Marketing claims about data that aged out.** A site advertising a corpus size
and coverage from two years ago while the real numbers grew by several multiples.
Claims about data age silently while the data grows. Re-check them on a schedule,
and sweep every surface at once: home, about, comparisons, `llms.txt`, generated
copy.

**Self-comparison pages.** A comparison registry that includes your own entry,
producing `/vs/yourself` in the sitemap and the hub. Filter at the source.

**Orphan page types.** A type added after the hub was written, linked from
nowhere. Common for late intersection routes and new calculators.

**Routes live but missing from the sitemap.** Especially on-demand routes added
during an expansion. They answer 200, they are announced to agents, and the search
crawler only reaches them through internal links.

**A convention promised and not fully delivered.** `llms.txt` announcing that
every page answers at `.md` while newer page types have no twin.

**Over-broad `robots.txt` blocks catching useful routes.** The dynamic social
image endpoint under a blocked `/api/` prefix is the standard case.

**`SearchAction` markup for a search that does not honor the parameter.** Declared
in the `WebSite` block, never implemented, or implemented under a different
parameter name.

**Schema change not applied with the code.** Capture code shipped, columns not
created. Records nothing, breaks nothing, discovered a month later.

**Empty `200` instead of `404`.** A generated route rendering an empty shell when
data is missing. Worse than a 404, because it enters the index as a real page.

**The auth layer turning every unknown path into a page.** A gated product with a
public marketing surface usually has a default-deny middleware: anything not on
the public allowlist redirects to `/login`, and `/login` answers 200. So
`/definitely-not-a-page` is a 307 followed by a 200, and every agent that probes
concludes every URL on the site exists. External scorers flag this as a soft-404
on the whole domain. It is invisible from inside the product, because every
path a human types is a real one. Fix in `references/agent-layer.md` (gated
applications) and `templates/next/gated-app-404.ts`.

**An edge toggle overriding `robots.txt`.** A CDN's "block AI bots" or
"AI labyrinth" switch blocks the named crawlers at the edge, and nothing in the
repository changes. The allow rules are still emitted, still reviewed, still
wrong. Test with the user agent from outside (`curl -A GPTBot`), not by reading
the file, and record the dashboard setting next to the robots source.

**A root-level canonical that cascades.** In frameworks where page metadata
inherits from the layout, a canonical declared at the root is inherited by
every page that does not override it, and each of them then claims to be a
duplicate of the home page. Declare the canonical per page, never on the root.

**A global trailing-slash flag breaking an exact-match allowlist.** Turning off
the framework's trailing-slash normalization for one route (an analytics
ingest path that treats a 308 as a failed send) turns it off everywhere. A
public allowlist that matches `pathname === "/privacy"` then misses
`/privacy/`, which falls into the auth gate. Re-emit the normalization in the
middleware for every path except the one that needed the exception.

**A case-insensitive redirect that matches itself.** A `/states/rj` to
`/states/RJ` redirect on a host whose route matching is case-insensitive
matches its own destination and loops. Check how the host matches before
adding a case-normalizing redirect.

**`sameAs` pointing at the wrong entity.** `sameAs` asserts "this is the same
thing". A product site listing its parent company's domain there tells the
engine the two are one entity, and the site name shown in results becomes the
parent's. Use `parentOrganization` for a parent brand, and leave `sameAs` empty
rather than pointing it at social accounts that belong to a character or a
person instead of the organization.

**Negotiating a URL that is already the twin.** With both the `.md` suffix and
`Accept` negotiation live, an agent may send the `.md` URL and the header. A
matcher whose slug pattern is `[^/]+` captures `x.md` as the slug, resolves a
twin for the twin, and 404s on a URL that works without the header. Exclude
the suffix in the middleware matcher so negotiation never sees it, and test
that pair.

**Titles measured in the code, cut in the result.** A layout template adds
the site name, a helper adds the year, and a title reviewed at 48 characters
renders at 72. On one property every programmatic page was over the desktop
limit and nobody had seen it, because every review read the raw string.
Measure the rendered tag from a crawl, decide the suffix per family, add the
year only when it fits, and ratchet the limit in CI. See
`references/foundations.md`.

**A session check in the shared layout.** The marketing layout calls the
session helper to decide what the navbar shows, the helper reads cookies, and
every public page becomes `private, no-store`: no CDN cache, no edge hits,
per-request rendering of pages that never change. The `Set-Cookie` discipline
in `references/measurement.md` then protects nothing. Read `cache-control`
from outside; if it says private on a marketing page, that is the first fix.

**A build-time sitemap and a date-gated page.** The route starts answering
200 on the publication date; the sitemap, generated at build and served from
cache for days, does not list it until the next deploy. Check the `Age`
header on the deployed sitemap, and either render it at request time or
schedule a deploy for the date.

**Two routes, the same rows.** A convenience migration pointed a reference
table page at the index's query with the index's filter, and twelve figures
appeared under two titles. Nobody wrote a duplicate; one was created by
reuse. The inventory crawl's text-overlap column finds it; reading the code
does not.

**Metadata typed in three places.** Literals in page files, fields on the
content object, and a second copy in the markdown exporter. The HTML and its
twin disagreed on exactly the pages that had been hand-tuned. One pure module
feeds every surface; see `templates/next/seo-metadata.ts`.

**A tool-shaped title over a page that hides the figure.** The title promises
"free calculator" and the component blurs the suggested price behind a login.
The click arrives and leaves. Before a title promises a result, the
production inventory must confirm the anonymous page delivers it.

**An entity corpus reachable only through search.** Tens of thousands of
entity pages in the sitemap whose only internal path was a search route, and
the search route was disallowed. Reachability by internal link was six
percent. Hubs by category and by place, each with a coverage floor, are the
fix; the metric is the share of sitemap URLs with at least one inbound link.

**Scoped hrefs in tables.** Every row linking to `?region=XX` variants of
pages that self-canonical to the clean path. Put the canonical path in the
`href` and apply the scope on click.

**Relative dates on static pages.** "Updated 3 days ago" is computed at build
and served for a week. Absolute observation dates, always; the build date is
never the data date.

**An article whose code moved under it.** The pricing module changed, the plan
limits changed, the dataset figure changed, and the articles explaining them
did not, because nothing in the build knew they were related. Fingerprint
content together with its declared dependencies and fail CI when either
changed without a recorded review. See `templates/generic/content-review.js`.

---

## Audit checklist

Work top to bottom. Everything is checked against the deployed site, not against
the code, because the gap between them is the point.

### Indexing and crawl

- [ ] One canonical host, the other permanently redirected, only the canonical form emitted anywhere
- [ ] `robots.txt` blocks the application area and nothing public
- [ ] AI crawlers explicitly allowed, list still current, and confirmed from
      outside with `curl -A <bot>` (an edge toggle can override the file)
- [ ] A random unknown path returns 404, not a redirect to login or an app shell
- [ ] Social image route reachable despite any `/api/` block
- [ ] `sitemap.xml` present, listed in `robots.txt`, and its URL count matches what the content registry should produce
- [ ] `lastmod` absent unless a real content date backs it
- [ ] Every generated route type appears in the sitemap, including ones added late
- [ ] No URL in the sitemap 404s, redirects, or is canonicalized elsewhere
- [ ] Public pages are cacheable (`cache-control` public, CDN hit), so no
      shared layout is reading the session
- [ ] Date-gated pages: the sitemap renders at request time, or a deploy is
      scheduled for each publication date

### Duplication

- [ ] Every page self-canonicals to the clean URL on the canonical host, and no
      canonical is declared on the root layout
- [ ] Paginated pages self-canonical rather than pointing at page 1
- [ ] Alternate renderings canonical to the HTML page
- [ ] Alternate renderings stay out of the sitemap
- [ ] No self-comparison or self-alternative page exists
- [ ] Hubs covering the same set are consolidated, with the retired one redirected
- [ ] No two routes render the same rows under different titles
- [ ] Internal `href`s carry the canonical path, never a scoped query variant

### Content quality

- [ ] Two instances of each template differ by more than proper nouns
- [ ] Every data-backed slice has a coverage floor and 404s below it
- [ ] Near-duplicate axes are measured and the decision is on record
- [ ] Each generated page has real inbound links from a hub, siblings and editorial
- [ ] Reverse links exist where a pair references each other
- [ ] No page exists solely to say data is unavailable
- [ ] Share of sitemap URLs with an inbound internal link is measured, and
      entity corpora have hubs with coverage floors
- [ ] Editorial entries are fingerprinted with their code dependencies, and the
      review manifest is current

### Structured data

- [ ] Declared claims match the visible page, checked by reading, not by validator
- [ ] Organization declared once with a stable `@id`, referenced by `@id` elsewhere
- [ ] Multiple properties reference the same organization `@id`
- [ ] Organization carries `contactPoint` (and `address` where one is public);
      `sameAs` names only accounts that ARE the organization
- [ ] `/about` and `/contact` exist, are public, and carry real content
- [ ] `og:site_name` and `WebSite.name` agree, so the engine does not derive the
      site name from the domain
- [ ] FAQ markup and the visible FAQ are fed by the same array, not two strings
- [ ] No `AggregateRating` without real reviews; no `Review` without a rating
- [ ] `SearchAction` only if the parameter genuinely works
- [ ] `Dataset` blocks carry description, creator and license
- [ ] Breadcrumbs on every page deeper than one level, matching the real hierarchy
- [ ] `Product` built from observations declares no `availability` or
      `priceValidUntil`
- [ ] Every aggregate states observations, distinct sources and places as three
      counts, with absolute first/last dates from the same rows

### Agent layer

- [ ] `/{path}.md` returns 200, `text/markdown`, and a canonical `Link` header
- [ ] Missing pages return 404, not an empty 200
- [ ] The 404 body points at recovery paths (`llms.txt`, sitemap, nearest hub)
- [ ] `Accept: text/markdown` on a content URL returns markdown, with `Vary: Accept`
- [ ] An Accept header the resource cannot satisfy returns 406, and q-values are honored
- [ ] The `.md` URL with `Accept: text/markdown` still returns the twin (no
      double negotiation)
- [ ] `llms-full.txt` stays under a stated byte budget, with overflow listed as
      links rather than dropped
- [ ] `llms.txt` has a "when to use this" section naming real jobs
- [ ] The home twin canonicals to the root, not to `/index`
- [ ] `llms.txt` claims match reality, section by section
- [ ] `llms.txt` and `llms-full.txt` are generated from live content
- [ ] `rel=alternate` present on pages that have a twin
- [ ] Overlapping rewrite patterns are ordered specific-first, with a test
- [ ] Non-ASCII characters round-trip correctly

### Titles and metadata

- [ ] No doubled site name anywhere
- [ ] Every page type has a distinct description pattern
- [ ] Periodic content carries a year token generated at render time, only where it still fits
- [ ] Rendered `<title>` is measured from a crawl; the suffix policy per family
      is on record; the length ratchet runs in CI
- [ ] A tool-shaped title describes what an anonymous visitor actually gets

### Measurement

- [ ] Search console verified and receiving data
- [ ] First-touch capture live **and** its schema change applied
- [ ] No signal classified as `direct`; unattributed is a visible category
- [ ] Attribution write cannot break signup
- [ ] Clean arrivals set no cookie, so caching still applies
- [ ] An external agent-readiness scan has been run, and its failed check IDs
      recorded rather than just the score (see `verification.md`)
- [ ] Every title or template change has a row in the experiment register, a
      baseline taken before the deploy, and arms decided in one module
- [ ] Console reads exclude the deploy day and split hosts

### Claims

- [ ] Every quantitative claim about the product or data re-verified this quarter
- [ ] The same figures used across all surfaces, including generated copy
- [ ] The figures live in one constant with prose variants and a content date;
      the retired pair is swept by regex in CI

---

## Auditing method

Two rules make the difference between an audit that finds things and one that
produces a list of generic recommendations.

**Verify against production, not against intent.** Fetch the deployed URL. Count
the deployed sitemap. Read the deployed `llms.txt`. Most findings live in the gap
between what the code says and what is served.

**Verify each finding before reporting it.** A plausible bug that turns out to be
deliberate costs more credibility than a missed one. Two examples worth expecting:
a hub that looks orphaned but is intentionally redirected into another hub, and a
markdown twin absent from the sitemap on purpose. Check the redirect. Read the
comment. Then report.
