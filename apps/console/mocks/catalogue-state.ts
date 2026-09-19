/**
 * The catalogue the engine decides against — the live one, not the fixture.
 *
 * This closes the half of W-005 that made the console's configuration
 * cosmetic. `catalogueSnapshot` in fixtures/engine.ts is built from the fixture
 * modules; the console writes to its catalogue store. So until the engine read
 * the store, every write landed somewhere the engine never read.
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
 * **This registry is in memory, and the catalogue no longer is.** Since
 * 2026-09-13 the catalogue lives in `@metis/catalogue` and survives a restart;
 * this map does not. A decision recorded to a durable ledger before a restart
 * names a catalogue hash nothing holds afterwards, and its replay answers 409
 * `catalogue_unavailable` — correctly, and permanently. The store keeps the
 * catalogue as it is, not every catalogue it has been. Registered in `gaps.md`.
 */

import { hash } from '@metis/runtime/deterministic/canonical';
import type { CatalogueSnapshot } from '@metis/runtime/deterministic/types';
import { generateActions } from '@metis/core/domain';
import type { CatalogueSnapshotRecord } from '@metis/catalogue';
import { store } from '@/mocks/store';
import { CONSOLE_TENANT } from '@/mocks/catalogue-source';

/**
 * Every catalogue any live decision has been made against, by hash.
 *
 * Grows only when the catalogue actually changes: an unchanged catalogue
 * hashes to a key already present. So this is bounded by the number of edits,
 * not by the number of decisions.
 */
const byHash = new Map<string, CatalogueSnapshot>();

/**
 * The tenant's catalogue as it stands: one read, so everything a request
 * checks and decides from is one moment.
 *
 * Every array in id order — the store's contract, pinned by
 * `packages/catalogue`'s suite — which is what lets the hash of what the engine
 * decides from equal the hash of what the store holds.
 */
export async function readCatalogue(): Promise<CatalogueSnapshotRecord> {
  await store.catalogueReady;
  return store.catalogue.read(CONSOLE_TENANT);
}

/**
 * The part of a catalogue record the engine decides from, registered by hash.
 *
 * The registered object is returned rather than a fresh one, so object
 * identity is stable while the catalogue is unchanged and the engine's own
 * memoisation of `catalogueHash` keeps hitting.
 */
export function snapshotFrom(record: CatalogueSnapshotRecord): CatalogueSnapshot {
  if (!record.arbitration) {
    throw new Error(
      `Tenant '${CONSOLE_TENANT}' has no ranking function in its catalogue, so no decision can be made. ` +
        'A seeded store always has one; a store that lacks it was not seeded by this console.'
    );
  }
  const built: CatalogueSnapshot = {
    offers: record.offers,
    // One per offer, generated rather than stored (ADR-019 §1, decided
    // 2026-09-18): nothing can author an action yet.
    actions: generateActions(record.offers),
    targetingPolicies: record.targetingPolicies,
    frequencyPolicies: record.frequencyPolicies,
    arbitration: record.arbitration,
    boosts: record.boosts,
    connectors: record.connectors,
  };
  const h = hash(built);

  const existing = byHash.get(h);
  if (existing) return existing;

  // Cloned on registration: a record is the caller's to change, and a snapshot
  // somebody could edit afterwards would rewrite the history of a decision.
  const frozen = structuredClone(built);
  byHash.set(h, frozen);
  return frozen;
}

/** The catalogue to decide against now. */
export async function currentCatalogue(): Promise<CatalogueSnapshot> {
  return snapshotFrom(await readCatalogue());
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
 * Used for the fixture catalogue at startup. The seeded decisions were made
 * against it, and their records name its hash — so without this they would
 * become unreplayable the moment replay started looking snapshots up rather
 * than assuming one.
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
