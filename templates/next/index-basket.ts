/**
 * A fixed basket definition and the aggregation guards that keep a published
 * index honest.
 *
 * This is the core artifact of GEO: a small, dated, reproducible number computed
 * over a set that does not change. Everything here exists because its absence
 * produces a figure you will later have to retract.
 *
 * THE BASKET IS FIXED. Changing an item, a matcher or a reference unit breaks
 * comparability with every prior period. Treat a change as a version bump with a
 * full recompute and a note on the methodology page. Expansion by SUBSETTING an
 * existing basket is safe and is the cheap way to add coverage: a new segment
 * defined as a subset of already measured items needs no new rule and no
 * recompute.
 *
 * Pure module: no database access, so a script, a server component and a
 * markdown generator can all import it.
 */

export type RefUnit = "kg" | "g" | "L" | "ml" | "unit";

/** One observation from the source data, already normalized. */
export interface Observation {
  /** Normalized name: lowercased, accents stripped. Matchers run against this. */
  searchName: string;
  /** Price of the package as sold. */
  price: number;
  /** How much the package contains, in `unit`. */
  quantity: number;
  unit: string;
  /** Stable identity of the thing observed, for distinct counting. */
  entityId: string;
}

export interface BasketItem {
  id: string;
  label: string;
  /** Reference package: the unit every observation is scaled to before aggregating. */
  refQty: number;
  refUnit: RefUnit;
  refPackLabel: string;
  /** Inclusion pattern, anchored where possible to avoid matching compounds. */
  include: RegExp;
  /** Exclusions: variants that are a different product at a different price. */
  exclude?: RegExp;
  /** Sanity bounds for the reference package, in currency units. */
  minPlausible: number;
  maxPlausible: number;
  /**
   * Minimum package size, in the reference unit. The unit price of a 100g tray
   * is not comparable to that of a 1kg bag; without this floor the median gets
   * stuck on small packages.
   */
  minPackRefQty?: number;
}

export const BASKET: readonly BasketItem[] = [
  {
    id: "item-a",
    label: "Item A, standard grade",
    refQty: 1,
    refUnit: "kg",
    refPackLabel: "1 kg",
    include: /^item a\b/,
    // Premium and specialty variants are a different market at a different price.
    exclude: /organic|light|premium|imported|sample/,
    minPlausible: 2,
    maxPlausible: 12,
    minPackRefQty: 0.5,
  },
  // ... the rest of the basket. Keep it small enough to explain item by item on
  // the methodology page. Thirty to forty items is a workable size.
];

/* ------------------------------ guards ------------------------------ */

/** Below this many DISTINCT entities, a cell is not published. */
export const MIN_SAMPLE = 5;

/** Fraction of the basket that must be present for a slice to get a page. */
export const MIN_COVERAGE = 0.34;

export function matches(item: BasketItem, obs: Observation): boolean {
  if (!item.include.test(obs.searchName)) return false;
  if (item.exclude?.test(obs.searchName)) return false;

  const refQty = toRefUnit(obs.quantity, obs.unit, item.refUnit);
  if (refQty === null) return false;
  if (item.minPackRefQty && refQty < item.minPackRefQty) return false;

  // Scale the observation to the reference package before the sanity check, so
  // the bounds mean what the methodology page says they mean.
  const scaled = (obs.price / refQty) * item.refQty;
  return scaled >= item.minPlausible && scaled <= item.maxPlausible;
}

/**
 * Median, not mean: one extreme value should not move a published figure.
 * Sample counts DISTINCT entities, so the same thing observed many times does
 * not inflate apparent confidence.
 */
export function aggregate(
  item: BasketItem,
  observations: Observation[],
): { value: number; p25: number; p75: number; sample: number } | null {
  const kept = observations.filter((o) => matches(item, o));

  const byEntity = new Map<string, number>();
  for (const o of kept) {
    const scaled = (o.price / toRefUnit(o.quantity, o.unit, item.refUnit)!) * item.refQty;
    // One value per entity: the cheapest observation of it.
    byEntity.set(o.entityId, Math.min(byEntity.get(o.entityId) ?? Infinity, scaled));
  }

  const values = [...byEntity.values()].sort((a, b) => a - b);
  if (values.length < MIN_SAMPLE) return null; // not enough to be a measurement

  return {
    value: quantile(values, 0.5),
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
    sample: values.length,
  };
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function toRefUnit(qty: number, unit: string, ref: RefUnit): number | null {
  const u = unit.toLowerCase();
  if (ref === "kg") return u === "kg" ? qty : u === "g" ? qty / 1000 : null;
  if (ref === "g") return u === "g" ? qty : u === "kg" ? qty * 1000 : null;
  if (ref === "L") return u === "l" ? qty : u === "ml" ? qty / 1000 : null;
  if (ref === "ml") return u === "ml" ? qty : u === "l" ? qty * 1000 : null;
  return u === "unit" || u === "un" ? qty : null;
}

/* ------------------------- the compute script ------------------------- */

/*
 * Run it every period, after the upstream data lands. Requirements, all of which
 * have a failure they prevent:
 *
 *   idempotent full recompute   a re-run after a data fix is safe
 *   diff before write           you know which cells moved and by how much
 *   guard against empty result  an upstream failure cannot wipe a published series
 *   dry-run mode                the diff as a report, before anything is written
 *   period key, not "now"       recomputing March in April writes March
 *
 * Sketch:
 *
 *   const rows = [];
 *   for (const item of BASKET)
 *     for (const region of REGIONS) {
 *       const agg = aggregate(item, await observationsFor(item, region, period));
 *       if (agg) rows.push({ itemId: item.id, region, period, ...agg });
 *     }
 *
 *   if (rows.length === 0) throw new Error("empty recompute, refusing to write");
 *   const diff = diffAgainstStored(rows);
 *   if (process.env.DRY_RUN) return report(diff);
 *   await writeChanged(diff);
 */

/* ------------------------- reading it back ------------------------- */

/*
 * Tolerate exactly one error on the read path, and let everything else throw.
 *
 *   try { return await query(); }
 *   catch (err) {
 *     // Only a missing table means "no data yet". Any other failure must throw,
 *     // or the cache stores an empty page for an hour.
 *     for (let e = err; e instanceof Error; e = e.cause)
 *       if (/no such table/i.test(e.message)) return [];
 *     throw err;
 *   }
 *
 * The subtlety: drivers wrap errors, so check the whole cause chain rather than
 * the top-level message.
 */

/* PORTING
 * Nothing here is framework-specific. It is a pure module by design, so the same
 * definitions feed the compute script, the pages and the markdown twins. Keeping
 * that property is what stops the published number from disagreeing with itself
 * across surfaces.
 */
