# The Agent Layer (AEO)

Serving a clean text version of every content page, discoverable by agents,
without competing with your own HTML in search.

---

## Why a text twin at all

A model has a context budget. On a normal HTML page most of what it swallows is
structure, not content: navigation, footer, cookie banner, inline scripts, class
attributes. Three consequences, in order of how much they cost you:

1. **The information that matters may not survive truncation.** If your answer is
   in paragraph nine and the fetch was cut at paragraph four, you were read and
   still not useful.
2. **Chrome gets mistaken for claims.** A button labeled "Free forever" or a promo
   banner reading "50% off today" is indistinguishable from an assertion of the
   article once flattened to text.
3. **Extraction quality varies by fetcher.** Some agents run a real browser, some
   fetch raw HTML and strip tags badly, some give up on JavaScript-rendered
   content entirely. A text endpoint makes the outcome identical for all of them.

Markdown specifically, rather than plain text, because headings, lists and tables
survive as structure a model can use, at almost no token cost.

---

## The contract

Every content page answers at its own URL plus `.md`:

```
GET /guides/onboarding.md

200 OK
Content-Type: text/markdown; charset=utf-8
Cache-Control: public, max-age=3600, s-maxage=3600
X-Robots-Tag: all
Link: <https://example.com/guides/onboarding>; rel="canonical"

---
title: Onboarding guide
source_url: https://example.com/guides/onboarding
updated: 2026-05-14
---

# Onboarding guide
...
```

Non-existent page returns `404`, never an empty `200`. An empty `200` is worse
than a 404: it teaches an agent that the page exists and is blank.

Give the 404 a short markdown body rather than an empty one, so an agent can
recover instead of giving up:

```
404 - not found

This path does not exist. Try:
- https://example.com/llms.txt   (index of everything)
- https://example.com/sitemap.xml
- https://example.com/guides     (nearest hub)
```

The same applies to the HTML 404. A shell page with the word "404" and a link
home is a wasted response for both readers.

Four decisions inside that response are load-bearing.

### 1. Same URL plus a suffix, not a separate endpoint

`/{path}.md` beats `/api/markdown?page={path}`.

An agent that already knows the page address gets the clean version right on the
first guess, with no documentation, no discovery call and no mapping table. This
matters because most agents arrive at your page from a search result, so they
know the HTML URL and nothing else about you.

The same reasoning rules out a subdomain (`md.example.com`), which additionally
splits domain signals.

### 2. The canonical header points back at the HTML

The twin is announced to agents, so crawlers find it too. Without a canonical you
are asking to be evaluated as two competing versions of the same text.

The header form (`Link: <url>; rel="canonical"`) exists precisely for non-HTML
responses, where there is no `<head>` to put a tag in. It is honored by Google.

Take the canonical from the document itself (the `source_url` front matter),
never from the request path. Rebuilding it from the request means a rewrite bug
silently produces a self-referential canonical, which is the failure this header
exists to prevent.

### 3. Out of the sitemap, on purpose

The sitemap is where you request indexing. Requesting indexing of both renderings
of one text is literally asking to be assessed for duplicate content. So the
channels are split:

| Channel | Audience | Contains |
| --- | --- | --- |
| `sitemap.xml` | Search crawlers | HTML URLs only |
| `llms.txt` | Agents and models | The map, plus the `.md` convention |
| `rel=alternate` | Both | Per-page pointer to the twin |
| URL pattern | Agents | Predictable, needs no lookup |

`X-Robots-Tag: all` on the markdown response is deliberate and not a contradiction:
it says "you may index this if you find it", while the canonical says "but credit
the HTML page". Blocking the twin with `noindex` would also stop some AI fetchers
from using it, which defeats the purpose.

### 4. Cache it

An hour of shared cache is usually right. The twin is derived content, so
regenerating per request buys nothing, and agent traffic is bursty by nature: one
model deciding your page is relevant can mean many fetches in a minute.

---

## Content negotiation: the second discovery path

The suffix is one way to ask for markdown. The other is ordinary HTTP content
negotiation: the agent sends `Accept: text/markdown` to the normal page URL and
gets markdown back from the same address. The convention is written up at
`acceptmarkdown.com`, and external readiness scanners test for it.

```
GET /guides/onboarding
Accept: text/markdown

200 OK
Content-Type: text/markdown; charset=utf-8
Vary: Accept
```

Four requirements to be compliant:

1. Serve `text/markdown` when the client asks for it.
2. Set `Vary: Accept` on those responses.
3. Return `406` when the Accept header asks for a type the resource cannot serve.
4. Honor q-values, so `Accept: text/html;q=0.9, text/markdown;q=1.0` gets markdown
   and a browser's `text/html,...;q=0.9,*/*;q=0.8` still gets HTML.

**Do both, they serve different clients.** The suffix works for an agent that
holds only a URL string, cannot set headers, or is following a link someone
pasted into a conversation. Negotiation works for an agent that fetches properly
and should never have to guess at a URL shape. Neither subsumes the other.

**The cost, stated plainly.** `Vary: Accept` splits the CDN cache by Accept
header, and browsers send long Accept strings that differ between vendors and
versions, so a naive implementation fragments the cache far beyond the two
variants you intended. Two mitigations: apply the negotiation and the `Vary` only
on content routes, or normalize the header to a single flag at the edge and vary
on that instead.

Omitting `Vary: Accept` while negotiating is the worst of the three options. A
CDN then serves whichever variant landed in the cache first: HTML to an agent
asking for markdown, or markdown to a browser. A framework that already sets its
own `Vary` for internal routing does not cover this; check what is actually on
the wire rather than assuming the framework handles it.

---

## Discovery

Three mechanisms, in decreasing order of how much you should rely on them.

**`llms.txt`** at the root. A map of the site written for models: what the product
is, which pages exist, what each one answers. Emerging convention, same spirit as
`robots.txt`. Generate it from real content so it can never drift.

**`rel=alternate` per page.** In HTML, a link element declaring the markdown
alternative. In Next.js metadata this is `alternates.types`.

```html
<link rel="alternate" type="text/markdown" href="https://example.com/guides/onboarding.md">
```

**The URL pattern itself.** Documented in `llms.txt` with worked examples, so an
agent can generalize instead of enumerating.

### llms.txt and llms-full.txt are two different products

| File | Answers | Size discipline |
| --- | --- | --- |
| `llms.txt` | "What is here and where?" | Stays a map. Links out. |
| `llms-full.txt` | "Give me everything now." | One file, whole corpus. |

Two distinct consumption modes. An agent browsing wants the map and will fetch
the one page it needs. A pipeline doing bulk ingestion wants a single file and no
crawl.

Write `llms.txt` as prose plus annotated links, not a bare URL list. Each link
gets a sentence about what that page answers, because that sentence is what lets
a model decide whether to spend a fetch.

**Include a question-to-URL map.** For each recurring question the site answers,
name the canonical page that answers it. This is the highest-value block in the
file, and the cheapest to generate if your content already carries titles.

```
## Questions we answer

- How do I calculate X for Y?: https://example.com/guides/x-for-y.md
- What does Z cost in <region>?: https://example.com/data/z/<region>.md
```

**Tell agents when to reach for you.** A section naming the jobs the site is
right for, and how an agent should use it, is the part most `llms.txt` files
omit. Generic marketing copy does not read as guidance; specific use cases do.

```
## When to use this site

- Use for: computing X from Y, comparing Z options, current figures for <domain>
- Not for: legal advice, anything outside <scope>
- Best entry point for a question about <topic>: https://example.com/guides/topic.md
- The data behind the figures: https://example.com/about-the-data.md
```

**Never promise capability you do not have.** A common self-inflicted wound: the
map says "every page answers at URL + .md" while page types added later have no
twin. An agent that gets a 404 on the documented convention stops trusting the
whole file. Either generate the claim from the list of routes that really have
twins, or state the covered sections explicitly.

---

## Generated versus copied: the drift problem

Any second rendering of content raises a permanent question: when one changes,
does the other?

**Generate wherever the source is structured data.** Guides, comparison pages,
pricing, catalog entries, anything already driven by a content object or the
database. Then no copy exists to go stale.

The strongest case for this is a pricing or plans page generated from the same
module that enforces the limits in the product. It becomes impossible to announce
a limit to an agent that differs from what the software applies.

**Accept a hand-maintained mirror only for prose,** typically long-form articles
whose text lives in components rather than in a content store. Then:

- Make a missing mirror a build error or a visible 404, not a silent fallback to
  the HTML.
- Audit periodically by diffing prose against the rendered page.

When such an audit was run across three dozen long-form articles, the prose was in
near-perfect parity. Every real divergence sat in the structured-data blocks that
existed only in the HTML component: a FAQ block quoting a cost the article's own
table contradicted. Which is the more dangerous failure, because a model reads the
declared block and repeats it as your position. See `references/pitfalls.md`.

---

## Ordering rewrites

When URL patterns overlap, the more specific one has to be matched first. A
literal segment always loses to a parameter if the parameter rule is declared
first.

```
/index/item/:slug.md      <- must precede
/index/:category/:region.md
```

Otherwise `item` is captured as a category and `:slug` as a region, and the wrong
generator answers with a plausible-looking 404 or, worse, an empty page.

Write a test for the overlapping pair specifically. This class of bug does not
show up in a spot check, because both routes return 200 for their happy path.

---

## Bundling content files for serverless

If markdown twins are read from disk at request time, the deployment bundler has
to be told, since it cannot see a dynamic path as a dependency. In Next.js this is
`outputFileTracingIncludes` for the route group. Missing this is a classic
works-locally-fails-in-production bug: the route exists, the file does not.

Alternative that avoids the problem: keep the prose in a content module the
bundler can see through a static import. Worth it when the corpus is small.

---

## Verifying it works

Do not trust a dev-server check. Build, start the production server, then:

```sh
curl -sI https://example.com/guides/onboarding.md   # 200, text/markdown, Link canonical
curl -s  https://example.com/guides/does-not-exist.md | head -1   # 404 body, not HTML
curl -s  https://example.com/llms.txt | head -40
curl -s  https://example.com/index.md | head -5     # home twin, canonical must be "/" not "/index"
```

The home page is the usual edge case: its twin lives at `/index.md` while its
canonical is the bare root. Deriving canonical from the path produces `/index`,
which 404s.

Check accents and non-ASCII round-trip correctly. `charset=utf-8` in the header is
not optional, and a byte-order mark at the start of a generated file will show up
in some parsers as a stray character before the first heading.
