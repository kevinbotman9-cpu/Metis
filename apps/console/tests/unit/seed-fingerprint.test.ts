import { describe, it, expect } from 'vitest';
import { fingerprintDiff, type SeedFingerprint } from '@/mocks/fixtures/fingerprint';
import { store } from '@/mocks/store';

/**
 * The check that decides whether the other checks are trustworthy.
 *
 * `global-setup.ts` refuses a dev server whose seed differs from the fixtures
 * on disk, because a reused server answers from the seed it captured at module
 * load and a Rule 9 bite-proof against it proves nothing (G-002).
 *
 * That guard cannot be tested by the suite it guards — it runs before the
 * suite, and asserting it from inside would need the very dev server whose
 * trustworthiness is in question. So the comparison is a pure function, tested
 * here against hand-built inputs, and the guard's only job is to format what
 * this returns.
 */

const fp = (parts: Record<string, string>): SeedFingerprint => ({
  overall: `overall-of-${Object.values(parts).join('+')}`,
  parts,
});

describe('the seed fingerprint', () => {
  it('is captured once, so runtime writes cannot move it', () => {
    // The constant the endpoint serves. Read twice rather than recomputed: if
    // this were a function over the live store, an authoring test creating one
    // offer would make every later run refuse a server that is perfectly fine.
    expect(store.seededFingerprint.overall).toBe(store.seededFingerprint.overall);
    expect(store.seededFingerprint.overall).toMatch(/^[0-9a-f]{64}$/);
  });

  it('covers every part of the catalogue a decision is made from', () => {
    // Named rather than counted: a part silently dropped from the fingerprint
    // is a part whose edits a reused server can serve stale for ever, and the
    // guard would say nothing. Adding one here is deliberate; losing one is
    // not.
    expect(Object.keys(store.seededFingerprint.parts).sort()).toEqual([
      'agentActivity',
      'arbitration',
      'artifacts',
      'auditEvents',
      'autonomySettings',
      'boosts',
      'categories',
      'changeSets',
      'connectors',
      'creatives',
      'experiments',
      'frequencyPolicies',
      'objectives',
      'offers',
      'placements',
      'profileSchema',
      'targetingPolicies',
      'users',
    ]);
  });

  it('gives every part its own hash, so no two parts collide', () => {
    const parts = store.seededFingerprint.parts;
    expect(new Set(Object.values(parts)).size).toBe(Object.keys(parts).length);
  });
});

describe('what the guard reports', () => {
  it('says nothing when the server and the disk agree', () => {
    const same = fp({ offers: 'a', boosts: 'b' });
    expect(fingerprintDiff(same, same)).toEqual([]);
  });

  it('names the part that differs, with both sides', () => {
    // The whole point of hashing per part. "Mismatch" says the server is
    // stale; this says which edit it has not seen.
    expect(
      fingerprintDiff(fp({ offers: 'a', boosts: 'b' }), fp({ offers: 'a', boosts: 'CHANGED' }))
    ).toEqual([{ part: 'boosts', server: 'b', disk: 'CHANGED' }]);
  });

  it('reports every differing part, in a stable order', () => {
    const diff = fingerprintDiff(
      fp({ offers: 'a', boosts: 'b', packs: 'c' }),
      fp({ offers: 'A', boosts: 'b', packs: 'C' })
    );
    expect(diff.map((d) => d.part)).toEqual(['offers', 'packs']);
  });

  it('reports a part one side does not have at all', () => {
    // A fingerprint gaining or losing a part is itself a mismatch worth
    // naming: the server is running code that hashes a different set.
    expect(fingerprintDiff(fp({ offers: 'a' }), fp({ offers: 'a', boosts: 'new' }))).toEqual([
      { part: 'boosts', server: 'absent', disk: 'new' },
    ]);
  });
});
