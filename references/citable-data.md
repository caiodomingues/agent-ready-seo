# Citable Data (GEO)

Turning proprietary data into something a generative engine will quote, without
giving away the product it came from.

---

## What actually gets cited

A model composing an answer needs to attach a claim to a source. It reaches for
whatever makes the claim checkable:

- a **number** rather than an adjective
- a **date**, so the number can be placed in time
- a **method**, so the number can be defended
- a **name** that is stable enough to cite twice

Restated common knowledge fails all four. This is why "write more content" is not
a GEO strategy: there is no scarcity in explanation, only in measurement.

**The uncomfortable implication.** If you have no proprietary data, GEO is not
available to you yet, and the honest first move is to go create some. Sources of
defensible data, in rough order of strength:

1. Data you produce by measuring the world (collection, instrumentation, surveys)
2. Data derived from your product's operation, aggregated so it is publishable
3. Data your community generates, with permission
4. Licensed data with exclusivity
5. Public data that anyone can pull, differentiated only by your processing

Level 5 still works if the processing is the contribution: nobody else has
normalized, deduplicated and made comparable what is technically public. Say so
explicitly in the methodology, because that is the part being cited.

---

## The shape that works: a recurring index

The most reliably citable artifact is a **small, fixed, dated aggregate**
published on a schedule.

Concretely: one number (or a small table of numbers) per period, computed over a
fixed basket of items, per region, with a public method.

Why this shape and not a big data dump:

- **A single number is quotable in one sentence.** A dump is not.
- **A period turns a number into a series,** and a series supports "up 4% since
  March", which is a far more attractive sentence for an answer engine than a
  static value.
- **A fixed basket makes periods comparable,** which is the only thing that makes
  the series meaningful.
- **It is small enough to keep publishing,** and publishing again next period is
  what compounds.

### The fixed-basket rule

The basket is the set of items measured. Once published, changing it breaks
comparability with every prior period.

```
Adding an item        -> the series jumps for a reason that is not the world changing
Changing a matcher    -> silently rewrites history if you recompute
Changing package size -> changes the unit the number is expressed in
```

So: pick the basket deliberately, write down why each item is in it, and treat a
change as a version bump requiring full recomputation and a note on the
methodology page. Expansion by **subsetting** an existing basket is safe and is
the cheapest way to add coverage: a new segment defined as a subset of already
measured items needs no new measurement rule and no recompute.

See `templates/next/index-basket.ts` for a basket definition with the guards
described below.

### Guards that keep an aggregate honest

Every one of these exists because its absence produces a number you will later
have to retract.

| Guard | What it prevents |
| --- | --- |
| **Minimum sample per cell** (e.g. 5 distinct items) | Publishing a median of two observations as if it were a measurement |
| **Sanity floor and ceiling per item** | One mispriced or misparsed outlier moving the aggregate |
| **Median, not mean** | A single extreme value dominating |
| **Distinct-entity counting** | The same item counted many times inflating apparent sample size |
| **Minimum package or unit size** | Comparing a small pack's unit price against a bulk pack's |
| **Coverage floor before publishing a slice** | A region page that exists but is computed from almost nothing |
| **Guard against empty recompute** | An upstream failure silently wiping a published series |
| **Diff before write** | Not knowing which cells changed and by how much |

The coverage floor deserves emphasis because it decides whether a page exists at
all. If a regional slice covers less than some fraction of the basket, the route
should **404 rather than render a thin table**. A missing page costs nothing. A
published page that quietly measures three items costs credibility exactly once.

### Recomputation should be idempotent

Run the whole pipeline, compare against stored values, write only differences.
Then a re-run after a data fix is safe, and a dry-run mode gives you the diff as a
report before anything is written. Incremental-only pipelines accumulate errors
you cannot correct without a manual migration.

### What the page says about its own sample

A figure is citable to the extent a reader can tell what it is made of. Next
to every aggregate, from the same rows the aggregate was computed from:

- **How many observations, from how many distinct sources, in how many
  places.** Three different counts, and they are conflated constantly. One
  chain in five cities is five observations and one source; a source
  pseudonymized per region ("Source 3") has to be counted as
  `(region, id)`, because the numbering restarts in every region and a naive
  distinct count merges them. Write the counting rule down and test it with
  four rows.
- **First and last observation date,** from those rows. When they differ,
  say "collected between A and B"; when a row has no date, say "date not
  recorded" rather than filling in a plausible one. A fabricated date is a
  fabricated claim in the one place a reader checks.
- **Absolute dates on anything statically rendered.** "Updated 3 days ago"
  is computed at build time and is a lie by the time the HTML is served a
  week later. The build date is not the observation date, and a static page
  served late must not turn an old observation into today's price.
- **Nothing in the structured data that the observations cannot support.**
  A `Product` block built from historical price observations does not
  declare `availability` or `priceValidUntil`: the page observed a price on a
  date, it did not observe stock, and it cannot promise a validity window.
  See `references/schema-catalog.md`.

Each of these came from a page that had to be corrected after it was live,
not from a checklist.

---

## The methodology page

Non-negotiable. It is what converts a number into a citable number, and it is
frequently the page that gets linked rather than the index itself.

It must state:

- **What is measured,** item by item, with the reference unit
- **How it is aggregated** (median, per period, per region)
- **The sample rule** and what happens below it
- **The period boundary** and when it publishes
- **What it deliberately excludes,** and why
- **Known limitations,** in your own words, before someone else finds them
- **How to cite it,** as copy-pasteable text with the date and URL

Writing the limitations yourself is not a weakness. It is the strongest available
signal that the number was produced by someone who understands its bounds, and it
preempts the criticism that would otherwise be the first search result about you.

A methodology page is one of the few pages worth keeping **without** a markdown
twin, if it is hand-written and detailed: two renderings of a precise document is
exactly where drift hurts most.

---

## Publish the workings, not just the number

The index is the headline. The thing that gets linked is the analysis behind
it: one dated question the data can answer ("which items moved the cost of a
standard batch between June and July"), with every step open. This is a
bulletin, and it is the most citable unit a data property produces, because a
model can quote a method and a reader can re-run it. The shape that held up:

- **A read-only exporter** that pulls the reference rows for named periods
  and refuses to run when a period is incomplete, when rows are duplicated,
  or when coverage is below the sample floor. It writes to a new file in a
  directory per edition and never overwrites a previous edition, because
  the earlier bulletin cites the earlier file.
- **Three published artifacts per edition:** the observed references (with
  source, collection date, price definition, unit and the meaning of the
  sample count stated inside the file), the calculation memory (every
  intermediate figure, so the rounding in the prose can be checked), and a
  printable or downloadable version of the worked case.
- **Observed and assumed, marked apart.** Prices were collected; quantities,
  yields, labor and fees in a worked example are hypotheses. Say which is
  which at the top, in the tables and in the downloads. If a yield was not
  measured, the cost per unit is a simulation, and the page says so.
- **No causes without evidence.** The data shows an item moved; it does not
  show weather, harvest or a supplier's behavior. Leave the cause out unless
  another source supports it.
- **Corrections are dated and explained,** and a correction is not a new
  collection. Re-dating a page to look fresh, when the observations are the
  old ones, is the one thing that would make every earlier citation
  worthless.

A generator that produces the calculation memory and the printable version
from the versioned source file, with no database and no network, is what
makes "reproducible" a property of the build rather than a promise in the
text. Keep that generator with the edition it produced; the next edition gets
its own.

---

## Claims about the data, as one constant

The size of the corpus ("N items, M observations, K regions") is quoted on
the home page, the about page, every comparison page, the `llms.txt`, the
generated descriptions and the assistant's system prompt. It ages while the
data grows, and a sweep after the fact on one property found three different
pairs of figures live at once, one of them from two years before.

One module owns the pair, and nothing else states it:

- **Export prose variants, not bare numbers.** `"412 thousand"` breaks every
  template that appended a noun to it the day the figure becomes
  `"1.3 million"`; `"412 thousand items"` does not. The consumers that need
  a bare number are fewer than the ones that need a sentence.
- **Export the content date with it,** and let it drive `lastmod` in the
  sitemap, `modifiedTime` in the social block, `dateModified` in the
  structured data and `updated:` in the twin's front matter, for every page
  that quotes the figure. Then a refresh of the claim is a refresh of the
  date on exactly the pages that changed, and nowhere else.
- **Name the exception.** A hand-written prose page that states the figure
  in a sentence is the one place the constant cannot reach; list it next to
  the constant so the sweep after a change knows where to look.
- **Retire the old pair with a regex in CI** (see `references/verification.md`,
  Loop 0). The old figure will be pasted back in from an old draft; the
  sweep is what catches it the same day.

---

## Structured data for the dataset

Declare it as a `Dataset` so a crawler does not have to infer that this table is
data rather than decoration. Minimum viable set of properties:

```json
{
  "@context": "https://schema.org",
  "@type": "Dataset",
  "name": "Monthly index of <what>",
  "description": "One or two sentences a stranger could quote verbatim.",
  "url": "https://example.com/index",
  "inLanguage": "en",
  "creator": { "@id": "https://example.com/#organization" },
  "license": "https://example.com/terms",
  "temporalCoverage": "2026-01/..",
  "spatialCoverage": { "@type": "Place", "name": "..." },
  "isAccessibleForFree": true,
  "keywords": ["...", "..."]
}
```

`description`, `creator` and `license` are the three most commonly omitted and the
three that validators complain about. `license` matters beyond validation: a model
deciding whether it may quote your table is reading it.

Reference the organization by `@id` rather than repeating an inline object, so
every mention resolves to one entity. See `references/foundations.md`.

Full template with the entity wiring: `templates/next/dataset-jsonld.ts`.

---

## The line between free and paid

The central dilemma of publishing proprietary data: publish too much and you gave
away the product, publish too little and nothing gets cited.

The line that holds up:

| Publish | Gate |
| --- | --- |
| Aggregates | Individual records |
| Dated snapshots | Current, live values |
| One reference figure per item | Full distribution and history |
| Regional or segment level | Per-entity, per-location detail |
| Educational and explanatory | Operational and workflow |
| Anything a competitor could cite you for | Anything a customer would act on today |

The reasoning: the aggregate is what makes a citation possible and is precisely
what nobody can operate on. Someone who needs to act still has to come in.

Two practical consequences:

- **Put an explicit bridge on the public page.** The page that shows the dated
  aggregate should name what the gated version gives ("current values, your
  location, updated weekly") rather than a generic signup prompt. The visitor
  arrived already interested in exactly this data.
- **Do not gate the methodology.** It costs nothing and it is what makes the free
  number worth citing.

---

## The embeddable badge

A small SVG served from your own route, showing the current period's figure, with
a copy-paste snippet.

```html
<a href="https://example.com/index">
  <img src="https://example.com/api/badge" alt="Current <name> index" width="220" height="60">
</a>
```

Why it works: whoever publishes the badge publishes the link, and third-party
links remain one of the strongest signals in both classic ranking and citation
graphs. Unlike most link tactics the incentive is legitimate, because the badge
gives the other site a live figure it does not have.

Implementation notes:

- **SVG, not PNG.** Text stays selectable, size stays small, it scales.
- **Server-rendered from the same query as the page,** so it cannot show a
  different number than the page it links to.
- **Cache with the period,** not per request.
- **Alt text carries the number,** because that is what a text-only fetcher reads.
- **Never require JavaScript,** since it renders inside foreign pages.

---

## Publishing as a routine

An index that stops updating stops being citable within about two periods,
because the freshest available figure is what gets quoted and yours starts losing
to whoever published later.

Treat it as an editorial commitment with three parts, and automate what you can:

1. **Compute** on a schedule after the upstream data lands.
2. **Publish** the period's page and a short written analysis. A post per period,
   generated from the numbers and then edited, both feeds the news-shaped queries
   and creates the internal links the index pages need.
3. **Notify** search engines directly rather than waiting for a crawl. See
   IndexNow in `references/foundations.md`, which matters more here than anywhere
   else: dated content that gets crawled late is stale on arrival.

If the routine cannot be sustained, publish at a slower period rather than
letting a monthly series go quiet. Quarterly and reliable beats monthly and
abandoned.
