/**
 * Editorial review as a CI check: content whose facts depend on code is
 * fingerprinted together with the files it depends on, and the build fails
 * when either changed without a recorded review.
 *
 * CONTRACT (framework-neutral):
 *   - Every editorial entry (article, help page, guide) declares which source
 *     files its claims depend on: the pricing formula it explains, the plan
 *     limits it quotes, the dataset figures it cites, the generated materials
 *     it links to.
 *   - A manifest records, per entry, the hash of the content, the hash of each
 *     dependency, and the date someone reviewed it.
 *   - The check fails when: an entry has no review; the content changed since
 *     the review; a dependency changed since the review; the dependency set
 *     changed; a dependency file is missing; the manifest names an entry that
 *     no longer exists.
 *   - It warns (or fails with --strict-age) when the periodic review is overdue.
 *   - Recording a review requires an explicit, non-future date. There is no
 *     "record with today's date" shortcut, because the date is a claim.
 *     "Today" is the calendar date in --timezone=<IANA name> or REVIEW_TIMEZONE,
 *     UTC when neither is set.
 *
 * The failure this exists for: the site advertised a limit and a figure for
 * months after the code that enforced them changed, and nothing in the build
 * knew the article and the module were related. Agent-authored content makes
 * this worse, not better: nothing forces a re-read, so the manifest is what
 * forces it.
 *
 *   node content-review.js                                   # check
 *   node content-review.js --record=blog:slug --reviewed-at=2026-09-13
 *   node content-review.js --record-all --reviewed-at=2026-09-13
 *   node content-review.js --strict-age                      # overdue is a failure
 *   node content-review.js --timezone=Europe/Berlin         # whose "today"
 */

const { createHash } = require("node:crypto");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");

const MANIFEST = "content/review-manifest.json";

/* ---------------------------- dependencies ---------------------------- */

// Which source files each feature's claims come from. An article declares the
// features it talks about; the check resolves them to files and hashes them.
const FEATURES = {
  pricing: ["src/lib/pricing.ts", "src/lib/overhead.ts"],
  plans: ["src/lib/plan-access.ts", "src/lib/constants.ts"],
  dataset: ["src/lib/dataset-stats.ts", "src/lib/index-basket.ts"],
  // Materials generated for a specific edition: the source JSON, the
  // calculation memory and the generator itself.
  editorialMaterials: [
    "public/materials/2026-07/observed-prices.json",
    "public/materials/2026-07/calculation-memory.json",
    "scripts/generate-editorial-materials.js",
  ],
};

/* ------------------------------ entries ------------------------------ */

// Replace with the project's real registries. Each entry needs a stable id, the
// content as a string (metadata included: title, description, the fields the
// JSON-LD is built from, image alt text; a change to any of them counts), the
// features it depends on, and how often it must be re-read regardless.
function editorialEntries() {
  const posts = JSON.parse(readFileSync("content/posts.json", "utf8"));
  return posts.map((post) => ({
    id: `blog:${post.slug}`,
    title: post.title,
    content: JSON.stringify(post) + "\n" + readFileSync(`content/blog/${post.slug}.md`, "utf8"),
    dependencies: resolve([
      ...(post.tag === "data" ? ["dataset"] : ["pricing", "plans"]),
      ...(post.materials ? ["editorialMaterials"] : []),
    ]),
    // Dated analyses age faster than evergreen guides.
    reviewEveryDays: post.tag === "data" ? 90 : 180,
  }));
}

function resolve(features) {
  return [...new Set(features.flatMap((f) => FEATURES[f]))].sort();
}

/* ----------------------------- fingerprint ----------------------------- */

function fingerprint(text) {
  // Normalize line endings so a checkout on another OS is not a "change".
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

/** A dependency that no longer exists hashes to null, so it is reported, not thrown. */
function snapshot(entry) {
  return {
    contentHash: fingerprint(entry.content),
    dependencies: Object.fromEntries(
      entry.dependencies.map((file) => [
        file,
        existsSync(file) ? fingerprint(readFileSync(file, "utf8")) : null,
      ]),
    ),
  };
}

function isCalendarDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  // Date.parse rolls 2026-02-30 over to March instead of rejecting it.
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/* -------------------------------- main -------------------------------- */

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
// en-CA formats as YYYY-MM-DD.
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: flag("timezone") ?? process.env.REVIEW_TIMEZONE ?? "UTC",
}).format(new Date());

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
const entries = editorialEntries();

const record = flag("record")?.split(",");
const recordAll = args.includes("--record-all");
if (record || recordAll) {
  const date = flag("reviewed-at");
  if (!date || !isCalendarDate(date) || date > today) {
    throw new Error("--reviewed-at=YYYY-MM-DD is required, must be a real date, and cannot be in the future.");
  }
  if (record?.some((id) => !entries.some((e) => e.id === id))) {
    throw new Error("Unknown entry in --record.");
  }
  for (const entry of entries) {
    if (recordAll || record?.includes(entry.id)) {
      const current = snapshot(entry);
      // A review cannot attest to a file that is not there.
      const missing = Object.keys(current.dependencies).filter((f) => current.dependencies[f] === null);
      if (missing.length) throw new Error(`${entry.id}: dependency missing: ${missing.join(", ")}`);
      manifest[entry.id] = { reviewedAt: date, ...current };
    }
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

const problems = [];
let overdue = 0;

for (const entry of entries) {
  const review = manifest[entry.id];
  if (!review) {
    problems.push(`${entry.id}: no review recorded`);
    continue;
  }
  const current = snapshot(entry);
  if (review.contentHash !== current.contentHash) {
    problems.push(`${entry.id}: content or metadata changed since ${review.reviewedAt}`);
  }
  for (const [file, hash] of Object.entries(current.dependencies)) {
    if (hash === null) problems.push(`${entry.id}: dependency missing: ${file}`);
    else if (review.dependencies[file] !== hash) problems.push(`${entry.id}: re-review after change in ${file}`);
  }
  if (Object.keys(review.dependencies).some((file) => !(file in current.dependencies))) {
    problems.push(`${entry.id}: dependency set changed since the review`);
  }
  const ageDays = (Date.parse(today) - Date.parse(review.reviewedAt)) / 86_400_000;
  if (ageDays >= entry.reviewEveryDays) {
    overdue++;
    const message = `${entry.id}: periodic review overdue (last: ${review.reviewedAt})`;
    if (args.includes("--strict-age")) problems.push(message);
    else console.warn(message);
  }
}

for (const id of Object.keys(manifest)) {
  if (!entries.some((e) => e.id === id)) problems.push(`${id}: manifest entry without content`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`content review: ${entries.length} entries consistent; ${overdue} periodic review(s) pending`);
}

/* WHAT THE MANIFEST BUYS
 * Commit it. A diff on the manifest is a review log: who re-read what, when,
 * and against which version of the code. A CI failure names the article and
 * the file that moved under it, which is the sentence nobody could write from
 * memory a month later.
 *
 * WHAT IT DOES NOT DO
 * It cannot tell whether the re-read was honest. Recording a review without
 * reading is one command; the manifest only makes that a deliberate act with
 * a date on it rather than an omission nobody notices.
 */
