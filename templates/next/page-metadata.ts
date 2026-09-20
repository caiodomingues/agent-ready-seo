/**
 * Page metadata: canonical, the markdown alternate, social image, and a title
 * that does not double the site name.
 *
 * CONTRACT (framework-neutral), in the HTML head of every content page:
 *   <link rel="canonical" href="https://example.com/guides/x">
 *   <link rel="alternate" type="text/markdown" href="https://example.com/guides/x.md">
 *   <title>Page title | Site</title>          (site name appended exactly once)
 *   <meta name="description" content="...">
 *   og:title / og:description / og:image / og:url
 */

import type { Metadata } from "next";
import { getGuide } from "@/content/guides";
import { hasMarkdownTwin, renderTitle, withYear } from "@/lib/seo-metadata";

const SITE_URL = "https://example.com";
const SITE_NAME = "Site";

/* Root layout. The template appends the site name to any page that does not
 * escape it, so page titles must NOT include it themselves. `default` is used
 * where a page sets no title.
 *
 * No `alternates.canonical` here: it would be inherited by every page that
 * does not override it, and each would then claim to duplicate the home page.
 * `openGraph.siteName` is what stops the engine deriving the site name from
 * the domain; pages that declare their own `openGraph` must repeat it, because
 * the page object replaces the layout's rather than merging.
 *
 * export const metadata: Metadata = {
 *   metadataBase: new URL(SITE_URL),
 *   title: { template: `%s | ${SITE_NAME}`, default: `${SITE_NAME} - short promise` },
 *   openGraph: { siteName: SITE_NAME },
 * };
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};

  const url = `${SITE_URL}/guides/${slug}`;
  const headline = withYear(guide.title);

  return {
    // `absolute` bypasses the layout template. Whether this family carries the
    // site name is a policy decision in seo-metadata.ts, not something each
    // page decides; the rendered tag is what the tests and the crawl measure.
    title: { absolute: renderTitle("guides", headline) },
    description: guide.description,

    alternates: {
      canonical: url,
      // The per-page discovery path for the twin, emitted only where a twin is
      // registered. Announcing one that does not exist is the same broken
      // promise as an llms.txt claim that 404s.
      ...(hasMarkdownTwin(`/guides/${slug}`) ? { types: { "text/markdown": `${url}.md` } } : {}),
    },

    openGraph: {
      type: "article",
      url,
      siteName: SITE_NAME,
      title: guide.title,
      description: guide.description,
      images: [ogImageUrl(guide.title, guide.description, guide.category)],
      publishedTime: guide.publishDate,
      modifiedTime: guide.updatedAt,
    },

    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
    },
  };
}

/**
 * One image template for the whole site, parameterized. Re-skinning the template
 * re-skins every page's image with no per-page work.
 *
 * The route lives under /api, so robots.txt must allow it explicitly or no
 * preview renders anywhere. See robots.ts.
 */
export function ogImageUrl(title: string, description?: string, tag?: string): string {
  const q = new URLSearchParams({ title });
  if (description) q.set("description", description);
  if (tag) q.set("tag", tag);
  return `${SITE_URL}/api/og?${q.toString()}`;
}

/* Pages that must NOT be indexed (login, account, transactional confirmations)
 * declare it on the page itself, which requires the page to stay crawlable so
 * the directive can be read. Blocking it in robots.txt instead can leave a bare
 * URL in the index with no way to remove it.
 *
 * export const metadata: Metadata = { robots: { index: false, follow: false } };
 */

/* PORTING
 * The four tags above are plain HTML. Any templating layer can emit them.
 * What travels less well is the title template: if the framework has no
 * equivalent, build the full title in one helper and call it everywhere, so the
 * doubling bug has a single place to be prevented.
 */
