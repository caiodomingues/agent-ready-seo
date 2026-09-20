# Measurement

How to know whether any of this worked, and why AI referral traffic is harder to
see than it looks.

---

## Set expectations before instrumenting

Organic search responds over months, not weeks. Citation in generative answers is
slower still and, for most sites, is not directly observable at all. Any report
produced in the first six weeks measures construction, not results.

Say this out loud at the start. A team that expects a traffic curve in week two
concludes the work failed exactly when the pages are being indexed.

What is legitimately observable early:

- Indexing and coverage (pages known, pages excluded, and why)
- Impressions on the new page types, before clicks arrive
- Crawl activity from AI user agents in server logs
- Referrals from AI hosts, partially, with the caveats below

---

## Why AI referrals hide

**In-app browsers frequently send no referrer.** A tap inside a chat application
often opens a webview that arrives with nothing: no referrer, no campaign
parameter, nothing distinguishing it from someone typing the URL.

**Attribution windows are long.** Someone hears about you inside a conversation,
does not click, and searches your name three days later. That arrives as branded
organic search, and no amount of instrumentation attributes it to the assistant.

**Link behavior changes without notice.** In 2026 the largest assistant began
converting brand mentions into inline links to the brand's **home page**. Reported
effects were substantial: the share of assistant referral traffic landing on home
pages rose from roughly 4% to roughly 24%, with business software seeing the
largest gains and e-commerce essentially flat, because product intent routes
through a shopping surface rather than a brand mention.

Two consequences worth designing for:

1. **The home page becomes a cold-traffic landing page.** It is now receiving
   people who heard of you thirty seconds ago and know one sentence about you. If
   it was written for people who already know the product, it is now the wrong
   page.
2. **Product pages should not expect assistant referrals.** For those, the citable
   asset is the data, the methodology and the comparisons, not the feature page.

---

## First-touch attribution

Record where someone arrived from on their first visit, and attach it to the
account if one is created later.

### The three rules that make it work

**1. Only write when there is an external signal.**

Setting a cookie on every visit invalidates the CDN cache for your marketing
pages, which is a real performance cost paid on your highest-traffic pages. Write
only when a referrer from another host or a campaign parameter is present. A clean
arrival produces no `Set-Cookie`, so the cached response stays valid.

Verify this against a production build, not the dev server:

```sh
curl -sI https://example.com/ | grep -i set-cookie   # expect nothing
```

Then check that the pages were cacheable to begin with. On one property the
cookie discipline was correct and irrelevant: the marketing layout called the
session helper to decide what the navbar shows, the helper read cookies, and
every public page rendered per request with `Cache-Control: private, no-store`
and a CDN miss on every family. A session check in a shared layout makes the
whole marketing surface uncacheable, and no amount of care about `Set-Cookie`
gets it back. Read `cache-control` and the CDN's hit header from outside; if
they say private, move the session-dependent part into a client island or a
streamed slot so the shell can be cached.

```sh
curl -sI https://example.com/guides/example | grep -iE "cache-control|x-vercel-cache|cf-cache-status"
```

**2. Return null when there is no signal. Never invent "direct".**

This is the highest-leverage detail on this page.

An in-app browser arriving with no referrer is **missing information**, not a
direct visit. Labeling it "direct" fabricates a number and, worse, hides exactly
the channel you are trying to measure inside a bucket everyone ignores.

Count it as `unattributed` and let the gap be visible in the report. Ignorance
that is visible can be reasoned about; ignorance disguised as a category cannot.

```ts
if (campaign) return { source: fromCampaign(campaign), referrer };
if (referrer) return { source: fromHost(referrer), referrer };
return null; // no signal is not a source
```

A first version of this often includes a `direct` case that turns out to be dead
code, because nothing ever calls the classifier without a signal. Deleting it is
the right fix, not keeping it "for completeness".

**3. Never let attribution break signup.**

Wrap the write in error handling at the point of account creation. Analytics is
never worth a failed registration.

See `templates/next/first-touch.ts`.

### What to store

Four fields on the user record are enough:

| Field | Why |
| --- | --- |
| `acquisition_source` | The classified bucket |
| `acquisition_referrer` | The raw referrer, for reclassifying later |
| `acquisition_landing_path` | Which page received the cold arrival |
| `acquisition_at` | When the first touch happened |

Keeping the raw referrer matters: classification rules change as new assistants
and surfaces appear, and with the raw value you can reclassify history instead of
losing it.

**Ship the schema change with the code.** Capture code deployed without the
columns applied silently records nothing while looking fine, and the dashboard is
empty for reasons nobody remembers a month later. If the read path tolerates
missing columns so the page does not crash, that tolerance also removes the error
that would have told you.

---

## Search console

Configure it before the traffic, since most consoles only retain data from
verification onward. Beyond checking positions, the two views that matter:

- **Coverage or indexing:** which of the generated pages are known, which are
  excluded, and under what reason. This is where a sitemap gap or a canonical
  mistake becomes visible as a number.
- **Queries per page type,** not per URL. The question is whether the segment
  pages as a class are attracting the segment-shaped queries you built them for.
  Individual page rankings are noise at this stage.

Impressions before clicks is the normal, healthy sequence. Judge the first months
on impressions and average position, not on sessions.

**Practicalities of the export that bite on the first read:**

- The console's day boundary is Pacific time. A deploy in the evening of a
  market several hours ahead of it lands on a day that is half before and
  half after; exclude that day from both windows, or the deploy day
  contaminates whichever side it is counted on.
- A domain property mixes hosts. `www`, the bare apex that redirects to it,
  and any subdomain that is a separate site all arrive as rows of the same
  export. Split by host in the report: fold `www` and apex into one page,
  and keep the subdomain apart, or its pages land in "other" and inflate the
  denominator.
- The page export caps at a thousand rows. On a site with a few hundred
  generated pages, the tail is missing from the export, and a family that
  lives in the tail is under-counted. Export with a URL filter per family
  when the total exceeds the cap.
- The export does not carry its own period. Put the date range in the file
  name, and keep every export: the next read needs the previous one.
- The number format follows the console's locale (`1,2%` and `5,8` in one
  language, `1.2%` and `5.8` in another, sometimes both in one account).
  Parse both.

---

## Experiments on titles, descriptions and templates

A change to what the result shows (title, description) or to what the page
does (a tool above the fold, a gate removed) is an experiment, whether or not
it is called one. Treat it as one, or the read in a month will be an argument.

**The register.** One row per change that can move impressions, clicks or
position: deploy date and commit, the pages affected, the control, the
hypothesis in one sentence, the target metric, and the read date. It lives in
the repository next to the exports, not in a chat thread. Reverting a row must
be as small as the row: for a title experiment, an override map keyed by
canonical path with the variant, the experiment id and the start date, where
deleting the entry restores the original that still lives on the content
object. See `templates/next/seo-metadata.ts`.

**Arms as a module every surface reads.** Segment pages under test and their
controls are decided in one pure function, and the sitemap, `llms.txt`, the
twin routes and the pages themselves ask it rather than deciding on their own.
Otherwise the cohort's tool appears in the sitemap for a control page, or a
control page's twin advertises the treatment. Segments scheduled to publish
inside the window get their own arm, decided before they go live; see the
publication note in `references/pseo.md`.

**Baseline before the deploy, not after.** Two numbers, taken the day before:
the console export for the families under test (the day the change ships is
already contaminated), and conversions per click by landing path, from the
first-touch data described above, for the same window. A treatment that lifts
click-through and drops signups per click has moved the wrong people; without
the second number that reads as a win.

**The read.** Twenty-eight days after the deploy, the same export with the
new window, compared to the baseline by family and by arm, position weighted
by impressions. Report click-through per family, position per family (a title
that lifts clicks by dropping position has bought them), and conversions per
click. Then decide: extend the treatment to the control, or revert the rows.

**What one such read taught.** On a content and tooling property, guide pages
sat at roughly one percent click-through at an average position near six, and
the tool pages of the same segments at three to six percent at the same
position. The hypothesis that fit: informational queries are increasingly
answered on the results page itself, and the click that survives is for a page
that will *do* the thing. The treatment was a tool-shaped title ("How much to
charge for X? Free calculator") on a page that then did the calculation
without a login, with the gate moved to saving and exporting. Two cautions
came with it. The title has to describe what the page delivers to an
anonymous visitor: the production inventory found that the existing tool
blurred the very figure the new title promised, which would have been a
broken promise measured as a bounce. And the untouched guides are the
control; extending the treatment to them before the read leaves nothing to
compare against.

---

## Server logs for AI crawlers

The most direct evidence that the agent layer is being consumed. Filter access
logs by the user agents listed in `references/foundations.md` and look for:

- Whether they fetch at all, and how often
- Whether they fetch `.md` twins or only HTML
- Whether `llms.txt` and `llms-full.txt` are requested
- Which sections they concentrate on

This is one of the few places where the effect is observable in weeks rather than
months. It also catches the embarrassing failure directly: an agent requesting the
convention you documented and receiving 404s.

---

## More than one property

A data subdomain, a tools subdomain and the main site are one business to a
model and three sites to an analytics tool. Two decisions keep them measurable
as one:

- **Share the analytics property and the pixel** across subdomains. The
  first-party cookie lives on the root domain, so a session that starts on the
  data property and converts on the main site stays one session; filter by
  hostname inside the property instead of splitting it.
- **Cross-property links carry a campaign parameter and are followed.** A footer
  link from the data property to the product with `utm_source=<property>`
  attributes the referral on arrival, and leaving it followed (no `noreferrer`,
  no `nofollow`) passes the authority the data property earns. Treat the two
  properties as one entity in structured data too: the same organization `@id`
  on both. See `references/foundations.md`.

---

## Link signals from a badge

If you publish an embeddable badge (see `references/citable-data.md`), the
referring domains for the badge route are a clean, countable signal of adoption,
and each one is a real backlink. Log the route's referrers separately from the
site's, because a badge impression is not a visit and should not be counted as
one.

---

## A reporting frame that survives contact with reality

Three sections, in this order:

1. **What was built and verified.** Concrete, countable, checked against
   production rather than against the plan.
2. **What is observable so far.** Indexing, impressions, crawler behavior. Small
   numbers stated plainly.
3. **What is not yet knowable, and when it will be.** Naming this explicitly is
   what makes the first two sections credible.

The honest third section is what keeps a program funded through the months where
the second section is thin.
