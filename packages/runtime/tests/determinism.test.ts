/**
 * The Phase 0 success gate, finally enforced.
 *
 * "A decision made today can be replayed in one month, producing byte-identical
 * results with zero LLM calls in the hot path."
 *
 * Until now nothing checked that. The original executor stamped
 * crypto.randomUUID() and Date.now() into the trace it hashed, so the claim was
 * false by construction. These tests fail if that regresses.
 */

import { describe, it, expect } from 'vitest';
import { execute, replay, diff, topologicalOrder, canonicalise, hash } from '../src';
import type { ExecArtifact, CatalogueSnapshot, DecisionRequest } from '../src';
import type { Offer, TargetingPolicy, FrequencyPolicy } from '@metis/core/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const gbp = (amount: number) => ({ amount, currency: 'GBP' as const });

function offer(over: Partial<Offer> & Pick<Offer, 'id' | 'key'>): Offer {
  return {
    categoryId: 'grp_a',
    objectiveId: 'iss_a',
    name: over.key,
    description: '',
    status: 'active',
    financials: {
      price: gbp(3500),
      cost: gbp(1200),
      expectedMargin: gbp(30000),
      termMonths: 12,
      oneOff: false,
    },
    validity: { startsAt: '2026-01-01', endsAt: null },
    boost: 1,
    policyIds: [],
    creativeIds: ['trt_1'],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
    ...over,
  } as Offer;
}

const adultOnly: TargetingPolicy = {
  id: 'pol_age',
  name: 'Adults only',
  kind: 'eligibility',
  description: '',
  conditions: [{ field: 'customer.age', operator: 'gte', value: 18 }],
  scope: { level: 'tenant', targetId: null },
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const weeklyCap: FrequencyPolicy = {
  id: 'cpol_week',
  name: 'Weekly cap',
  description: '',
  channel: null,
  maxContacts: 3,
  period: 'week',
  cooldownDaysAfterReject: 14,
  scope: { level: 'tenant', targetId: null },
  active: true,
};

const catalogue: CatalogueSnapshot = {
  offers: [
    offer({ id: 'p1', key: 'upsell_5g', financials: { price: gbp(3500), cost: gbp(1200), expectedMargin: gbp(55200), termMonths: 24, oneOff: false } }),
    offer({ id: 'p2', key: 'upsell_data', financials: { price: gbp(800), cost: gbp(150), expectedMargin: gbp(7800), termMonths: 12, oneOff: false } }),
    offer({ id: 'p3', key: 'retention_offer', boost: 1.4 }),
    offer({ id: 'p4', key: 'legacy', status: 'retired' }),
  ],
  targetingPolicies: [adultOnly],
  frequencyPolicies: [weeklyCap],
  arbitration: {
    id: 'arb',
    tenantId: 'telco-uk',
    weights: { propensity: 1, value: 1, boost: 1, context: 0.5 },
    utility: { id: 'multiplicative', version: '1.0.0' },
    formula: 'Priority = P^1 x V^1 x L^1 x C^0.5',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
  },
  boosts: [],
  connectors: [],
};

const artifact: ExecArtifact = {
  id: 'next-best-action',
  version: '2.4.0',
  tenantId: 'telco-uk',
  candidateKeys: ['upsell_5g', 'upsell_data', 'retention_offer', 'legacy'],
  packageVersions: { '@metis/nodes-core': '1.2.0' },
  nodes: [
    { id: 'source', type: 'source', label: 'Customer profile' },
    { id: 'eligibility', type: 'filter', label: 'Eligibility', policyIds: ['pol_age'] },
    { id: 'suitability', type: 'constraint', label: 'Suitability' },
    { id: 'score', type: 'score-adaptive', label: 'Propensity', model: { id: 'adm', version: '4.2.0' } },
    { id: 'arbitrate', type: 'arbitrate', label: 'Arbitrate' },
  ],
  edges: [
    { from: 'source', to: 'eligibility' },
    { from: 'eligibility', to: 'suitability' },
    { from: 'suitability', to: 'score' },
    { from: 'score', to: 'arbitrate' },
  ],
};

const request: DecisionRequest = {
  tenantId: 'telco-uk',
  customerId: 'cust_88213',
  channel: 'web',
  placement: 'account_dashboard_hero',
  occurredAt: '2026-09-04T08:00:00.000Z',
  input: { customer: { age: 45, credit_status: 'pass' } },
  consent: { marketing: true, profiling: true, thirdParty: false },
};

// ---------------------------------------------------------------------------

describe('determinism', () => {
  it('produces a byte-identical decision across 100 executions', () => {
    const first = execute(artifact, catalogue, request);
    const canonicalFirst = canonicalise(first.decision);

    for (let i = 0; i < 100; i++) {
      const again = execute(artifact, catalogue, request);
      expect(canonicalise(again.decision)).toBe(canonicalFirst);
      expect(again.chainHash).toBe(first.chainHash);
      expect(again.id).toBe(first.id);
    }
  });

  it('keeps wall-clock measurements out of the hashed decision', () => {
    const a = execute(artifact, catalogue, request);
    const b = execute(artifact, catalogue, request);

    // Measurements are allowed to differ...
    expect(b.measured.executedAt).toBeDefined();
    // ...but must not leak into the reproducible half.
    const serialised = canonicalise(a.decision);
    expect(serialised).not.toContain('executedAt');
    expect(serialised).not.toContain('totalMs');
    expect(a.chainHash).toBe(b.chainHash);
  });

  it('derives the decision id from the decision content', () => {
    const a = execute(artifact, catalogue, request);
    const other = execute(artifact, catalogue, { ...request, customerId: 'cust_99999' });

    expect(a.id).toMatch(/^dec_[0-9a-f]{16}$/);
    expect(other.id).not.toBe(a.id);
  });

  it('replays a stored decision to an identical result', () => {
    const original = execute(artifact, catalogue, request);
    const result = replay(artifact, catalogue, original, request.input);

    expect(result.identical).toBe(true);
    expect(result.differences).toEqual([]);
    expect(result.replayedChainHash).toBe(original.chainHash);
  });

  it('refuses a replay given the wrong inputs, and says that is what happened', () => {
    /**
     * The guard that distinguishes "this decision does not reproduce" from
     * "you gave me the wrong inputs".
     *
     * Untested until now, and it passed every runtime test with the check
     * disabled — because the chain-hash comparison downstream catches a wrong
     * input anyway, with a much worse message. Today the two converge; when the
     * feature service lands (W-009) they stop converging, because replay will
     * read a snapshot and this is the thing that detects it read the wrong one.
     *
     * The distinction is the assertion: `$.inputSnapshotHash` and nothing else.
     * A replay that reported a chain-hash divergence here would be blaming the
     * engine for the caller's mistake.
     */
    const original = execute(artifact, catalogue, request);
    const result = replay(artifact, catalogue, original, {
      ...request.input,
      customer: { ...(request.input.customer as object), age: 41 },
    });

    expect(result.identical).toBe(false);
    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].path).toBe('$.inputSnapshotHash');
    expect(result.differences[0].original).toBe(original.decision.inputSnapshotHash);
    // Nothing was re-executed: there is no replayed decision to compare, and
    // inventing one would be answering a question the caller did not ask.
    expect(result.replayedChainHash).toBe('');
  });

  it('reports what changed when a replay diverges', () => {
    const original = execute(artifact, catalogue, request);

    // A different catalogue is exactly the situation replay must catch.
    const retuned: CatalogueSnapshot = {
      ...catalogue,
      arbitration: {
        ...catalogue.arbitration,
        weights: { propensity: 1, value: 2, boost: 1, context: 0.5 },
      utility: { id: 'multiplicative', version: '1.0.0' },
      },
    };
    const result = replay(artifact, retuned, original, request.input);

    expect(result.identical).toBe(false);
    expect(result.differences.length).toBeGreaterThan(0);
    expect(result.differences.map((d) => d.path).join(' ')).toMatch(/\$\./);
  });

  it('rejects a replay supplied with inputs that do not match the trace', () => {
    const original = execute(artifact, catalogue, request);
    const result = replay(artifact, catalogue, original, { customer: { age: 21 } });

    expect(result.identical).toBe(false);
    expect(result.differences).toEqual([
      {
        path: '$.inputSnapshotHash',
        original: original.decision.inputSnapshotHash,
        replayed: expect.any(String),
      },
    ]);
  });

  it('is insensitive to key order in the input', () => {
    const a = execute(artifact, catalogue, {
      ...request,
      input: { customer: { age: 45, credit_status: 'pass' } },
    });
    const b = execute(artifact, catalogue, {
      ...request,
      input: { customer: { credit_status: 'pass', age: 45 } },
    });

    // JSON.stringify would have produced two different hashes here.
    expect(b.decision.inputSnapshotHash).toBe(a.decision.inputSnapshotHash);
    expect(b.chainHash).toBe(a.chainHash);
  });
});

describe('decision logic', () => {
  it('removes retired offers at the source node, and says why', () => {
    const trace = execute(artifact, catalogue, request);
    const source = trace.decision.eliminations.find((e) => e.nodeId === 'source')!;

    const legacy = source.denials.find((d) => d.key === 'legacy');
    expect(legacy).toBeDefined();
    // The code is the load-bearing part. "It went" is what the old
    // `eliminated` array said; a support agent answering "why did my customer
    // not get this offer" needs the reason, and needs it to be the same string
    // every time so it can be looked up or translated.
    expect(legacy!.code).toBe('NOT_ACTIVE');
    // No rule did this — being retired is a property of the offer itself.
    expect(legacy!.ruleId).toBeNull();
    expect(source.survived).not.toContain('legacy');
  });

  it('sorts denials by key, so two engines cannot disagree on order', () => {
    const trace = execute(artifact, catalogue, request);
    for (const step of trace.decision.eliminations) {
      const keys = step.denials.map((d) => d.key);
      expect(keys, `${step.nodeId} denials out of order`).toEqual([...keys].sort());
    }
  });

  it('gives every removed candidate a reason, and never one that survived', () => {
    // The invariant that makes the cascade answerable: at every node, the
    // candidates that left and the candidates that were denied are the same
    // set. A node that quietly drops one would otherwise look identical.
    const trace = execute(artifact, catalogue, request);
    let carried = artifact.candidateKeys.slice();

    for (const step of trace.decision.eliminations) {
      const denied = step.denials.map((d) => d.key).sort();
      const gone = carried.filter((k) => !step.survived.includes(k)).sort();
      expect(denied, `${step.nodeId} denials do not match what it removed`).toEqual(gone);
      for (const d of step.denials) {
        expect(step.survived, `${step.nodeId} denied a survivor`).not.toContain(d.key);
      }
      carried = step.survived.slice();
    }
  });

  it('eliminates every candidate when an eligibility rule fails', () => {
    const trace = execute(artifact, catalogue, {
      ...request,
      input: { customer: { age: 16, credit_status: 'pass' } },
    });

    expect(trace.decision.winner).toBeNull();
    const step = trace.decision.eliminations.find((e) => e.nodeId === 'eligibility')!;
    expect(step.survived).toEqual([]);
  });

  it('treats a missing attribute as failing a numeric rule, not passing it', () => {
    const trace = execute(artifact, catalogue, { ...request, input: {} });
    expect(trace.decision.winner).toBeNull();
  });

  it('suppresses everything when marketing consent is withheld', () => {
    const trace = execute(artifact, catalogue, {
      ...request,
      consent: { marketing: false, profiling: true, thirdParty: false },
    });
    expect(trace.decision.winner).toBeNull();
  });

  it('suppresses commercial offers once the contact cap is reached', () => {
    const trace = execute(artifact, catalogue, {
      ...request,
      contactHistory: { channel: 'web', withinPeriod: { week: 3 } },
    });
    expect(trace.decision.winner).toBeNull();
  });

  it('ranks by the arbitration formula and records the runner-up', () => {
    const trace = execute(artifact, catalogue, request);
    const { winner, runnerUp } = trace.decision.arbitration;

    expect(winner).not.toBeNull();
    expect(runnerUp).not.toBe(winner);

    const scores = trace.decision.scores;
    expect(scores[winner!].priority).toBeGreaterThanOrEqual(scores[runnerUp!].priority);
  });

  it('honours a boost that is in its validity window and ignores one that is not', () => {
    const boosted: CatalogueSnapshot = {
      ...catalogue,
      boosts: [
        {
          id: 'lev_active',
          name: 'Q4 push',
          scope: { level: 'offer', targetId: 'p2' },
          value: 5,
          reason: 'test',
          validity: { startsAt: '2026-09-01', endsAt: '2026-12-31' },
          updatedAt: '2026-01-01T00:00:00Z',
          updatedBy: 'test',
        },
      ],
    };
    const expired: CatalogueSnapshot = {
      ...boosted,
      boosts: [{ ...boosted.boosts[0], validity: { startsAt: '2025-01-01', endsAt: '2025-12-31' } }],
    };

    expect(execute(artifact, boosted, request).decision.scores['upsell_data'].boost).toBe(5);
    expect(execute(artifact, expired, request).decision.scores['upsell_data'].boost).toBe(1);
  });

  it('records an elimination step for every node in the graph', () => {
    const trace = execute(artifact, catalogue, request);
    expect(trace.decision.eliminations.map((e) => e.nodeId)).toEqual([
      'source',
      'eligibility',
      'suitability',
      'score',
      'arbitrate',
    ]);
  });
});

describe('graph ordering', () => {
  it('orders nodes so every dependency runs first', () => {
    const order = topologicalOrder(artifact).map((n) => n.id);
    expect(order.indexOf('source')).toBeLessThan(order.indexOf('eligibility'));
    expect(order.indexOf('score')).toBeLessThan(order.indexOf('arbitrate'));
  });

  it('breaks ties by node id, so the order never drifts', () => {
    const forked: ExecArtifact = {
      ...artifact,
      nodes: [
        { id: 'a_source', type: 'source', label: 'Source' },
        { id: 'z_branch', type: 'filter', label: 'Z' },
        { id: 'm_branch', type: 'filter', label: 'M' },
        { id: 'end', type: 'arbitrate', label: 'End' },
      ],
      edges: [
        { from: 'a_source', to: 'z_branch' },
        { from: 'a_source', to: 'm_branch' },
        { from: 'z_branch', to: 'end' },
        { from: 'm_branch', to: 'end' },
      ],
    };
    const first = topologicalOrder(forked).map((n) => n.id);
    for (let i = 0; i < 20; i++) {
      expect(topologicalOrder(forked).map((n) => n.id)).toEqual(first);
    }
    expect(first.indexOf('m_branch')).toBeLessThan(first.indexOf('z_branch'));
  });

  it('refuses a cyclic graph rather than looping forever', () => {
    const cyclic: ExecArtifact = {
      ...artifact,
      nodes: [
        { id: 'a', type: 'source', label: 'A' },
        { id: 'b', type: 'filter', label: 'B' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    };
    expect(() => topologicalOrder(cyclic)).toThrow(/cycle/i);
  });

  it('rejects an edge pointing at a node that does not exist', () => {
    const dangling: ExecArtifact = {
      ...artifact,
      edges: [...artifact.edges, { from: 'arbitrate', to: 'ghost' }],
    };
    expect(() => topologicalOrder(dangling)).toThrow(/does not exist/);
  });
});

describe('canonicalisation', () => {
  it('sorts keys at every depth', () => {
    expect(canonicalise({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('preserves array order', () => {
    expect(canonicalise([3, 1, 2])).toBe('[3,1,2]');
  });

  it('hashes structurally equal objects identically', () => {
    expect(hash({ x: 1, y: [1, 2] })).toBe(hash({ y: [1, 2], x: 1 }));
  });

  it('treats undefined as absent', () => {
    expect(canonicalise({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('normalises negative zero', () => {
    expect(canonicalise(-0)).toBe('0');
    expect(hash({ v: -0 })).toBe(hash({ v: 0 }));
  });

  it('refuses values that cannot be reproduced', () => {
    expect(() => canonicalise(NaN)).toThrow(/non-finite/);
    expect(() => canonicalise(Infinity)).toThrow(/non-finite/);
    expect(() => canonicalise(() => {})).toThrow(/Cannot canonicalise/);
  });
});

describe('diff', () => {
  it('is empty for equal values', () => {
    expect(diff({ a: 1 }, { a: 1 })).toEqual([]);
  });

  it('reports the path of a changed leaf', () => {
    const d = diff({ a: { b: 1 } }, { a: { b: 2 } });
    expect(d).toEqual([{ path: '$.a.b', original: 1, replayed: 2 }]);
  });
});

describe('model-free arbitration', () => {
  it('ranks candidates in a flow that has no score node', () => {
    // Anonymous web traffic has no customer to score, so the flow declares
    // a value-and-boost formula. A missing model term must be neutral, not
    // disqualifying - this whole flow returned nothing before.
    const noScore: ExecArtifact = {
      ...artifact,
      nodes: [
        { id: 'source', type: 'source', label: 'Session' },
        { id: 'eligibility', type: 'filter', label: 'Eligibility', policyIds: ['pol_age'] },
        { id: 'arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
      edges: [
        { from: 'source', to: 'eligibility' },
        { from: 'eligibility', to: 'arbitrate' },
      ],
    };

    const trace = execute(noScore, catalogue, request);

    expect(trace.decision.winner).not.toBeNull();
    // Neutral propensity and context, real value and boost.
    const s = trace.decision.scores[trace.decision.winner!];
    expect(s.propensity).toBe(1);
    expect(s.context).toBe(1);
    expect(s.value).toBeGreaterThan(0);
  });
});

describe('hot path cost', () => {
  it('does not re-hash the catalogue on every decision', () => {
    // Regression guard: hashing the whole catalogue per decision is
    // O(catalogue) work in the hot path, and almost all of the original 1.5ms
    // per decision was re-hashing identical data.
    //
    // Asserted as a ratio rather than a wall-clock ceiling. The invariant is
    // that per-decision cost does not grow with catalogue size; an absolute
    // threshold measures whatever else the machine happens to be doing, and
    // this test failed exactly that way while a dev server was running.
    const bulk = (n: number): CatalogueSnapshot => ({
      ...catalogue,
      offers: Array.from({ length: n }, (_, i) =>
        offer({
          id: `p_bulk_${i}`,
          key: `bulk_${i}`,
          // Padding, so a bigger catalogue is genuinely more to hash.
          description: `filler `.repeat(40),
        })
      ).concat(catalogue.offers),
    });

    const timePerDecision = (snapshot: CatalogueSnapshot) => {
      const N = 300;
      // Warm up, so first-call costs land outside the measurement.
      for (let i = 0; i < 20; i++) {
        execute(artifact, snapshot, { ...request, customerId: `warm_${i}` });
      }
      const started = performance.now();
      for (let i = 0; i < N; i++) {
        execute(artifact, snapshot, { ...request, customerId: `cust_${i}` });
      }
      return (performance.now() - started) / N;
    };

    const small = timePerDecision(bulk(5));
    const large = timePerDecision(bulk(400));

    // Without the memo this ratio tracked catalogue size and was enormous.
    // Allow generous headroom for scheduling noise on shared hardware.
    expect(large / Math.max(small, 0.001)).toBeLessThan(5);
  });

  it('still records a correct and stable catalogue hash', () => {
    const a = execute(artifact, catalogue, request);
    const b = execute(artifact, catalogue, request);
    expect(a.decision.catalogueSnapshotHash).toBe(b.decision.catalogueSnapshotHash);

    // A different catalogue must still hash differently, or the memo is wrong.
    const changed = { ...catalogue, boosts: [...catalogue.boosts] };
    const c = execute(artifact, { ...changed, arbitration: { ...catalogue.arbitration, formula: 'other' } }, request);
    expect(c.decision.catalogueSnapshotHash).not.toBe(a.decision.catalogueSnapshotHash);
  });
});
