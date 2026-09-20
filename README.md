# agent-ready-seo

A [Claude Code](https://claude.com/claude-code) skill for making a site readable
and citable by AI answer engines as well as search crawlers.

Optimizing for search used to have one reader. It now has three:

| Discipline | Reader | Success |
| --- | --- | --- |
| **SEO** | The crawler that builds an index | Position and click |
| **AEO** | The agent that fetches and summarizes | Read in full, without noise |
| **GEO** | The model composing an answer | Being the cited source |

Most sites are built for the first only. This skill covers the other two without
breaking the first, from one content source rather than three codebases.

## What is inside

```
SKILL.md                 the router: which layer, in what order, what is non-negotiable
references/
  agent-layer.md         the .md twin, llms.txt, canonical stitching, drift
  citable-data.md        fixed baskets, methodology, Dataset markup, free vs paid
  pseo.md                pages at scale, coverage floors, thin content, sharded sitemaps
  foundations.md         canonical host, sitemap, robots, rendered titles, entities, review cadence
  schema-catalog.md      which structured data type per page type, and the traps
  measurement.md         first-touch attribution, why AI referrals hide, title experiments
  pitfalls.md            failure catalog and a full audit checklist
  verification.md        static CI checks, production checks, external scorers
templates/
  next/                  working Next.js App Router implementations
  generic/               the same contract as raw HTTP, plus plain Node
```

## Install

```sh
npx skills add caiodomingues/agent-ready-seo
```

That works for Claude Code, Cursor, Codex, Copilot and the other agents the
[skills CLI](https://skills.sh) supports: it detects which ones you have and
puts the files where each expects them.

It installs into the current project by default, which is what you want when the
team should get the skill from the repository. Add `-g` to install it once for
every project instead:

```sh
npx skills add caiodomingues/agent-ready-seo -g
```

Project installs leave `.agents/skills/`, an agent-specific symlink and a
`skills-lock.json` in the working tree, so either commit them on purpose or add
them to `.gitignore`.

<details>
<summary>Manual install, without the CLI</summary>

Claude Code loads skills from `~/.claude/skills/`. Clone and link:

```sh
git clone https://github.com/caiodomingues/agent-ready-seo.git
ln -s "$(pwd)/agent-ready-seo" ~/.claude/skills/agent-ready-seo
```

On Windows, use a directory junction instead of a symlink:

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\agent-ready-seo" -Target "C:\path\to\agent-ready-seo"
```

To scope it to one project rather than your whole machine, put it under that
project's `.claude/skills/` directory.

</details>

The skill triggers on its own when a task involves AEO, GEO, `llms.txt`,
structured data, programmatic pages, or AI referral attribution. You can also
invoke it directly.

## The short version

If you read nothing else:

- **A generative engine cites numbers, dates, sources and methods.** It does not
  cite restated common knowledge. Without proprietary data, GEO is not available
  to you yet.
- **Serve a clean text twin at the page's own URL plus `.md`,** with a canonical
  header pointing back at the HTML, and keep it out of the sitemap. Discovery
  happens through `llms.txt`, `rel=alternate` and a predictable URL pattern.
- **Generate, do not copy.** Any second rendering must derive from the same
  source as the page, or it drifts.
- **Structured data that contradicts the page is worse than none.** A model reads
  the declared block and repeats it in your name.
- **A page must answer something only you can answer.** That single test is what
  separates programmatic SEO from doorway pages.
- **Publish the aggregate, gate the live.** Dated snapshots and methodology get
  cited; current, personalized data is what people pay for.

## Scope

**In scope:** publishing and serving. The agent layer, citable datasets,
programmatic pages, technical foundations, structured data, attribution.

**Out of scope:** acquiring the data in the first place. Collection, licensing
and normalization are a separate discipline with their own legal and ethical
constraints. This skill assumes the data exists and is yours to publish.

**Also out of scope:** making the product itself agent-operable (authentication an
agent can complete, controls it can drive, an API or MCP server for your product,
machine-payable checkout). External readiness scorers weight those heavily, so
following this skill completely will not produce a perfect score. See
`references/verification.md` for the mapping.

## Provenance

Extracted from shipping three production properties: a content and tooling site
with roughly 400 pages in its sitemap, a data property with roughly 53,000, and
a gated SaaS whose only public surface is a landing page and a blog. Every rule
here has a failure behind it that was hit and fixed, not a best practice copied
from a list. Examples are anonymized, and the counts are re-read from the live
sitemaps when this file changes, for the reason `references/pitfalls.md` gives
about claims that age.

## Contributing

Issues and pull requests welcome, particularly:

- Implementations of `generic/contract.http` in other stacks
- Corrections where an AI crawler's documented behavior has changed
- Failure modes worth adding to `references/pitfalls.md`, with the symptom that
  revealed them

Keep the format: state the contract, then the implementation, then why. A rule
without its failure is not worth carrying.

## License

MIT. See [LICENSE](./LICENSE).
