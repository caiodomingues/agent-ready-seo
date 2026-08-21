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

---

## Audit checklist

Work top to bottom. Everything is checked against the deployed site, not against
the code, because the gap between them is the point.

### Indexing and crawl

- [ ] One canonical host, the other permanently redirected, only the canonical form emitted anywhere
- [ ] `robots.txt` blocks the application area and nothing public
- [ ] AI crawlers explicitly allowed, list still current
- [ ] Social image route reachable despite any `/api/` block
- [ ] `sitemap.xml` present, listed in `robots.txt`, and its URL count matches what the content registry should produce
- [ ] `lastmod` absent unless a real content date backs it
- [ ] Every generated route type appears in the sitemap, including ones added late
- [ ] No URL in the sitemap 404s, redirects, or is canonicalized elsewhere

### Duplication

- [ ] Every page self-canonicals to the clean URL on the canonical host
- [ ] Paginated pages self-canonical rather than pointing at page 1
- [ ] Alternate renderings canonical to the HTML page
- [ ] Alternate renderings stay out of the sitemap
- [ ] No self-comparison or self-alternative page exists
- [ ] Hubs covering the same set are consolidated, with the retired one redirected

### Content quality

- [ ] Two instances of each template differ by more than proper nouns
- [ ] Every data-backed slice has a coverage floor and 404s below it
- [ ] Near-duplicate axes are measured and the decision is on record
- [ ] Each generated page has real inbound links from a hub, siblings and editorial
- [ ] Reverse links exist where a pair references each other
- [ ] No page exists solely to say data is unavailable

### Structured data

- [ ] Declared claims match the visible page, checked by reading, not by validator
- [ ] Organization declared once with a stable `@id`, referenced by `@id` elsewhere
- [ ] Multiple properties reference the same organization `@id`
- [ ] No `AggregateRating` without real reviews; no `Review` without a rating
- [ ] `SearchAction` only if the parameter genuinely works
- [ ] `Dataset` blocks carry description, creator and license
- [ ] Breadcrumbs on every page deeper than one level, matching the real hierarchy

### Agent layer

- [ ] `/{path}.md` returns 200, `text/markdown`, and a canonical `Link` header
- [ ] Missing pages return 404, not an empty 200
- [ ] The 404 body points at recovery paths (`llms.txt`, sitemap, nearest hub)
- [ ] `Accept: text/markdown` on a content URL returns markdown, with `Vary: Accept`
- [ ] An Accept header the resource cannot satisfy returns 406, and q-values are honored
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
- [ ] Periodic content carries a year token generated at render time

### Measurement

- [ ] Search console verified and receiving data
- [ ] First-touch capture live **and** its schema change applied
- [ ] No signal classified as `direct`; unattributed is a visible category
- [ ] Attribution write cannot break signup
- [ ] Clean arrivals set no cookie, so caching still applies
- [ ] An external agent-readiness scan has been run, and its failed check IDs
      recorded rather than just the score (see `verification.md`)

### Claims

- [ ] Every quantitative claim about the product or data re-verified this quarter
- [ ] The same figures used across all surfaces, including generated copy

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
