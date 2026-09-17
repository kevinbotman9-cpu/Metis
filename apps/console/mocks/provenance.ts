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
 *
 * **Nothing to describe is not described.** Until 2026-09-17 an empty set got
 * the same note as a full one — *"Every figure here is generated from a fixed
 * seed"* — so a tenant with no decision history showed a banner asserting a
 * seed that had not run, over figures that did not exist, on `/performance`,
 * `/decisions` and the policy funnel. A marker that must survive a `curl` has
 * to be true in one, so the absence is at the source: an empty set returns no
 * provenance, the key drops out of the response, and the banner — which
 * renders nothing when it is absent — has nothing to render.
 *
 * **The note does not say where the decisions came from, because it cannot
 * know.** The same note used to say "generated from a fixed seed", which was
 * true of the seeded corpus and false of anything decided since, and nothing
 * persists whether a seed ran: `store.ledgerSeed` is this process only, and a
 * ledger seeded into PostgreSQL by `npm run seed:ledger` records nothing unless
 * it was a reset. Both origins that can exist today are named instead, and
 * neither is claimed. It cannot be a third: `real` is refused everywhere while
 * the subject is unprotected.
 *
 * **The tenant is the one the response is for.** The note named
 * `demo-telco-us`, typed into a string, a tenant renamed on 2026-09-12 when it
 * became the customer's catalogue — while the tenant switcher above the banner
 * said `telco-us`. A name passed in cannot drift from the request it describes.
 */

const syntheticNote = (tenantId: string) =>
  `Synthetic, for tenant ${tenantId}. The decisions behind these figures were generated ` +
  'from a fixed seed or made by using the demo; they describe no real customer, decision ' +
  'or outcome, and are not evidence of anything.';

const recordedNote = (tenantId: string) =>
  `Recorded, for tenant ${tenantId}. Every figure here derives from a decision this ` +
  'platform actually made.';

const NOTE = { synthetic: syntheticNote, real: recordedNote } as const;
const SOURCE = { synthetic: 'synthetic', real: 'recorded' } as const;

/** Provenance for a single record, which by construction exists. */
export function provenanceFor(tenantId: string, _decisionId: string): Provenance {
  return provenanceOf(tenantId, 1)!;
}

/**
 * Provenance for a set, or `undefined` when the set is empty.
 *
 * The counts are carried so a reader can see the ratio rather than take the
 * word for it — the whole set shares the ledger's class, so one of the two is
 * always zero.
 */
export function provenanceOver(tenantId: string, decisionIds: Iterable<string>): Provenance | undefined {
  let n = 0;
  for (const _ of decisionIds) n += 1;
  return provenanceOf(tenantId, n);
}

function provenanceOf(tenantId: string, count: number): Provenance | undefined {
  if (count === 0) return undefined;
  const dataClass = effectiveDataClass();
  return {
    source: SOURCE[dataClass],
    syntheticCount: dataClass === 'synthetic' ? count : 0,
    recordedCount: dataClass === 'real' ? count : 0,
    note: NOTE[dataClass](tenantId),
  };
}
