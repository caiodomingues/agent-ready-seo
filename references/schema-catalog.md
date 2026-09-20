# Structured Data Catalog

Which schema.org type each page type needs, what it buys, and the mistakes that
turn markup into a liability.

Format: JSON-LD in a `<script type="application/ld+json">`. Microdata and RDFa are
supported and not worth the maintenance cost.

---

## Why bother, for each reader

**For the crawler:** eligibility for enhanced results. Real, measurable, and the
usual reason teams start.

**For the model:** cheap disambiguation. It does not have to infer that this
number is a price in a currency for a specific region, because that is declared.
This is the underrated half. A page whose claims are declared is a page that gets
summarized correctly.

Which is also why the failure mode below is so costly.

---

## The rule that matters more than any type

**Structured data must agree with the visible page.**

A model reads the declared block, not your table. If a FAQ block says a cost is
one figure while the article's own table says another, the model repeats the
declared figure with your name attached, and you have published a wrong answer at
scale in your own voice.

This drifts in one specific way: someone edits the prose and does not touch the
JSON-LD, because the JSON-LD lives at the bottom of the file and reads like
configuration. When auditing, diff declared claims against visible claims
specifically. It is a different pass from checking that the markup validates,
and validators will never catch it.

Where possible, **derive the markup from the same source as the visible content**
so the class of bug cannot exist.

---

## Page type to type mapping

| Page type | Primary type | Also worth adding |
| --- | --- | --- |
| Editorial article | `BlogPosting` or `Article` | `BreadcrumbList`, `FAQPage` if it has a real FAQ |
| How-to guide | `HowTo` | `BreadcrumbList`, `FAQPage` |
| Segment or category hub | `CollectionPage` + `ItemList` | `BreadcrumbList` |
| Comparison page | `Article` | `ItemList` of what is compared, `BreadcrumbList` |
| Free tool or calculator | `SoftwareApplication` or `WebApplication` | `FAQPage`, `BreadcrumbList` |
| Product or plans page | `SoftwareApplication` with `Offer` | `AggregateRating` only if real |
| Data or index page | `Dataset` | `BreadcrumbList`, `Place` for coverage |
| Methodology page | `TechArticle` | `BreadcrumbList` |
| Author page | `ProfilePage` + `Person` | |
| About / contact | `AboutPage` / `ContactPage` | `about` and `mainEntity` pointing at the organization `@id` |
| Home | `WebSite` + `Organization` | `SearchAction` if you have site search |
| Any nested page | `BreadcrumbList` | |

A mature content site ends up with roughly twenty to thirty distinct types in
play. That is normal and is not a sign of over-engineering, as long as each one is
generated rather than hand-written per page.

---

## The types worth getting right

### Organization and the shared `@id`

Declare once, reference everywhere by `@id`. See `references/foundations.md`.

### BreadcrumbList

Cheap, widely honored, and it changes how the URL is displayed in results. Any
page more than one level deep should have it. Generate from the route so it cannot
disagree with the actual hierarchy.

### FAQPage

Only for questions genuinely answered on the page, visible to the user. Do not
mark up questions that exist solely in the JSON-LD.

Rich-result eligibility for FAQ has narrowed considerably over time, so treat the
value as mostly AEO: it is a clean, machine-readable question-to-answer mapping,
which is exactly the shape an answer engine wants.

**Feed the block and the visible list from one array.** The failure above (a
declared answer contradicting the page) only exists when the FAQ is typed twice.
One `faqs` constant, or one set of translation keys, rendered into both the
`<dl>` and the JSON-LD, makes the divergence impossible rather than merely
audited. Strip rich-text tags before they reach the block.

### Speakable

`SpeakableSpecification` on an article, with a CSS selector (`h1`,
`[data-speakable]`) that wraps the one sentence answering the question the
article exists for. Cheap, and it is a direct hint to voice assistants and
summarizers about which line to lift. Mark exactly one sentence; marking the
whole body says nothing.

### HowTo

For genuine procedures with ordered steps. Each `HowToStep` needs a name and text
that match the visible step. Same narrowing as FAQ on the rich-result side, same
retained value for models.

### Dataset

The GEO workhorse. Properties, and the ones commonly omitted:

```json
{
  "@type": "Dataset",
  "name": "...",
  "description": "...",            // omitted constantly; validators complain
  "url": "...",
  "creator": { "@id": "..." },     // omitted constantly
  "license": "...",                // omitted constantly, and models read it
  "inLanguage": "...",
  "temporalCoverage": "2026-01/..",
  "spatialCoverage": { "@type": "Place", "name": "..." },
  "isAccessibleForFree": true,
  "keywords": ["..."]
}
```

See `templates/next/dataset-jsonld.ts`.

### SoftwareApplication with Offer

For a product or plans page. Include every tier as an `Offer` with `price` and
`priceCurrency`, including the free tier at price `0`. This is one of the few
places where markup directly answers a question users ask models constantly
("what does X cost").

Keep it generated from whatever module actually enforces the plan limits, so the
declared price and the charged price cannot diverge.

### Review and AggregateRating

**Only with real reviews.** Star markup is tempting precisely because it is
visible in results, which is why fabricated ratings are policed hard and why the
penalty is loss of rich results across the whole site.

Two specific rules:

- A `Review` object without a `reviewRating` is invalid and will be flagged.
  Either include the rating or do not mark the testimonial up as a review.
- `AggregateRating` needs a real count from real, verifiable reviews. Absent that,
  ship real `Review` objects with named authors and no aggregate, and accept
  having no stars.

### Product built from observations

An entity page on a price index renders `Product` with `name`, `description`,
`image`, `sku` and an `offers` block carrying the observed figure, currency
and the date it was observed. Two properties stay out, and the reason is
different from the legal one below: `availability` and `priceValidUntil`
describe a seller's current promise, and the page holds a historical
observation. It saw a price on a date; it did not see stock, and it cannot
promise a validity window. Declaring either turns a measurement into a
listing, and a wrong listing is what a shopping surface penalizes.

### The analysis post and its dataset

The written analysis that accompanies each period (see
`references/citable-data.md`, publishing as a routine) is a `BlogPosting`,
and the data it analyzes is declared as a `Dataset` nested under its `about`,
not as a second root node. The root `Dataset` lives on the index pages; the
post is *about* that dataset for one period. Give the post distinct
`datePublished` and `dateModified`, and keep them honest: a periodic re-read
that changed nothing does not move `dateModified`, and a correction that did
moves it and is explained in the text.

### What to leave out under a legal constraint

Structured data is a second, machine-readable copy of the page, so anything the
page deliberately withholds must be withheld there too. A price index that
pseudonymizes its sources renders `Product` without `seller` and without
`offers.url`, because either would name the retailer the page hides. Write the
omission down next to the block, and back it with a test that scans everything
under the public output directory for the forbidden identifiers: a redaction
that only lives in one component is one refactor from leaking.

### WebSite and SearchAction

Declare `SearchAction` only if the URL template actually works. If the markup says
`?q={search_term_string}` the site had better honor `?q=`. Markup describing a
search that does not exist is a self-inflicted validation failure and a broken
promise to any agent that tries it.

---

## Validation and review

Validators catch syntax and required properties. They do not catch the two errors
that matter most: markup that contradicts the page, and markup describing
functionality that does not exist. Both need a human or a purpose-built check.

A useful audit sweep, in order:

```sh
# 1. Which types are in play, and where
grep -rhoE '"@type":\s*"[A-Za-z]+"' src --include=*.tsx | sort | uniq -c | sort -rn

# 2. Which pages have no structured data at all
# (compare against your route list)
grep -rl '"@context"' src/app --include=page.tsx
```

Then, per type: does a page of this type exist that renders content the block
contradicts? That is the pass worth doing manually.
