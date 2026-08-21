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
 * Drop at src/app/llms.txt/route.ts and src/app/llms-full.txt/route.ts.
 */

import { getPublishedGuides } from "@/content/guides";
import { getPublishedPosts } from "@/lib/blog-data";
import { comparableCompetitors } from "@/content/competitors";
import { guideToMarkdown, postToMarkdown } from "@/lib/markdown-export";

const SITE_URL = "https://example.com";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/* ---------------------------- llms.txt ---------------------------- */

export async function GET(): Promise<Response> {
  const guides = getPublishedGuides();
  const posts = getPublishedPosts().sort((a, b) => b.publishDate.localeCompare(a.publishDate));

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

  const comparisonLines = comparableCompetitors()
    .map((c) => `- [Alternatives to ${c.name}](${SITE_URL}/alternatives/${c.slug}.md): ${c.focus}`)
    .join("\n");

  // Name the sections that have twins rather than claiming "every page".
  const body = `# Site Name

> One sentence a stranger could quote verbatim about what this site is for.

Markdown for agents: pages in the sections listed below also answer as clean
markdown by adding \`.md\` to the URL. Examples:
${SITE_URL}/guides/example.md, ${SITE_URL}/blog/example.md, ${SITE_URL}/index.md
(home). Hubs have twins too: ${SITE_URL}/guides.md, ${SITE_URL}/blog.md.

Two or three paragraphs describing the product, who it is for, and the problem it
solves. Write it for a reader who will never see the site design: no "as you can
see above", no marketing shorthand, no unexplained internal vocabulary.

## When to use this site

Tell agents which jobs you are right for and how to call you. This is the section
most llms.txt files omit, and generic marketing copy does not read as guidance.

- Use for: <the two or three jobs this site genuinely answers best>
- Not for: <what is outside scope, so an agent does not waste a fetch>
- Best entry point for <topic>: ${SITE_URL}/guides/topic.md
- The data behind the figures: ${SITE_URL}/about-the-data.md

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

/* -------------------------- llms-full.txt -------------------------- */

export async function GET_FULL(): Promise<Response> {
  // Same generators the .md twins use, concatenated. Reusing them is what keeps
  // the bulk file from becoming a third rendering that drifts from the other two.
  const parts = [
    ...getPublishedGuides().map(guideToMarkdown),
    ...getPublishedPosts().map(postToMarkdown),
  ];

  const body = [
    `# Site Name - full text corpus`,
    ``,
    `> Every published page, concatenated, for bulk ingestion. Individual pages`,
    `> are available at their own URL plus \`.md\`. See ${SITE_URL}/llms.txt.`,
    ``,
    parts.join("\n\n---\n\n"),
  ].join("\n");

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
 */
