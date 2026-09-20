# Programmatic Pages at Scale

Generating many pages from data without producing the thin content that gets a
site demoted.

---

## The one test

Before designing the template, answer this about a single instance of it:

> **Does this page answer something only we can answer?**

If the answer is no, the page should not exist, and no amount of template polish
fixes it. Everything below is machinery for keeping that answer yes at scale.

Three ways a page passes:

1. **It carries measurement.** A number computed from your data for exactly this
   slice.
2. **It carries judgment.** Segment-specific guidance that took expertise to
   write once and is reused honestly.
3. **It carries a tool.** An interactive calculation seeded with real values for
   this case.

A page that only recombines words from a keyword list passes none of them.

---

## Thin content and doorway pages

Two related failure modes worth naming precisely, because teams often think they
are avoiding one while building the other.

**Thin content:** a templated page whose unique portion is a few substituted
words. It answers nothing a generic page would not answer.

**Doorway page:** the same page duplicated across a dimension (usually
geographic) with no dimension-specific substance, existing to capture "X in
<place>" queries and funnel everyone to the same destination.

Both are explicitly targeted by search quality systems, and both are also
increasingly useless for AEO, because a model summarizing your page has nothing
to extract.

The tell, in both cases: **if you diff two instances of the template and only the
proper nouns changed, it is thin.**

---

## Choosing the axes

The dimension you scale on determines whether the data can carry it.

| Axis | Works when | Fails when |
| --- | --- | --- |
| **Segment or use case** | You have segment-specific guidance and defaults | The segments differ only by name |
| **Geography** | You measure per region and coverage is real | You have national data and a list of city names |
| **Entity** (item, product, model) | Each entity has its own record and history | Entities share one generic description |
| **Comparison** (`/vs/x`, `/alternatives/x`) | You can honestly characterize both sides | You are guessing at the competitor |
| **Intersection** (segment x region) | Both axes are independently supported and coverage survives the intersection | It is a multiplication trick to inflate page count |
| **Concept** (one tool per formula: markup, break-even, yield, unit conversion) | Each page hosts a working calculation with its own inputs, defaults and worked example | The "tool" is a paragraph explaining the formula |

The concept axis is worth calling out because it is the one that does not
cannibalize. A segment tool and a segment guide compete for the same query; a
break-even calculator answers a query nothing else on the site targets, so it
enters the index without moving an existing page. The pattern that keeps it
cheap: the arithmetic in one pure module (so the twin and the tests share it),
copy and defaults on a content object, the inputs mirrored into the query
string with `replaceState` so a result is shareable without a reload, and one
telemetry event per computation so usage is measurable before search traffic
arrives.

Intersections deserve care. They multiply page count fastest and are where
coverage collapses quietly: national data may be strong, and a single
segment-and-region cell still be computed from almost nothing.

### Coverage floors

For any data-backed axis, define the minimum that justifies a page, and enforce it
in the route:

```ts
const MIN_COVERAGE = 0.34;          // fraction of the basket present in this slice
const MIN_ROWS_FOR_TABLE = 3;       // below this, the table is not a table
const MIN_POINTS_FOR_CHART = 3;     // below this, a chart is two dots and a line

if (coverage < MIN_COVERAGE) notFound();
```

**404 is the correct response,** not a page with a "data unavailable" notice. A
page that exists in order to say nothing still gets crawled, still enters the
index, and still dilutes the average quality of your site.

The one exception: an entity that genuinely exists (a product in the catalog, a
city with one store) but has no data worth a page *this period*. There, a real
page marked `robots: noindex` keeps the URL stable for the day the data arrives
and for internal links that already point at it, without asking for indexing.
Use it for real entities with a temporary gap; a slice that fails the coverage
floor is not that, and 404s.

**One constant should gate the sitemap and the hub.** Whatever threshold decides
that an instance is worth a page (`MIN_STATES = 3`, `MIN_COVERAGE`) has to be
the same function the hub calls to list siblings and the sitemap calls to
enumerate. Two thresholds drift, and then the hub links to an unindexed page or
the sitemap advertises one no hub reaches.

Do not pre-render slices that depend on a periodic recompute. Rendering on demand
with revalidation means a period's new data appears without a deploy, and a slice
that falls below the floor stops existing on its own.

### Near-duplicate axes

When two generated segments draw on largely the same underlying data, their pages
converge. Measure the overlap rather than eyeballing it: the ratio of shared items
to total distinct items across the two definitions (Jaccard index) is enough.

Overlap above roughly 0.8 means the two pages will read as near-duplicates and
their numbers will move together. That is not automatically disqualifying, since
the audiences may genuinely search differently, but it must be a decision on
record with the differentiating content named, not an accident discovered later.

The limit case is two routes that render the same rows. On one property a
"reference price table" page and the largest region's slice of the index
page both read the same query with the same filter, so the twelve figures on
one were the twelve figures on the other, under two titles. Nobody had
written that; the second route had been migrated onto the index's data as a
convenience. It was found by the production inventory crawl comparing text
across pages, not by reading code. The fix is a data decision, not a
canonical: make the reference page show a genuinely different cut (national
rather than the top region), or retire it.

---

## Making instances genuinely differ

Concrete devices, cheapest first:

- **Seed with real values.** Where the page hosts a tool, preload it with a
  realistic case for that segment, drawn from actual data rather than round
  numbers. This is often the single largest source of unique content on the page.
- **Segment-specific benchmarks.** Target ranges, typical values, common
  distributions for this slice.
- **Segment-specific mistakes.** A short list of what goes wrong in this
  particular case is high-value, hard to fabricate, and cannot be templated.
- **Real cross-links.** Link to sibling instances that are actually related, from
  a curated relation on the content object rather than from "three random others".
  Making that relation a required field is a cheap forcing function: it does not
  compile until someone thinks about it.
- **A dated data block.** Even one table with a period stamp changes the page from
  evergreen filler into a measurement.
- **The tool inside the article, seeded with the article's own example.** An
  editorial page that walks through a worked case ("a batch of forty at 1.20
  each, sold at 3.50") can host the calculator right after the introduction
  with those numbers preloaded, so the reader checks the text's arithmetic
  and then replaces it with their own. The article gains the one thing a
  model cannot summarize away, and the tool gains a page that explains it.
  Register the embed in one list (which articles carry which tool), because
  adding one changes what the page claims and should count as an edit for
  review purposes.

---

## Publishing cadence

Shipping four hundred pages in one day is a spike that looks like what
low-quality mass generation looks like. Two mitigations, both worth doing:

- **Schedule publication by date on the content object.** The route and the
  sitemap filter on it, so pages appear over weeks without any deploy ceremony.
  This also lets seasonal content be written far in advance and appear on time.
- **Ship the axis, then extend it.** A first release with the strongest instances,
  then extensions as data supports them, reads like a growing site rather than a
  dump.

```ts
export function getPublished<T extends { publishDate?: string }>(all: T[]): T[] {
  const today = new Date().toISOString().slice(0, 10);
  return all.filter((x) => !x.publishDate || x.publishDate <= today);
}
```

Everything that enumerates pages, the sitemap, hubs, `llms.txt`, internal links,
must call the same filter. A page live in the sitemap but 404 from the hub, or
vice versa, is a common and avoidable inconsistency.

Two consequences of date-gated publication that only show up later:

- **A build-time sitemap does not see the date pass.** The route compares the
  date at request time and starts answering 200 on the day; a sitemap that was
  generated at build (check the `Age` header on the deployed file) keeps
  omitting the page until the next deploy, which may be weeks. Either render
  the sitemap at request time with revalidation, or schedule a deploy for the
  publication date, and check the deployed count on the day.
- **A page that lands mid-experiment belongs to no arm.** If titles or
  templates are being A/B tested by segment, a segment whose date falls inside
  the measurement window is neither cohort nor control, and it contaminates
  whichever bucket the report drops it into. Decide its arm in the experiment
  registry before it goes live (typically a third arm that gets the new
  treatment and is excluded from the read). See `references/measurement.md`.

---

## Internal linking and orphans

A generated page reachable only from the sitemap is barely a page. Every instance
needs a real path in:

- From the **hub** for its axis
- From **sibling instances** (the curated relation above)
- From **editorial content** that mentions the case
- From the **tool or guide** it complements, in both directions

Orphan pages happen most often to page types added later, after the hub was
written. When adding a new type, add its links in the same change, and check
afterward with a crawl rather than from memory.

Reverse links are the ones people forget: if a guide links to a calculator, the
calculator should link back to the guide.

**Measure the orphan share, do not estimate it.** The number is the fraction
of sitemap URLs that at least one crawlable page links to. On a data property
with some forty-four thousand entity pages, the only internal path to them
was a search route, and the search route was disallowed in `robots.txt`: six
percent of the sitemap was reachable by a link. Two hub axes fixed most of it,
a category hub (entities grouped by what they are, with a median per unit and
a capped table) and a place hub (entities by locality, gated on a floor of at
least two sources per place), and reachability went to a bit under a fifth in
one change. Hubs are the cheapest link a large entity corpus can get, and
they need the same coverage floor as any other generated page.

**Link to the canonical URL, never to a scoped variant.** A table whose rows
carry `?region=XX` in the `href` hands the crawler thousands of parameterized
duplicates of pages that self-canonical to the clean path, which is a
contradiction it resolves by trusting neither. Put the canonical path in the
`href` and apply the scope on click (a small client component that reads the
current region and appends it during navigation), so a human keeps their
context and a crawler sees one URL per entity.

---

## Sitemaps at scale

The protocol caps a sitemap file at 50,000 URLs and 50MB uncompressed. Above
that, or well before it, publish an index that points to shards.

Shard deterministically from the same source the pages come from, so the index
and the shards can never disagree:

```
/sitemap.xml          -> index listing /sitemap/0.xml, /sitemap/1.xml, ...
/sitemap/0.xml        -> core pages (home, hubs, editorial)
/sitemap/{n}.xml      -> entity pages, fixed-size blocks
```

Use a block size with headroom, 40,000 rather than 50,000, so a growth spurt does
not push a shard over the limit between deploys. See
`templates/next/sitemap-sharded.ts`.

Check what is missing from the sitemap after any expansion. Routes added late,
especially intersection routes rendered on demand, are frequently live and absent
from the sitemap for months, discoverable only through internal links.

---

## Comparison pages

`/vs/{competitor}` and `/alternatives/{competitor}` are usually open territory and
are prime citation material, because a model asked to compare tools will quote
whoever wrote the comparison down.

Rules that keep them defensible:

- **Exclude yourself from your own comparison set.** Generating from a registry
  that includes your own entry produces a self-comparison page. Filter it at the
  source so the sitemap, the hub and the pages all agree.
- **Be accurate about the other side, and dated.** State when you last checked. A
  wrong claim about a competitor is the fastest way to earn a correction that
  outranks you.
- **Give a real answer to "when should I pick them".** A comparison where the
  other tool never wins reads as marketing and gets discounted by both readers and
  models.
- **Decide hub versus redirect deliberately.** Two hubs covering the same set
  (`/vs` and `/alternatives`) split signals; consolidating one into the other with
  a redirect is usually right, but then make sure nothing still links to the
  retired hub as if it were a page.
