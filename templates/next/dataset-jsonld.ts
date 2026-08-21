/**
 * Structured data for a citable dataset, plus the shared organization entity
 * everything else references.
 *
 * CONTRACT:
 *   - The organization is declared ONCE with a stable @id.
 *   - Every other block references it by @id instead of repeating an inline
 *     object, so all mentions resolve to one entity.
 *   - The Dataset block carries description, creator and license: the three
 *     properties most commonly omitted, and the ones a model actually reads
 *     when deciding whether it may quote the table.
 *
 * If you operate more than one property (a main site and a data subdomain), both
 * must reference the SAME @id string. Otherwise they read as different companies
 * and neither accumulates the other's authority. Changing the string is a
 * two-repository change.
 */

const SITE_URL = "https://example.com";
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/* ------------------------- the entity itself ------------------------- */

/** Render once, in the root layout. Everything else points at it. */
export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "Site Name",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  sameAs: ["https://github.com/org", "https://www.linkedin.com/company/org"],
};

/** Reference form. Use this everywhere a publisher or creator is needed. */
export const organizationRef = { "@id": ORGANIZATION_ID };

/* ----------------------------- Dataset ----------------------------- */

export function datasetSchema(params: {
  name: string;
  description: string;
  url: string;
  /** ISO 8601 interval. Open-ended for an ongoing series: "2026-01/.." */
  temporalCoverage: string;
  spatialCoverageName: string;
  keywords: string[];
  /** Period the published figures belong to, e.g. "2026-05". */
  datePublished: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: params.name,
    // A description a stranger could quote verbatim. Not a slogan.
    description: params.description,
    url: params.url,
    inLanguage: "en",
    creator: organizationRef,
    publisher: organizationRef,
    // Read by models deciding whether quoting is permitted. Do not omit.
    license: `${SITE_URL}/terms`,
    isAccessibleForFree: true,
    temporalCoverage: params.temporalCoverage,
    datePublished: params.datePublished,
    spatialCoverage: { "@type": "Place", name: params.spatialCoverageName },
    keywords: params.keywords,
    // Point at the methodology page. This is what turns a number into a
    // citable number, and it is frequently the page that gets linked.
    citation: `${SITE_URL}/about-the-data`,
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/markdown",
        contentUrl: `${params.url}.md`,
      },
    ],
  };
}

/* --------------------------- rendering it --------------------------- */

/**
 * JSON.stringify escapes nothing dangerous by default. Escape the closing tag
 * sequence so content containing "</script>" cannot break out.
 */
export function jsonLd(schema: object): string {
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}

/*
 * In a page component:
 *
 *   <script
 *     type="application/ld+json"
 *     dangerouslySetInnerHTML={{ __html: jsonLd(datasetSchema({ ... })) }}
 *   />
 */

/* THE RULE THAT MATTERS MORE THAN THE MARKUP
 * Structured data must agree with the visible page. A model reads the declared
 * block, not your table. Derive both from the same source where possible; where
 * you cannot, diff the declared claims against the rendered ones as a separate
 * audit pass. Validators never catch this class of error.
 */

/* PORTING
 * JSON-LD is a script tag with a JSON body. Nothing here depends on the
 * framework. The only mechanical concern is escaping, which every templating
 * layer solves differently.
 */
