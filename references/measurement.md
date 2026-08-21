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
