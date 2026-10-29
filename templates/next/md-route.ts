/**
 * A `.md` twin route handler, in the two shapes you need: one generated from
 * structured content, one reading a hand-maintained mirror from disk.
 *
 * Two files (Next.js App Router):
 *   src/lib/markdown-export.ts              <- the generators; llms-full.txt imports them too
 *   src/app/api/md/guides/[slug]/route.ts   <- reached via the rewrite in rewrites.ts
 *
 * The generators live in a lib module because a route file may export only
 * HTTP methods and segment config, and because the twin and llms-full.txt
 * must render through the same function or they drift.
 *
 * Prefer the generated shape. A generated twin cannot drift from the page,
 * because both render from the same source. Use the file-backed shape only for
 * long-form prose whose text lives in components, and treat the missing-file
 * case as a 404 rather than a silent fallback.
 */

/* --------------------- src/lib/markdown-export.ts --------------------- */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { frontMatter } from "@/lib/markdown-response";
import { getPublishedGuides } from "@/content/guides";

const SITE_URL = "https://example.com";

/* Shape A: generated from the same content object the page renders */

export function guideToMarkdown(guide: Guide): string {
  const url = `${SITE_URL}/guides/${guide.slug}`;

  return (
    frontMatter({
      title: guide.title,
      sourceUrl: url,
      updated: guide.updatedAt ?? guide.publishDate,
      description: guide.description,
    }) +
    [
      `# ${guide.title}`,
      "",
      guide.lead,
      "",
      "## Key figures",
      "",
      ...guide.metrics.map((m) => `- **${m.label}**: ${m.value}`),
      "",
      "## Common mistakes",
      "",
      ...guide.mistakes.map((m) => `- ${m}`),
      "",
      "## Questions",
      "",
      ...guide.faq.map((f) => `### ${f.question}\n\n${f.answer}`),
      "",
      "## Related",
      "",
      ...guide.related.map((r) => `- [${r.title}](${SITE_URL}/guides/${r.slug}.md)`),
      "",
    ].join("\n")
  );
}

export function postToMarkdown(post: Post): string {
  return (
    frontMatter({
      title: post.title,
      sourceUrl: `${SITE_URL}/blog/${post.slug}`,
      updated: post.updatedAt ?? post.publishDate,
      description: post.description,
    }) + `# ${post.title}\n\n${post.bodyMarkdown}\n`
  );
}

/* Shape B: hand-maintained mirror read from disk */

export async function readMirror(slug: string): Promise<string | null> {
  // Whitelist against the real content list. Never interpolate a request
  // parameter straight into a filesystem path.
  if (!getPublishedGuides().some((g) => g.slug === slug)) return null;

  try {
    return await readFile(path.join(process.cwd(), "src/content/mirror", `${slug}.md`), "utf8");
  } catch {
    // Missing mirror is a 404, not a fallback to the HTML page. A silent
    // fallback hides the drift this file exists to make visible.
    return null;
  }
}

/* Shape B requires telling the bundler about the content files, since a dynamic
 * path is invisible to it. In next.config.ts:
 *
 *   outputFileTracingIncludes: {
 *     "/api/md/**": ["./src/content/mirror/**\/*.md"],
 *   }
 *
 * Without this the route deploys fine and 404s in production for every slug.
 */

/* Types elided for the template; replace with the project's own. */
type Guide = {
  slug: string;
  title: string;
  description: string;
  lead: string;
  publishDate: string;
  updatedAt?: string;
  metrics: { label: string; value: string }[];
  mistakes: string[];
  faq: { question: string; answer: string }[];
  related: { slug: string; title: string }[];
};

type Post = {
  slug: string;
  title: string;
  description: string;
  publishDate: string;
  updatedAt?: string;
  bodyMarkdown: string;
};

export function isPublished(item: { publishDate?: string }): boolean {
  return !item.publishDate || item.publishDate <= new Date().toISOString().slice(0, 10);
}

/* --------------- src/app/api/md/guides/[slug]/route.ts --------------- */

import { markdownResponse } from "@/lib/markdown-response";
import { getGuide } from "@/content/guides";
// In its own file: import { guideToMarkdown, isPublished } from "@/lib/markdown-export";

// The twin must not be cached at build time when its content depends on data
// that changes without a deploy. For fully static content, drop this and let it
// be prerendered. With Next 16 `cacheComponents` enabled, segment config is an
// error: drop it (request time is the default) and cache with "use cache".
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);

  // Unknown or unpublished slugs must 404 here exactly as the page does.
  if (!guide || !isPublished(guide)) return markdownResponse(null);

  return markdownResponse(guideToMarkdown(guide));
}

/* PORTING
 * The route only has three jobs: resolve the slug, refuse unknown ones, and
 * render the same content the page renders. Any framework that can serve a
 * string with custom headers can host it. What does not travel is the rewrite
 * (see rewrites.ts) and the bundler hint above.
 */
