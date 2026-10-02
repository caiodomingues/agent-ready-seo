# Verification

How to check the work, in four loops: static checks that run in CI before
anything deploys, your own assertions against production, an external scorer,
and the slow signals that only appear over months.

The rule underneath all of it: **verify against the deployed site, not against the
code**. Most findings live in the gap between what the repository says and what
is served. Loop 0 exists because a few of those gaps are cheaper to close before
the deploy than to discover after it.

---

## Loop 0: static checks in CI

These run on every push, take seconds, and each one was written after the
failure it catches had shipped. None of them replaces Loop 1; they stop the
regressions that Loop 1 would only find on the next manual pass.

**Twin parity.** For every editorial page: the page file, the markdown source
and the registry entry exist together (one missing means a 404 twin, a
sitemap entry for nothing, or an orphan file). The first line of the markdown
is `# ` plus the title the metadata declares. Every section the page renders
(lead, body, FAQ) is non-empty in the source, and the number of questions in
the source equals the number the FAQ block renders, because a question lost in
parsing is a JSON-LD block that no longer matches the page.

**Every registered twin has a handler.** Walk the twin registry and assert the
route file exists for each `api` path. A registry entry without a handler is a
rewrite to a 404, live, announced in `llms.txt`.

**Stale-claim sweep.** A short list of regular expressions for figures that
have been retired (an old price, an old dataset count, an old plan limit),
run across content, pages and generated copy. It fails the build when one
comes back. On one property the sweep was added after the same retired count
resurfaced twice from copy-paste; it has caught a third since.

**Rendered metadata within budget.** The ratchet test in
`templates/next/seo-metadata.ts`: every page's rendered title and description
against the limit, a legacy list that can only shrink, no two paths sharing a
title.

**Editorial review manifest.** Content whose facts depend on code (a pricing
formula, plan limits, the dataset figures) is fingerprinted together with the
files it depends on; the check fails when either changed without a recorded
review, and warns when a periodic review is overdue. See
`templates/generic/content-review.js` and `references/foundations.md`.

**Forbidden identifiers in the build output,** where a legal constraint hides
something (retailer names on a pseudonymized index): scan everything under the
public output directory for the identifiers, with the context of each hit
checked, since common words collide. See `references/schema-catalog.md`.

Wire them as separate scripts (`check:md`, `check:content`, `check:seo`) so a
failure names the discipline that broke, and run them before the build step,
not after: a build is the expensive part.

---

## Loop 1: your own checks

Every template in this skill ends with a verification block. Consolidated, the
pass looks like this. Run it against a production build; a dev server hides
caching, bundling and font-loading failures that only appear once deployed.

```sh
SITE=https://example.com

# Agent layer
curl -sI  $SITE/guides/onboarding.md | grep -iE "^HTTP|content-type|^link"
curl -s   $SITE/guides/does-not-exist.md | head -1        # 404 body, not HTML
curl -s   $SITE/index.md | grep source_url                # canonical is "/", not "/index"
curl -s -o /dev/null -w '%{http_code}\n' -H "Accept: text/markdown" $SITE/guides/onboarding      # 200 markdown
curl -s -o /dev/null -w '%{http_code}\n' -H "Accept: text/markdown" $SITE/guides/onboarding.md   # 200, not renegotiated
curl -s -o /dev/null -w '%{http_code}\n' -H "Accept: application/json" $SITE/guides/onboarding   # 406

# Soft-404 on the whole domain, not just the twin. A gated app's auth
# middleware is the usual culprit: 307 to /login, which answers 200.
curl -s -o /dev/null -w '%{http_code}\n' $SITE/definitely-not-a-page              # 404
curl -s -o /dev/null -w '%{http_code}\n' -H "Accept: text/html" $SITE/definitely-not-a-page   # 404, HTML body

# Every URL the map advertises must exist
curl -s $SITE/llms.txt | grep -oE "https://[^ )]+\.md" | sort -u \
  | while read u; do echo "$(curl -s -o /dev/null -w '%{http_code}' "$u") $u"; done \
  | grep -v "^200" || echo "all advertised twins resolve"

# Sitemap: HTML only, count matches the registry
curl -s $SITE/sitemap.xml | grep -c "<loc>"
curl -s $SITE/sitemap.xml | grep -c "\.md</loc>"          # expect 0

# Crawl rules, including the image route under a blocked prefix
curl -s  $SITE/robots.txt
curl -sI $SITE/api/og?title=test | head -1                 # expect 200
curl -sI -A "ChatGPT-User" $SITE/ | head -1                # edge rules can block by UA

# Caching survives attribution, and existed in the first place
curl -sI $SITE/ | grep -i set-cookie                       # expect nothing
curl -sI $SITE/guides/onboarding | grep -iE "cache-control|x-vercel-cache|cf-cache-status"
                                                           # public + HIT, not private/no-store
```

Two checks worth automating because they regress silently: the advertised-twin
loop above, and the sitemap count against the number of published entries in the
content registry. Both fail quietly and stay broken for months.

### The inventory crawl

Before any change to titles, templates or page families, and again on the day
an experiment is read, take an inventory of production with a script rather
than by hand, so the two snapshots were taken the same way. One representative
URL per family plus every instance of the families under test. For each:

| Field | Why |
| --- | --- |
| status and `location` | A family that quietly redirects is not the family you think you are measuring |
| `<title>`, description, canonical, robots meta | The rendered values, which is what the engine reads |
| H1 and the H2 list | Whether the outline matches the title's promise |
| JSON-LD types present | Which pages declare nothing |
| A marker for the tool | Some string only the interactive component renders, so the crawl knows the page *has* the tool, not just a link to one |
| text overlap between twin pages | Sentences of forty-plus characters shared by two pages that target the same segment |
| `cache-control` and the CDN hit header | Whether the page is cacheable at all |

Keep it in plain Node with no imports from the application, because it runs
against production, and version the JSON output next to the experiment
register. On one property the first inventory found, in an afternoon, five
things the code review had not: every rendered title over the limit, no public
page cacheable, two routes rendering the same rows, a tool page whose headline
promised a figure the component blurred behind a login, and a redirect status
the internal docs had wrong. Each one changed the plan before the first
experiment shipped.

---

## Loop 2: an external scorer

A third-party score is useful for one specific reason: it checks things you did
not think to check, using a fetcher that is not yours.

### Is Agentic

Operated by Vercel at `is-agentic.com`, scanning engine by Ora. Scores how
readily an agent can discover, access, understand and use a public site.

**Structure.** Checks are grouped by maturity: essential checks share an
80-point pool, recommended checks share 20, and emerging signals add a few
bonus points. Checks that do not apply to a site are excluded rather than
counted against it, and conditional groups (API, OAuth, MCP, GraphQL) activate
only when that surface is detected. The grouping has changed before and will
again, which is one more reason to record check IDs rather than totals.

**The same engine, two views, two very different numbers.** Ora also publishes
its own report for a domain (`ora.ai/score/<domain>`), built from the same
checks but organized as about ten questions: can an agent discover you, does
it welcome agents, does it understand you, can it integrate, is the
integration well built, can it use you in production, authenticate, transact,
act through you, and operate the site directly. Each question gets its own
score, and the questions about integration, production use, authentication and
acting through the site count API, MCP, OAuth and WebMCP checks whether or not
the site has any reason to offer them. A content site that follows this skill
scored near the top on the applicability-weighted report and near zero on
several of those questions in the same week. Neither number is wrong; they
answer different questions. Read the per-question view to find checks, and
track the applicability-weighted one over time.

**Three ways in, all public and read-only:**

```sh
# CLI: returns a stored report, or starts a scan if none exists
npx is-agentic example.com
npx is-agentic example.com --json          # for CI

# API: retrieval only, never starts a scan. RFC 9457 problem+json errors.
# 404 with code "report_not_found" means nobody has scanned it yet.
curl -s "https://is-agentic.com/api/v1/report?url=https%3A%2F%2Fexample.com"

# MCP: streamable HTTP, no auth, three read-only tools
#   is_agentic_get_report / is_agentic_get_methodology / is_agentic_get_developer_docs
claude mcp add --transport http is-agentic https://is-agentic.com/mcp
```

Results are cached for about six hours, so a rescan right after a deploy may
return the previous result.

**Checks worth knowing about before you are scored on them.** A scan surfaces
conventions you may not have met yet. Three that this skill covers because a real
report flagged them:

- `Accept: text/markdown` negotiation with `Vary: Accept`, separate from the
  `.md` suffix. See `references/agent-layer.md`.
- A 404 body an agent can recover from, rather than a bare status or an app shell.
- A "when to use this" section in `llms.txt`, naming the jobs the site is right
  for. See `references/agent-layer.md`.

Three more that a report on a gated SaaS failed, none of which read as SEO work
until a scanner asks for them:

- **A real 404 for unknown paths.** The default-deny auth middleware answered
  every probe with a redirect to a 200 login page. See `references/pitfalls.md`
  and `templates/next/gated-app-404.ts`.
- **Trust anchors.** Public `/about` and `/contact` pages with real content, and
  an `Organization` with `contactPoint` and, where one is public, `address`.
  These are what an agent checks before recommending a business. See
  `references/foundations.md`.
- **Brand-name discoverability.** A search for the bare brand returning the
  domain. Not fixable in code when the name is a common word; record it as a
  known failure rather than chasing it.

And four from a later report on a content site that already passed the above:

- **The 404 for an unknown path, negotiated.** The suffixed twin answered a
  markdown 404, but `/nothing-here` with `Accept: text/markdown` still got the
  HTML 404 page. Partial credit. See `references/agent-layer.md`.
- **`llms.txt` size.** A map that had grown a glossary and a full FAQ crossed
  the scanner's threshold of about 30,000 characters.
- **A privacy page** alongside about and contact. See
  `references/foundations.md`.
- **`Link` headers with agent-relevant relations** on the HTML response. The
  host's own preload `Link` was there; `alternate` to the twin was not.

### Known disagreements with scanners

Findings that look actionable and are not, or not yet. Record them next to the
check ID so the next audit does not reopen them.

- **A section present but scored absent.** A "when to use this site" section
  that named real jobs, entry points and exclusions, near the top of the map,
  scored zero on the when-to-use check. The section was written in the site's
  language, not in English; whether the check matches the heading text, the
  language, or something else is unconfirmed. Do not rewrite a good section to
  chase it; if the user wants to test it, an English heading beside the native
  one is a cheap experiment, run as one.
- **A check contradicting another in the same report.** One check credited the
  `Organization` with an address while another listed address as missing.
  Read the evidence lines, not the verdicts.
- **A developer portal found at `/dashboard`.** A logged-in app area matched a
  path probe. It is a false positive, and it inflates the integration score.
- **`sameAs` and Wikidata.** Scored as missing; the skill leaves `sameAs` out
  when there is no account that is the organization, and creating a Wikidata
  item is the user's call. See the decisions table in SKILL.md.
- **A dedicated agent view (`?mode=agent`), user-agent-based markdown, and the
  product layers.** Not gaps for a content site. See the decisions table.

### Reading a score honestly

- **The evidence is the product, not the number.** The failed and partial
  findings tell you what to fix; the score is a summary for a slide.
- **A score can move without you changing anything,** because the methodology
  changed or a time-sensitive check answered differently. Record the check IDs
  that failed, not just the total, or you cannot tell those cases apart.
- **It is not a certification** of security, accessibility, quality or
  compliance, and automated checks produce false positives.
- **Do not optimize the number.** Every check that is worth passing is worth
  passing for its own reason. A site tuned to a scorer is tuned to one fetcher's
  opinion, which is the same mistake as writing for one search algorithm.

### What this skill does and does not cover

Mapping the per-question view onto this skill, honestly:

| Question | Covered here |
| --- | --- |
| Discover and trust you | Mostly. `foundations.md`, `pseo.md`, `citable-data.md`. Registries, SDK packages and a Wikidata item are outside it |
| Welcome agents | Yes. `foundations.md` (robots), `agent-layer.md` (404s, negotiation) |
| Understand who you are | Yes. `agent-layer.md`, `schema-catalog.md`, `foundations.md` (trust anchors) |
| Operate the website directly | Mostly. `agent-layer.md` for reading; WebMCP is a decision for the free tool only (SKILL.md) |
| Transact | Partly. Public pricing and `pricing.md`; agent payment protocols are not |
| Integrate, integration quality, production use, authenticate, act through an agent | **No.** An API, OpenAPI, an MCP server, OAuth, an SDK, generative UI: making the product operable by an agent |

So a site that follows this skill completely will still not score full marks, and
that is expected rather than a gap to paper over. The last row is a different
discipline: making the **product** operable by an agent, not making the
**content** legible to one. If a report's biggest losses are there, this skill is
the wrong tool for that part of the work, and whether to start that work is the
user's decision.

---

## Loop 3: wiring it into CI

Worth doing, with limits.

```sh
# Nightly or weekly, not per commit. Scans are cached and are not free.
npx is-agentic "$SITE" --json > report.json

jq '{score: .score, failed: [.issues[] | select(.status != "pass") | .id]}' report.json
```

Then compare against the previous run and alert on:

- the score dropping by more than a few points
- any check moving from pass to fail
- a check that previously applied becoming not-applicable, which usually means a
  surface stopped being detected rather than stopped existing

**Do not gate deploys on a third-party score.** An outage, a methodology change
or a rate limit would then block shipping for reasons unrelated to the change
under review. Alert, do not block.

The public API is rate limited (roughly 120 requests per IP per minute) and does
not launch scans, so a monitoring job should use the CLI to produce a report and
the API only to retrieve it afterwards.

---

## Loop 3b: the checks nobody else will run for you

An external scorer sees a fetch. It does not see whether what you published is
true. These stay manual:

- **Declared claims against visible claims.** Structured data that contradicts
  the page passes every validator. See `references/schema-catalog.md`.
- **Two instances of a template, diffed.** If only proper nouns changed, the
  template is thin. See `references/pseo.md`.
- **Quantitative claims about your own data.** They age silently while the data
  grows. Re-verify on a schedule and sweep every surface at once.
- **A twin against its page.** Where a hand-maintained mirror exists, diff the
  prose periodically.

---

## Loop 4: the slow signals

Months, not weeks. See `references/measurement.md` for the detail.

- **Indexing and coverage** in a search console: which generated pages are known,
  which are excluded, and why. This is where a sitemap gap becomes a number.
- **Impressions before clicks.** The normal, healthy sequence. Judge the first
  months on impressions and average position.
- **Server logs filtered by AI user agents.** The most direct evidence the agent
  layer is being consumed, and the fastest of the slow signals. It also catches
  the embarrassing failure directly: an agent requesting the convention you
  documented and receiving 404s.
- **Referring domains on a badge route,** if you publish one.
