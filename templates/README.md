# Templates

Working code, not pseudocode. Each file states the framework-neutral contract it
implements at the top, so it can be read without the skill loaded, and ends with
a porting note.

## Layout

```
next/       Next.js App Router, TypeScript. The reference implementation.
generic/    The same contract as raw HTTP, plus one plain-Node implementation.
```

If your stack is not Next.js, start with `generic/contract.http`. It states the
observable behavior each endpoint must have, which is the part that actually
matters. `generic/express-md-route.js` shows that the agent layer is about a
hundred lines of routing and headers, not a platform feature.

## What each file is for

| File | Implements |
| --- | --- |
| `next/markdown-response.ts` | The shared HTTP wrapper for every `.md` twin, plus front matter |
| `next/md-route.ts` | A twin route, in both the generated and file-backed shapes |
| `next/rewrites.ts` | The twin registry, and the rewrites, negotiation and `rel=alternate` that read it |
| `next/page-metadata.ts` | A page consuming the metadata module: canonical, alternate, social image |
| `next/seo-metadata.ts` | One source for title, description and OG; per-family suffix policy; experiment overrides; the length ratchet test |
| `next/sitemap.ts` | Sitemap generated from the content registry, with honest `lastmod` |
| `next/sitemap-sharded.ts` | Index plus shards, for corpora past the 50k cap |
| `next/robots.ts` | Crawl rules with AI agents explicitly allowed |
| `next/llms-txt.ts` | `llms.txt` and `llms-full.txt`, generated from live content |
| `next/dataset-jsonld.ts` | `Dataset` markup and the shared organization `@id` |
| `next/index-basket.ts` | Fixed basket and the aggregation guards behind a published figure |
| `next/first-touch.ts` | Attribution that survives AI referrals without breaking caching |
| `generic/contract.http` | Every endpoint as request and expected response |
| `generic/express-md-route.js` | The agent layer in plain Node |
| `generic/content-review.js` | Editorial content fingerprinted with its code dependencies, checked in CI |

## Adapting

- Replace `SITE_URL` with the canonical host, including the `www` decision.
- Replace the example content sources (`getGuide`, `getPublishedPosts`,
  `comparableCompetitors`, `editorialEntries`) with the project's real ones. Never ship a template's
  placeholder data.
- Keep comments that explain a constraint. Drop comments that narrate the
  template. The test: would the next reader rediscover this the hard way?
- The example types are minimal on purpose. Use the project's own.

## Verifying

Every template ends with a verification block. Run those against a production
build, not a dev server: caching behavior, bundling of content files and font
loading in image routes all differ, and all three produce failures that are
invisible locally.
