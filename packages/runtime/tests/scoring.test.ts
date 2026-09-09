import { describe, it, expect } from 'vitest';
import { execute } from '../src/deterministic/engine';
import {
  resolveScores,
  setScorerResolver,
  SEEDED_PROPENSITY,
  ScoresNotResolved,
  modelKeyOf,
  scoreNodes,
} from '../src/scoring';
import { round } from '../src/deterministic/canonical';
import type { ExecArtifact, CatalogueSnapshot, DecisionRequest } from '../src/deterministic/types';

/**
 * Scoring, after it moved out of the core — ADR-009 phase one.
 *
 * The move is worth exactly nothing unless two things hold: the arithmetic did
 * not change, and the core now refuses to run a scorer that would reach the
 * network. The corpora cover the first over 22 recorded decisions and every
 * hash in them; this file covers the seam.
 *
 * The single most important assertion here is the last one. `execute` still
 * resolves for itself when a caller passes nothing, because requiring the
 * argument would have changed seventy call sites in one commit. That
 * convenience is the hole ADR-009 §2 warns about, and `pure` is what closes it:
 * a scorer that is not pure is refused inside the core rather than quietly run.
 */

const CAT: CatalogueSnapshot = {
  offers: [
    offer('upsell_5g', 2000, 200),
    offer('upsell_data', 1200, 100),
    offer('retention_offer', 3000, 400),
  ],
  targetingPolicies: [],
  frequencyPolicies: [],
  boosts: [],
  connectors: [],
  arbitration: {
    id: 'arb',
    tenantId: 'telco-uk',
    weights: { propensity: 1, value: 1, boost: 1, context: 0.5 },
    utility: { id: 'multiplicative', version: '1.0.0' },
    formula: 'Priority = P^1 x V^1 x B^1 x C^0.5',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
  },
} as unknown as CatalogueSnapshot;

const REQ: DecisionRequest = {
  tenantId: 'telco-uk',
  customerId: 'cust_88213',
  channel: 'web',
  placement: 'account_dashboard_hero',
  occurredAt: '2026-09-04T08:00:00.000Z',
  input: { customer: { age: 45, credit_status: 'pass' } },
  consent: { marketing: true, profiling: true, thirdParty: false },
};

function offer(key: string, margin: number, cost: number) {
  return {
    id: `prop_${key}`,
    key,
    status: 'active',
    objectiveId: 'iss',
    categoryId: 'cat',
    name: key,
    validity: { startsAt: '2020-01-01T00:00:00.000Z', endsAt: null },
    // Explicit, because `effectiveBoost` over an empty boost list returns
    // nothing and the ranking function then refuses a term it was promised.
    boost: 1,
    financials: {
      expectedMargin: { amount: margin, currency: 'GBP' },
      cost: { amount: cost, currency: 'GBP' },
      price: { amount: 0, currency: 'GBP' },
    },
  };
}

const SCORED: ExecArtifact = {
  id: 'next-best-action',
  version: '2.4.0',
  tenantId: 'telco-uk',
  candidateKeys: ['upsell_5g', 'upsell_data', 'retention_offer'],
  packageVersions: { '@metis/nodes-core': '1.2.0' },
  nodes: [
    { id: 'source', type: 'source', label: 'Source' },
    { id: 'score', type: 'score-model', label: 'Score', model: { id: 'm', version: '1.0.0' } },
    { id: 'arbitrate', type: 'arbitrate', label: 'Arbitrate' },
  ],
  edges: [
    { from: 'source', to: 'score' },
    { from: 'score', to: 'arbitrate' },
  ],
};

describe('the resolver produces what the core used to compute', () => {
  it('reproduces the expression that was inlined, to the digit', () => {
    // Moved verbatim: 0.05 + seededUnitInterval(customerId, offerKey, modelKey)
    // * 0.9, rounded to 6dp by ADR-003's rule. Any drift here moves every hash
    // in every corpus, which is why it is asserted against the arithmetic
    // rather than against a recorded number.
    const keys = CAT.offers.map((o) => o.key);
    const resolved = resolveScores(SCORED, REQ, keys);
    const byOffer = resolved.get('m@1.0.0')!;
    expect(byOffer).toBeDefined();
    for (const key of keys) {
      expect(byOffer.get(key)).toBe(
        SEEDED_PROPENSITY.score({
          tenantId: REQ.tenantId,
          customerId: REQ.customerId,
          offerKey: key,
          modelKey: 'm@1.0.0',
        })
      );
    }
  });

  it('rounds to six places, so a float cannot change a hash', () => {
    const resolved = resolveScores(SCORED, REQ, CAT.offers.map((o) => o.key));
    for (const p of resolved.get('m@1.0.0')!.values()) {
      expect(p).toBe(round(p, 6));
      // The floor and the span, which exist so a multiplicative ranking
      // function cannot be zeroed and a propensity never reads as certainty.
      expect(p).toBeGreaterThanOrEqual(0.05);
      expect(p).toBeLessThanOrEqual(0.95);
    }
  });

  it('is a pure function of the request, the offer and the pinned model', () => {
    const keys = CAT.offers.map((o) => o.key);
    expect(resolveScores(SCORED, REQ, keys)).toEqual(resolveScores(SCORED, REQ, keys));
  });

  it('keys by the pinned model, so two versions score differently', () => {
    const v2: ExecArtifact = {
      ...SCORED,
      nodes: SCORED.nodes.map((n) =>
        n.id === 'score' ? { ...n, model: { id: 'm', version: '2.0.0' } } : n
      ),
    };
    const keys = CAT.offers.map((o) => o.key);
    const a = resolveScores(SCORED, REQ, keys).get('m@1.0.0')!;
    const b = resolveScores(v2, REQ, keys).get('m@2.0.0')!;
    // Pinning is what makes replay possible; a version that did not change the
    // score would make the pin decorative.
    expect([...a.values()]).not.toEqual([...b.values()]);
  });

  it('names the model the way the artifact does, and falls back to the node id', () => {
    expect(modelKeyOf(SCORED.nodes.find((n) => n.id === 'score')!)).toBe('m@1.0.0');
    expect(modelKeyOf({ id: 'bare', type: 'score-model', label: 'x' } as never)).toBe('bare');
    expect(scoreNodes(SCORED).map((n) => n.id)).toEqual(['score']);
  });
});

describe('a resolved score and a self-resolved one agree', () => {
  it('produces an identical decision either way', () => {
    // The property that makes the transitional shape safe: passing the resolver
    // output and letting the core resolve are the same decision, byte for byte.
    // If they ever diverge, one of the two paths is wrong and the chain hash
    // says so without anybody having to look.
    const self = execute(SCORED, CAT, REQ);
    const passed = execute(
      SCORED,
      CAT,
      REQ,
      resolveScores(SCORED, REQ, CAT.offers.map((o) => o.key))
    );
    expect(passed.chainHash).toBe(self.chainHash);
    expect(passed.decision.scores).toEqual(self.decision.scores);
  });
});

describe('the core refuses a scorer that would reach the network', () => {
  const IMPURE = { id: 'impure', pure: false, score: () => 0.5 };

  it('throws rather than running an impure scorer, and names the node', () => {
    // The hole this closes: when a model gateway lands, a caller that has not
    // been updated to resolve first would otherwise get a seeded number and a
    // decision that looks reproducible and is not.
    const restore = setScorerResolver(() => IMPURE);
    try {
      expect(() => execute(SCORED, CAT, REQ)).toThrow(ScoresNotResolved);
      expect(() => execute(SCORED, CAT, REQ)).toThrow(/resolveScores\(\) before execute\(\)/);
    } finally {
      setScorerResolver(restore);
    }
  });

  it('runs an impure scorer happily when the caller resolved first', () => {
    const restore = setScorerResolver(() => IMPURE);
    try {
      const resolved = new Map([['m@1.0.0', new Map(CAT.offers.map((o) => [o.key, 0.5]))]]);
      const record = execute(SCORED, CAT, REQ, resolved);
      for (const s of Object.values(record.decision.scores)) {
        expect(s.propensity).toBe(0.5);
      }
    } finally {
      setScorerResolver(restore);
    }
  });

  it('leaves the resolver as it found it', () => {
    // A global left swapped is a test that breaks the next one.
    expect(resolveScores(SCORED, REQ, ['upsell_5g']).get('m@1.0.0')!.get('upsell_5g')).toBe(
      SEEDED_PROPENSITY.score({
        tenantId: REQ.tenantId,
        customerId: REQ.customerId,
        offerKey: 'upsell_5g',
        modelKey: 'm@1.0.0',
      })
    );
  });
});
