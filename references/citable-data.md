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
