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
import type { Proposition, EngagementPolicy, ContactPolicy } from '@metis/core/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const gbp = (amount: number) => ({ amount, currency: 'GBP' as const });

function proposition(over: Partial<Proposition> & Pick<Proposition, 'id' | 'key'>): Proposition {
  return {
    groupId: 'grp_a',
    issueId: 'iss_a',
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
    lever: 1,
    policyIds: [],
    treatmentIds: ['trt_1'],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
    ...over,
  } as Proposition;
}

const adultOnly: EngagementPolicy = {
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

const weeklyCap: ContactPolicy = {
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
  propositions: [
    proposition({ id: 'p1', key: 'upsell_5g', financials: { price: gbp(3500), cost: gbp(1200), expectedMargin: gbp(55200), termMonths: 24, oneOff: false } }),
    proposition({ id: 'p2', key: 'upsell_data', financials: { price: gbp(800), cost: gbp(150), expectedMargin: gbp(7800), termMonths: 12, oneOff: false } }),
    proposition({ id: 'p3', key: 'retention_offer', lever: 1.4 }),
    proposition({ id: 'p4', key: 'legacy', status: 'retired' }),
  ],
  engagementPolicies: [adultOnly],
  contactPolicies: [weeklyCap],
  arbitration: {
    id: 'arb',
    tenantId: 'telco-uk',
    weights: { propensity: 1, value: 1, lever: 1, context: 0.5 },
    formula: 'Priority = P^1 x V^1 x L^1 x C^0.5',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
  },
  levers: [],
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

  it('reports what changed when a replay diverges', () => {
    const original = execute(artifact, catalogue, request);

    // A different catalogue is exactly the situation replay must catch.
    const retuned: CatalogueSnapshot = {
      ...catalogue,
      arbitration: {
        ...catalogue.arbitration,
        weights: { propensity: 1, value: 2, lever: 1, context: 0.5 },
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
  it('removes retired propositions at the source node', () => {
    const trace = execute(artifact, catalogue, request);
    const source = trace.decision.eliminations.find((e) => e.nodeId === 'source')!;

    expect(source.eliminated).toContain('legacy');
    expect(source.survived).not.toContain('legacy');
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

  it('honours a lever that is in its validity window and ignores one that is not', () => {
    const boosted: CatalogueSnapshot = {
      ...catalogue,
      levers: [
        {
          id: 'lev_active',
          name: 'Q4 push',
          scope: { level: 'proposition', targetId: 'p2' },
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
      levers: [{ ...boosted.levers[0], validity: { startsAt: '2025-01-01', endsAt: '2025-12-31' } }],
    };

    expect(execute(artifact, boosted, request).decision.scores['upsell_data'].lever).toBe(5);
    expect(execute(artifact, expired, request).decision.scores['upsell_data'].lever).toBe(1);
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
  it('ranks candidates in a strategy that has no score node', () => {
    // Anonymous web traffic has no customer to score, so the strategy declares
    // a value-and-lever formula. A missing model term must be neutral, not
    // disqualifying - this whole strategy returned nothing before.
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
    // Neutral propensity and context, real value and lever.
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
      propositions: Array.from({ length: n }, (_, i) =>
        proposition({
          id: `p_bulk_${i}`,
          key: `bulk_${i}`,
          // Padding, so a bigger catalogue is genuinely more to hash.
          description: `filler `.repeat(40),
        })
      ).concat(catalogue.propositions),
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
    const changed = { ...catalogue, levers: [...catalogue.levers] };
    const c = execute(artifact, { ...changed, arbitration: { ...catalogue.arbitration, formula: 'other' } }, request);
    expect(c.decision.catalogueSnapshotHash).not.toBe(a.decision.catalogueSnapshotHash);
  });
});
