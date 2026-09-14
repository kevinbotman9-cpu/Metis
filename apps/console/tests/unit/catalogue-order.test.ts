import { describe, it, expect } from 'vitest';
import { hash } from '@metis/runtime/deterministic/canonical';
import type { CatalogueSnapshot } from '@metis/runtime/deterministic/types';
import { InMemoryCatalogueStore } from '@metis/catalogue';
import { catalogueSnapshot } from '@/mocks/fixtures/engine';
import { currentCatalogue } from '@/mocks/catalogue-state';
import {
  offers,
  targetingPolicies,
  frequencyPolicies,
  boosts,
  connectors,
  arbitrationConfig,
} from '@/mocks/fixtures/catalogue';

/**
 * The catalogue a decision is made against is the catalogue a store reads back.
 *
 * Until 2026-09-13 it was not. The engine hashes arrays in the order it is
 * given, the fixtures listed offers, policies and connectors in authoring order,
 * and `packages/catalogue` reads every array back sorted by id. So the same
 * catalogue had two hashes, and a decision service reading the store — ADR-016's
 * first unit — could not have reproduced a single decision the console made:
 * not one of the 60 service cases, not one of the 10,400 seeded decisions.
 *
 * Both of the console's snapshots are held to it: the frozen one the seeded
 * decisions name, and the live one built from the store every request.
 */

const T = 'telco-us';

/** The fixture catalogue, written into a store in reverse and read back. */
async function readBack(): Promise<CatalogueSnapshot> {
  const store = new InMemoryCatalogueStore();
  // Reversed, so a store that returned write order could not pass by accident.
  for (const o of [...offers].reverse()) await store.putOffer(T, o);
  for (const p of [...targetingPolicies].reverse()) await store.putTargetingPolicy(T, p);
  for (const p of [...frequencyPolicies].reverse()) await store.putFrequencyPolicy(T, p);
  for (const b of [...boosts].reverse()) await store.putBoost(T, b);
  for (const c of [...connectors].reverse()) await store.putConnector(T, c);
  await store.putArbitration(T, arbitrationConfig);

  const read = await store.read(T);
  return {
    offers: read.offers,
    targetingPolicies: read.targetingPolicies,
    frequencyPolicies: read.frequencyPolicies,
    arbitration: read.arbitration!,
    boosts: read.boosts,
    connectors: read.connectors,
  };
}

describe('the catalogue a decision names is the catalogue a store holds', () => {
  it('hashes the fixture snapshot the same as the same catalogue read back from a store', async () => {
    // A guard on the guard: the fixtures really are out of id order, so this is
    // not passing because the two orders happen to coincide.
    const authored = connectors.map((c) => c.id);
    expect(authored).not.toEqual([...authored].sort((a, b) => a.localeCompare(b)));

    expect(hash(catalogueSnapshot)).toBe(hash(await readBack()));
  });

  it('hashes the live catalogue the console decides against the same way', async () => {
    // The live snapshot is read from the console's catalogue store on every
    // request; the seeded decisions name the frozen one. Unchanged, they are one
    // catalogue, and the service cases hold both to the same hashes.
    expect(hash(await currentCatalogue())).toBe(hash(catalogueSnapshot));
  });
});
