import type { Provenance } from '@metis/client';
import { effectiveDataClass } from '@metis/ledger';

/**
 * Whether the numbers in a response came from a customer or from a seed.
 *
 * On 2026-09-09 the seeded `demo-telco-us` tenant crossed from obviously-fake
 * to indistinguishable. 10,400 decisions, 1,228 measured outcomes, click rates
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
 * **Where the answer comes from, since ADR-018 §8.** The ledger's data class,
 * not a membership test. Until slice 3 a decision was synthetic if its id was
 * in the committed index and recorded if it was not, which made "recorded" mean
 * "not in a file" — and the file has been deleted. `effectiveDataClass` answers
 * `synthetic` for every ledger while the subject is unprotected, so every
 * figure on every screen reads synthetic, including one a reviewer produced by
 * clicking. That is a truthful label for a ledger holding customer references
 * in clear with no erasure path (G-068); the slice that changes it is
 * "Protect the subject in the ledger" in `docs/DIRECTIVE.md`.
 *
 * **`mixed` is therefore unreachable** and nothing constructs it. It was the
 * normal state of a demo tenant somebody had clicked in, when two stores each
 * carried their own kind of history. There is one store now, and one class.
 */

const SYNTHETIC_NOTE =
  'Synthetic. Every figure here is generated from a fixed seed for the demo tenant ' +
  'demo-telco-us and describes no real customer, decision or outcome. Reproducible, ' +
  'and not evidence of anything.';

const RECORDED_NOTE =
  'Recorded. Every figure here derives from a decision this platform actually made.';

const NOTE = { synthetic: SYNTHETIC_NOTE, real: RECORDED_NOTE } as const;
const SOURCE = { synthetic: 'synthetic', real: 'recorded' } as const;

/** Provenance for a single record. */
export function provenanceFor(_decisionId: string): Provenance {
  return provenanceOf(1);
}

/**
 * Provenance for a set.
 *
 * The counts are carried so a reader can see the ratio rather than take the
 * word for it — the whole set shares the ledger's class, so one of the two is
 * always zero.
 */
export function provenanceOver(decisionIds: Iterable<string>): Provenance {
  let n = 0;
  for (const _ of decisionIds) n += 1;
  return provenanceOf(n);
}

function provenanceOf(count: number): Provenance {
  const dataClass = effectiveDataClass();
  return {
    source: SOURCE[dataClass],
    syntheticCount: dataClass === 'synthetic' ? count : 0,
    recordedCount: dataClass === 'real' ? count : 0,
    note: NOTE[dataClass],
  };
}
