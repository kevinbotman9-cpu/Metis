import type { Provenance } from '@metis/client';
import { decisions } from './fixtures/decisions';

/**
 * Whether the numbers in a response came from a customer or from a seed.
 *
 * On 2026-09-09 the seeded `demo-telco-uk` tenant crossed from obviously-fake
 * to indistinguishable. 10,400 decisions, 887 measured outcomes, click rates
 * between 16% and 35%, realised value in pounds that differs plausibly from
 * expected, and a genuine-looking underperformer — every figure derived from
 * `seededUnitInterval` and none of it from a person. The only thing separating
 * it from a real report was a small badge in the corner of the console's nav
 * rail: nothing tested it, no API response carried it, and no screenshot was
 * obliged to include it.
 *
 * The rule this module exists to enforce is that **a marker living only in the
 * interface is not a marker.** It has to survive a `curl`, an exported file and
 * a screenshot, because those are the three ways a number leaves the building.
 *
 * There is no clever inference here. A decision id is either in the committed
 * seed index or it is not, and that is the whole test — which is deliberate,
 * because a heuristic for "does this look synthetic" is exactly the kind of
 * thing that answers wrongly on the day it matters.
 */

const SEEDED = new Set(decisions.map((d) => d.id));

/** Is this decision one the seed generated, rather than one somebody made? */
export function isSeededDecision(decisionId: string): boolean {
  return SEEDED.has(decisionId);
}

const SYNTHETIC_NOTE =
  'Synthetic. Every figure here is generated from a fixed seed for the demo tenant ' +
  'demo-telco-uk and describes no real customer, decision or outcome. Reproducible, ' +
  'and not evidence of anything.';

const RECORDED_NOTE =
  'Recorded. Every figure here derives from a decision this platform actually made.';

/** Provenance for a single record. */
export function provenanceFor(decisionId: string): Provenance {
  return isSeededDecision(decisionId)
    ? { source: 'synthetic', syntheticCount: 1, recordedCount: 0, note: SYNTHETIC_NOTE }
    : { source: 'recorded', syntheticCount: 0, recordedCount: 1, note: RECORDED_NOTE };
}

/**
 * Provenance for a set.
 *
 * `mixed` is the normal state of a demo tenant somebody has clicked in, and it
 * is the answer most worth stating plainly: a report that joins 887 seeded
 * outcomes to the four a reviewer just produced is not evidence, and neither is
 * it a pure fixture. The counts are carried so a reader can see the ratio
 * rather than take the word for it.
 */
export function provenanceOver(decisionIds: Iterable<string>): Provenance {
  let synthetic = 0;
  let recorded = 0;
  for (const id of decisionIds) {
    if (SEEDED.has(id)) synthetic += 1;
    else recorded += 1;
  }
  if (synthetic === 0 && recorded === 0) {
    return { source: 'recorded', syntheticCount: 0, recordedCount: 0, note: RECORDED_NOTE };
  }
  if (recorded === 0) {
    return { source: 'synthetic', syntheticCount: synthetic, recordedCount: 0, note: SYNTHETIC_NOTE };
  }
  if (synthetic === 0) {
    return { source: 'recorded', syntheticCount: 0, recordedCount: recorded, note: RECORDED_NOTE };
  }
  return {
    source: 'mixed',
    syntheticCount: synthetic,
    recordedCount: recorded,
    note:
      `Mixed. ${synthetic.toLocaleString('en-GB')} of ` +
      `${(synthetic + recorded).toLocaleString('en-GB')} records here are generated from a ` +
      'fixed seed for the demo tenant demo-telco-uk and describe no real customer; the rest ' +
      'derive from decisions this platform actually made. Not evidence of anything.',
  };
}
