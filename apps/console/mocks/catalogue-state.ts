/**
 * The catalogue the engine decides against — the live one, not the fixture.
 *
 * This closes the half of W-005 that made the console's configuration
 * cosmetic. `catalogueSnapshot` in fixtures/engine.ts is built from the fixture
 * modules; the console writes to `store.*`, which is seeded from those modules
 * and is a separate mutable copy. So every write landed somewhere the engine
 * never read.
 *
 * It was not a subtle failure. Publishing arbitration weights returned 200,
 * persisted, audited, and updated the formula the screen displays — and the
 * next decision came back byte-identical, still ranked by the fixture's
 * weights. The most prominent configurable control in the product changed
 * nothing, and the engine's own file comment claimed the opposite: "a change
 * to a policy or boost changes the decisions, because the engine is reading
 * the same catalogue the UI edits."
 *
 * ## Why this needs a registry and not just a getter
 *
 * A `DecisionRecord` stores `catalogueSnapshotHash` and never the catalogue.
 * That was safe while the catalogue was frozen: any copy was the right copy.
 * The moment it becomes editable, replay has to answer "the catalogue as it
 * stood then", and replaying against today's would either report a spurious
 * difference or — worse — silently agree for the wrong reason.
 *
 * So every distinct catalogue is kept, keyed by its own hash. Replay looks up
 * the one the decision names. A hash nobody holds is refused rather than
 * approximated, because a replay that cannot be exact must say so.
 *
 * This is the property that makes configurability and traceability one
 * mechanism rather than two competing ones: editing the catalogue mints a new
 * snapshot, and every decision keeps pointing at the snapshot that produced it.
 */

import { hash } from '@metis/runtime/deterministic/canonical';
import type { CatalogueSnapshot } from '@metis/runtime/deterministic/types';
import { store } from '@/mocks/store';

/**
 * Every catalogue any live decision has been made against, by hash.
 *
 * Grows only when the catalogue actually changes: an unchanged catalogue
 * hashes to a key already present. So this is bounded by the number of edits,
 * not by the number of decisions.
 */
const byHash = new Map<string, CatalogueSnapshot>();

/**
 * Build the snapshot from the store as it stands.
 *
 * Deep-cloned on registration. The store mutates in place — `PUT /arbitration`
 * assigns into `store.arbitration.weights` rather than replacing the object —
 * so holding references would let a later edit rewrite the history of a
 * decision already made, which is the one thing a snapshot must never do.
 */
function build(): CatalogueSnapshot {
  return {
    offers: store.offers,
    targetingPolicies: store.targetingPolicies,
    frequencyPolicies: store.frequencyPolicies,
    arbitration: store.arbitration,
    boosts: store.boosts,
    connectors: store.connectors,
  } as CatalogueSnapshot;
}

/**
 * The catalogue to decide against now.
 *
 * Hashed on every call rather than invalidated on every write. Invalidation
 * would mean finding all ~15 mutation sites and never missing one later, and
 * the failure mode of missing one is exactly the silent staleness this module
 * exists to remove. Hashing a catalogue this size is well inside the latency
 * budget, and `bench/harness` is what holds that claim.
 *
 * The registered object is returned rather than the freshly built one, so
 * object identity is stable while the catalogue is unchanged and the engine's
 * own memoisation of `catalogueHash` keeps hitting.
 */
export function currentCatalogue(): CatalogueSnapshot {
  const built = build();
  const h = hash(built);

  const existing = byHash.get(h);
  if (existing) return existing;

  const frozen = structuredClone(built);
  byHash.set(h, frozen);
  return frozen;
}

/**
 * The catalogue a decision was made against, or undefined if it is not held.
 *
 * Undefined is a real answer and callers must not paper over it: replaying
 * against a substitute catalogue produces a verdict about the wrong question.
 */
export function catalogueByHash(h: string): CatalogueSnapshot | undefined {
  return byHash.get(h);
}

/**
 * Put a catalogue into the registry without deciding against it.
 *
 * Used for the fixture catalogue at startup. The 5,000 generated decisions
 * were made against it before any of this existed, and their records name its
 * hash — so without this they would become unreplayable the moment replay
 * started looking snapshots up rather than assuming one.
 */
export function registerCatalogue(catalogue: CatalogueSnapshot): string {
  const h = hash(catalogue);
  if (!byHash.has(h)) byHash.set(h, catalogue);
  return h;
}

/** How many distinct catalogues are held. Diagnostics and tests. */
export function catalogueCount(): number {
  return byHash.size;
}
