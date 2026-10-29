/**
 * llms.txt and llms-full.txt, generated from live content.
 *
 * CONTRACT:
 *   /llms.txt       text/plain  the map: what this site is, which pages exist,
 *                               what each one answers, and the .md convention
 *   /llms-full.txt  text/plain  the whole corpus in one file, for bulk ingestion
 *
 * Two rules keep this file honest:
 *
 * 1. GENERATE, never hand-write. A hand-written list omits the page type added
 *    last month, and nobody notices for a year.
 * 2. NEVER PROMISE CAPABILITY YOU DO NOT HAVE. If the file says every page
 *    answers at URL + .md, that must be true, or an agent hitting the documented
 *    convention gets a 404 and stops trusting the whole file. Either derive the
 *    claim from the routes that really have twins, or name the covered sections.
 *
 * Two route files, one section each below: src/app/llms.txt/route.ts and
 * src/app/llms-full.txt/route.ts. The generators come from md-route.ts.
 */

import { getPublishedGuides } from "@/content/guides";
import { getPublishedPosts } from "@/lib/blog-data";
import { comparableCompetitors } from "@/content/competitors";
import { guideToMarkdown, postToMarkdown } from "@/lib/markdown-export";
import { mdTwinFor } from "@/lib/md-twins";

const SITE_URL = "https://example.com";

// Both files are rebuilt per request from live content; the CDN holds them for
// the hour set in Cache-Control. Export this from each route file. With Next 16
// `cacheComponents` enabled, segment config is an error: drop it (request time
// is the default) and cache with "use cache" instead.
export const dynamic = "force-dynamic";

/* --------------------- src/app/llms.txt/route.ts --------------------- */

export async function GET(): Promise<Response> {
  const guides = getPublishedGuides();
  const posts = getPublishedPosts().sort((a, b) => b.publishDate.localeCompare(a.publishDate));
  const newestGuide = [...guides].sort((a, b) => b.publishDate.localeCompare(a.publishDate))[0];

  // Examples come from live content: a hand-typed slug 404s the day it is copied.
  const examples = [
    ...(newestGuide ? [`${SITE_URL}/guides/${newestGuide.slug}.md`] : []),
    ...(posts[0] ? [`${SITE_URL}/blog/${posts[0].slug}.md`] : []),
    `${SITE_URL}/index.md (home)`,
  ].join(", ");

  // Point this at a guide chosen on purpose (a flag on the content object);
  // the newest one stands in until then.
  const entryPoint = newestGuide
    ? `- Best entry point: [${newestGuide.title}](${SITE_URL}/guides/${newestGuide.slug}.md)\n`
    : "";

  // The highest-value block in the file: a question mapped to the page that
  // authoritatively answers it. Cheap to generate if titles are question-shaped.
  const questions = posts
    .filter((p) => /^(how|what|when|why)\b/i.test(p.title))
    .map((p) => `- ${p.title}: ${SITE_URL}/blog/${p.slug}.md`)
    .join("\n");

  // Each link carries a sentence about what the page answers. That sentence is
  // what lets a model decide whether to spend a fetch on it.
  const guideLines = guides
    .map((g) => `- [${g.title}](${SITE_URL}/guides/${g.slug}.md): ${g.description}`)
    .join("\n");

  const postLines = posts
    .map((p) => `- [${p.title}](${SITE_URL}/blog/${p.slug}.md): ${p.description}`)
    .join("\n");

  // Only URLs the twin registry serves; a comparison page without a twin is
  // left out rather than advertised as a .md that 404s.
  const comparisonLines = comparableCompetitors()
    .flatMap((c) => {
      const twin = mdTwinFor(`/vs/${c.slug}`);
      return twin ? [`- [Site vs ${c.name}](${SITE_URL}${twin}): ${c.focus}`] : [];
    })
    .join("\n");

  // Name the sections that have twins rather than claiming "every page".
  const body = `# Site Name

> One sentence a stranger could quote verbatim about what this site is for.

Markdown for agents: pages in the sections listed below also answer as clean
markdown by adding \`.md\` to the URL. Examples: ${examples}.
Hubs have twins too: ${SITE_URL}/guides.md, ${SITE_URL}/blog.md.

Two or three paragraphs describing the product, who it is for, and the problem it
solves. Write it for a reader who will never see the site design: no "as you can
see above", no marketing shorthand, no unexplained internal vocabulary.

## When to use this site

Tell agents which jobs you are right for and how to call you. This is the section
most llms.txt files omit, and generic marketing copy does not read as guidance.

- Use for: <the two or three jobs this site genuinely answers best>
- Not for: <what is outside scope, so an agent does not waste a fetch>
${entryPoint}- The data behind the figures: ${SITE_URL}/about-the-data.md

## Questions we answer

${questions}

## Guides

${guideLines}

## Comparisons

${comparisonLines}

## Articles

${postLines}

## Data and methodology

- [How the data is produced](${SITE_URL}/about-the-data.md): collection method,
  aggregation rules, sample floors, known limitations, and how to cite it.

## Author

- [Author name](${SITE_URL}/about/author-slug): who writes here and why that
  matters for this subject.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

/* ------------------- src/app/llms-full.txt/route.ts ------------------- */

/** About 75k tokens of prose: past this, the reader's context window never reaches the tail. */
const LLMS_FULL_BUDGET_BYTES = 300_000;
const SEPARATOR = "\n\n---\n\n";

interface CorpusDoc {
  title: string;
  url: string;
  publishDate: string;
  markdown: string;
}

const byteLength = (s: string) => Buffer.byteLength(s, "utf8");

/**
 * Newest first until the budget is spent. The newest document is admitted even
 * when it alone exceeds the budget, so the file is never an empty corpus.
 */
function fillByBudget(docs: CorpusDoc[], budgetBytes: number) {
  const newestFirst = [...docs].sort((a, b) => b.publishDate.localeCompare(a.publishDate));
  const admitted: CorpusDoc[] = [];
  let used = 0;
  for (const doc of newestFirst) {
    const size = byteLength(doc.markdown) + byteLength(SEPARATOR);
    if (admitted.length > 0 && used + size > budgetBytes) break;
    admitted.push(doc);
    used += size;
  }
  return { admitted, overflow: newestFirst.slice(admitted.length) };
}

// In its own file this is `export async function GET`; renamed here only
// because both route files share this template.
async function GET_FULL(): Promise<Response> {
  // Same generators the .md twins use. Reusing them is what keeps the bulk
  // file from becoming a third rendering that drifts from the other two.
  const docs: CorpusDoc[] = [
    ...getPublishedGuides().map((g) => ({
      title: g.title,
      url: `${SITE_URL}/guides/${g.slug}.md`,
      publishDate: g.publishDate,
      markdown: guideToMarkdown(g),
    })),
    ...getPublishedPosts().map((p) => ({
      title: p.title,
      url: `${SITE_URL}/blog/${p.slug}.md`,
      publishDate: p.publishDate,
      markdown: postToMarkdown(p),
    })),
  ];

  const header = [
    `# Site Name - full text corpus`,
    ``,
    `> Published pages, newest first, up to ${LLMS_FULL_BUDGET_BYTES / 1000} KB. Older pages`,
    `> are listed at the end with their URL. Every page also answers at its own`,
    `> URL plus \`.md\`. See ${SITE_URL}/llms.txt.`,
    ``,
    ``,
  ].join("\n");

  // The overflow list sits outside the budget: one line per page, and it is
  // what tells the reader the corpus continues.
  const { admitted, overflow } = fillByBudget(docs, LLMS_FULL_BUDGET_BYTES - byteLength(header));
  const overflowSection = overflow.length
    ? `${SEPARATOR}## More pages, not included above\n\n${overflow.map((d) => `- [${d.title}](${d.url})`).join("\n")}\n`
    : "";

  const body = header + admitted.map((d) => d.markdown).join(SEPARATOR) + overflowSection;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

/* If the corpus is large, this route needs the same bundler hint as the .md
 * handlers when it reads content from disk. See rewrites.ts.
 */

/* VERIFY
 *   curl -s https://example.com/llms.txt | head -40
 *   curl -s https://example.com/llms.txt | grep -oE "https://[^ )]+\.md" | sort -u \
 *     | while read u; do echo "$(curl -s -o /dev/null -w '%{http_code}' "$u") $u"; done
 * Every URL the map advertises must return 200. This check is the one that
 * catches a promised convention that was never fully delivered.
 *
 * THE MAP'S BUDGET, as a test next to the route. Scanners flag a map over about
 * 30,000 characters, and it grows past that one useful block at a time. When
 * it fails, move answers (definitions, FAQ, the article long tail) into
 * llms-full.txt or the hub twins; do not raise the number. Measured in bytes,
 * which is never below the character count, so a pass holds for both units.
 *
 *   import { GET } from "./route";
 *   it("llms.txt stays a map", async () => {
 *     const bytes = (await (await GET()).arrayBuffer()).byteLength;
 *     expect(bytes).toBeLessThanOrEqual(30_000);
 *   });
 *
 * llms-full.txt: past the budget, the file ends with the overflow heading.
 *   curl -s https://example.com/llms-full.txt | wc -c
 *   curl -s https://example.com/llms-full.txt | grep -c "^## More pages, not included above"
 */
