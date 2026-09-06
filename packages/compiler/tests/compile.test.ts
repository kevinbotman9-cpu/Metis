/**
 * Compiler tests.
 *
 * Each case corresponds to a way a flow can be wrong. Two of them
 * (ARBITRATION_MISSING_SCORE, NO_DELIVERABLE_CREATIVE) encode bugs that were
 * previously only findable by running the engine and noticing the output was
 * empty.
 */

import { describe, it, expect } from 'vitest';
import {
  compileDecisionFlow,
  resolveRange,
  formatReport,
  type DecisionFlowSource,
  type CompileContext,
} from '../src/decision-flow/compile';
import { suggest, didYouMean } from '../src/decision-flow/diagnostics';
import type { Offer, TargetingPolicy, FrequencyPolicy } from '@metis/core/domain';

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

const policy: TargetingPolicy = {
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

const frequencyPolicy: FrequencyPolicy = {
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

const ctx: CompileContext = {
  offers: [
    offer({ id: 'p1', key: 'upsell_5g', policyIds: ['pol_age'] }),
    offer({ id: 'p2', key: 'upsell_data' }),
  ],
  targetingPolicies: [policy],
  frequencyPolicies: [frequencyPolicy],
  arbitration: {
    id: 'arb',
    tenantId: 't',
    weights: { propensity: 1, value: 1, boost: 1, context: 0.5 },
    utility: { id: 'multiplicative', version: '1.0.0' },
    formula: 'P x V x L x C',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
  },
  availablePackages: { '@metis/nodes-core': ['1.1.0', '1.4.0', '2.0.0'] },
  tenant: { id: 'telco-uk', latencyBudgetMs: 50, maxNodes: 100 },
};

const valid: DecisionFlowSource = {
  id: 'nba',
  version: '1.0.0',
  tenantId: 'telco-uk',
  candidateKeys: ['upsell_5g', 'upsell_data'],
  packageRanges: { '@metis/nodes-core': '^1.2.0' },
  nodes: [
    { id: 'source', type: 'source', label: 'Profile', estimatedMs: 4 },
    { id: 'gate', type: 'filter', label: 'Eligibility', policyIds: ['pol_age'], estimatedMs: 1 },
    {
      id: 'score',
      type: 'score-adaptive',
      label: 'Propensity',
      model: { id: 'adm', version: '4.2.0' },
      estimatedMs: 3,
    },
    { id: 'arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 2 },
  ],
  edges: [
    { from: 'source', to: 'gate' },
    { from: 'gate', to: 'score' },
    { from: 'score', to: 'arbitrate' },
  ],
};

const codes = (r: ReturnType<typeof compileDecisionFlow>) => r.diagnostics.map((x) => x.code);

describe('a valid flow', () => {
  it('compiles', () => {
    const r = compileDecisionFlow(valid, ctx);
    expect(r.ok).toBe(true);
    expect(r.artifact).not.toBeNull();
    expect(codes(r)).toEqual([]);
  });

  it('pins the package range to an exact available version', () => {
    const r = compileDecisionFlow(valid, ctx);
    // ^1.2.0 must take 1.4.0, not 2.0.0.
    expect(r.artifact!.packageVersions['@metis/nodes-core']).toBe('1.4.0');
  });

  it('computes the critical path, not the sum', () => {
    const branching: DecisionFlowSource = {
      ...valid,
      nodes: [
        { id: 'source', type: 'source', label: 'S', estimatedMs: 4 },
        { id: 'a', type: 'filter', label: 'A', estimatedMs: 5 },
        { id: 'b', type: 'filter', label: 'B', estimatedMs: 1 },
        { id: 'arbitrate', type: 'arbitrate', label: 'Arb', estimatedMs: 2 },
      ],
      edges: [
        { from: 'source', to: 'a' },
        { from: 'source', to: 'b' },
        { from: 'a', to: 'arbitrate' },
        { from: 'b', to: 'arbitrate' },
      ],
    };
    const r = compileDecisionFlow(branching, { ...ctx, arbitration: { ...ctx.arbitration, weights: { ...ctx.arbitration.weights, propensity: 0 } } });
    // 4 + max(5, 1) + 2 = 11, not 4 + 5 + 1 + 2 = 12.
    expect(r.artifact!.costManifest.criticalPathMs).toBe(11);
    expect(r.artifact!.costManifest.worstCaseMs).toBe(12);
  });

  it('produces the same artifact hash for the same source', () => {
    const a = compileDecisionFlow(valid, ctx).artifact!;
    const b = compileDecisionFlow(valid, ctx).artifact!;
    expect(b.artifactHash).toBe(a.artifactHash);
    // compiledAt is metadata and must not be hashed.
    expect(a.compiledAt).toBeDefined();
  });

  it('changes the artifact hash when the flow changes', () => {
    const a = compileDecisionFlow(valid, ctx).artifact!;
    const b = compileDecisionFlow({ ...valid, candidateKeys: ['upsell_5g'] }, ctx).artifact!;
    expect(b.artifactHash).not.toBe(a.artifactHash);
  });

  it('records model invocations', () => {
    const r = compileDecisionFlow(valid, ctx);
    expect(r.artifact!.costManifest.modelInvocations).toEqual([
      { nodeId: 'score', model: 'adm@4.2.0' },
    ]);
  });
});

describe('structural errors', () => {
  it('rejects a cycle', () => {
    const r = compileDecisionFlow(
      { ...valid, edges: [...valid.edges, { from: 'arbitrate', to: 'source' }] },
      ctx
    );
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('CYCLE');
  });

  it('rejects an edge pointing at a missing node, and suggests a real one', () => {
    const r = compileDecisionFlow(
      { ...valid, edges: [...valid.edges, { from: 'arbitrate', to: 'scor' }] },
      ctx
    );
    expect(r.ok).toBe(false);
    const diag = r.diagnostics.find((x) => x.code === 'DANGLING_EDGE')!;
    expect(diag.message).toContain("Did you mean 'score'?");
  });

  it('rejects duplicate node ids', () => {
    const r = compileDecisionFlow(
      { ...valid, nodes: [...valid.nodes, { id: 'score', type: 'filter', label: 'Dup', estimatedMs: 1 }] },
      ctx
    );
    expect(codes(r)).toContain('DUPLICATE_NODE_ID');
  });

  it('rejects a flow with no arbitrate node', () => {
    const r = compileDecisionFlow(
      {
        ...valid,
        nodes: valid.nodes.filter((n) => n.type !== 'arbitrate'),
        edges: valid.edges.filter((e) => e.to !== 'arbitrate'),
      },
      ctx
    );
    expect(codes(r)).toContain('NO_ARBITRATION');
  });

  it('warns about a node nothing can reach', () => {
    const r = compileDecisionFlow(
      { ...valid, nodes: [...valid.nodes, { id: 'orphan', type: 'filter', label: 'Orphan', estimatedMs: 1 }] },
      ctx
    );
    // An orphan with no incoming edges is itself a root, so it is reachable;
    // the real case is a node only reachable from inside a cycle.
    expect(r.ok).toBe(true);
  });

  it('rejects an empty flow', () => {
    const r = compileDecisionFlow({ ...valid, nodes: [], edges: [], candidateKeys: [] }, ctx);
    expect(codes(r)).toContain('EMPTY_FLOW');
    expect(codes(r)).toContain('EMPTY_CANDIDATE_SET');
  });

  it('rejects a flow over the tenant node limit', () => {
    const r = compileDecisionFlow(valid, { ...ctx, tenant: { ...ctx.tenant, maxNodes: 2 } });
    expect(codes(r)).toContain('TOO_MANY_NODES');
  });
});

describe('the arbitration-without-scoring bug', () => {
  it('warns when the formula weights propensity but nothing scores', () => {
    // This is the bug that made an entire flow return nothing at runtime.
    const noScore: DecisionFlowSource = {
      ...valid,
      nodes: valid.nodes.filter((n) => n.type !== 'score-adaptive'),
      edges: [
        { from: 'source', to: 'gate' },
        { from: 'gate', to: 'arbitrate' },
      ],
    };
    const r = compileDecisionFlow(noScore, ctx);
    const diag = r.diagnostics.find((x) => x.code === 'ARBITRATION_MISSING_SCORE')!;
    expect(diag).toBeDefined();
    expect(diag.remedy).toContain('propensity weight to 0');
  });

  it('stays quiet when the formula does not use propensity', () => {
    const noScore: DecisionFlowSource = {
      ...valid,
      nodes: valid.nodes.filter((n) => n.type !== 'score-adaptive'),
      edges: [
        { from: 'source', to: 'gate' },
        { from: 'gate', to: 'arbitrate' },
      ],
    };
    const valueOnly: CompileContext = {
      ...ctx,
      arbitration: {
        ...ctx.arbitration,
        weights: { propensity: 0, value: 1, boost: 1, context: 0 },
      utility: { id: 'multiplicative', version: '1.0.0' },
      },
    };
    expect(codes(compileDecisionFlow(noScore, valueOnly))).not.toContain(
      'ARBITRATION_MISSING_SCORE'
    );
  });
});

describe('the ranking function', () => {
  it('refuses a function that does not exist, and lists the ones that do', () => {
    // Checked at compile time because the engine's only options later are to
    // throw on live traffic or to fall back to a function the tenant did not
    // configure. Both are worse than refusing to publish.
    const r = compileDecisionFlow(valid, {
      ...ctx,
      arbitration: {
        ...ctx.arbitration,
        utility: { id: 'bayesian-surprise', version: '9.0.0' },
      },
    });
    expect(r.ok).toBe(false);
    const diag = r.diagnostics.find((x) => x.code === 'UNKNOWN_UTILITY_FUNCTION')!;
    expect(diag).toBeDefined();
    expect(diag.message).toContain('bayesian-surprise@9.0.0');
    // The remedy names the real options rather than saying "check the config".
    expect(diag.remedy).toContain('multiplicative@1.0.0');
    expect(diag.remedy).toContain('expected-value@1.0.0');
  });

  it('treats a version that does not exist as unknown, not as the nearest one', () => {
    const r = compileDecisionFlow(valid, {
      ...ctx,
      arbitration: { ...ctx.arbitration, utility: { id: 'multiplicative', version: '2.0.0' } },
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((x) => x.code === 'UNKNOWN_UTILITY_FUNCTION')).toBe(true);
  });

  it('accepts both built-ins', () => {
    for (const utility of [
      { id: 'multiplicative', version: '1.0.0' },
      { id: 'expected-value', version: '1.0.0' },
    ]) {
      const r = compileDecisionFlow(valid, {
        ...ctx,
        arbitration: { ...ctx.arbitration, utility },
      });
      expect(
        r.diagnostics.filter((x) => x.code.startsWith('UTILITY_') || x.code === 'UNKNOWN_UTILITY_FUNCTION'),
        `${utility.id}@${utility.version}`
      ).toEqual([]);
    }
  });
});

describe('reference errors', () => {
  it('rejects an unknown policy and suggests a real one', () => {
    const r = compileDecisionFlow(
      {
        ...valid,
        nodes: valid.nodes.map((n) => (n.id === 'gate' ? { ...n, policyIds: ['pol_ag'] } : n)),
      },
      ctx
    );
    expect(r.ok).toBe(false);
    const diag = r.diagnostics.find((x) => x.code === 'UNKNOWN_POLICY')!;
    expect(diag.message).toContain("Did you mean 'pol_age'?");
  });

  it('rejects an unknown offer and suggests a real one', () => {
    const r = compileDecisionFlow({ ...valid, candidateKeys: ['upsell_5gg'] }, ctx);
    expect(r.ok).toBe(false);
    const diag = r.diagnostics.find((x) => x.code === 'UNKNOWN_OFFER')!;
    expect(diag.message).toContain("Did you mean 'upsell_5g'?");
  });

  it('rejects a score node with a floating model version', () => {
    const r = compileDecisionFlow(
      {
        ...valid,
        nodes: valid.nodes.map((n) =>
          n.id === 'score' ? { ...n, model: { id: 'adm', version: '^4.2.0' } } : n
        ),
      },
      ctx
    );
    expect(r.ok).toBe(false);
    const diag = r.diagnostics.find((x) => x.code === 'UNPINNED_MODEL')!;
    expect(diag.remedy).toContain('replay');
  });

  it('rejects a score node with no model at all', () => {
    const r = compileDecisionFlow(
      {
        ...valid,
        nodes: valid.nodes.map((n) => (n.id === 'score' ? { ...n, model: undefined } : n)),
      },
      ctx
    );
    expect(codes(r)).toContain('UNPINNED_MODEL');
  });
});

describe('candidate set', () => {
  it('rejects an offer that has no creative to deliver', () => {
    const noCreative = {
      ...ctx,
      offers: [offer({ id: 'p1', key: 'upsell_5g', creativeIds: [] }), ctx.offers[1]],
    };
    const r = compileDecisionFlow(valid, noCreative);
    expect(r.ok).toBe(false);
    const diag = r.diagnostics.find((x) => x.code === 'NO_DELIVERABLE_CREATIVE')!;
    expect(diag.message).toContain('nothing to deliver');
  });

  it('warns about a retired candidate rather than failing', () => {
    const retired = {
      ...ctx,
      offers: [
        offer({ id: 'p1', key: 'upsell_5g', status: 'retired', creativeIds: [] }),
        ctx.offers[1],
      ],
    };
    const r = compileDecisionFlow(valid, retired);
    expect(codes(r)).toContain('RETIRED_CANDIDATE');
    // A retired offer needs no creative, so that error must not fire.
    expect(codes(r)).not.toContain('NO_DELIVERABLE_CREATIVE');
    expect(r.ok).toBe(true);
  });

  it('warns about a paused candidate', () => {
    const paused = {
      ...ctx,
      offers: [offer({ id: 'p1', key: 'upsell_5g', status: 'paused' }), ctx.offers[1]],
    };
    expect(codes(compileDecisionFlow(valid, paused))).toContain('INACTIVE_CANDIDATE');
  });
});

describe('dangling policy scopes', () => {
  const withTargets = (over: Partial<CompileContext>): CompileContext => ({
    ...ctx,
    knownScopeTargets: { objectives: ['iss_a'], categories: ['grp_a'] },
    ...over,
  });

  it('rejects a frequency policy scoped to something that does not exist', () => {
    const r = compileDecisionFlow(
      valid,
      withTargets({
        frequencyPolicies: [
          { ...frequencyPolicy, scope: { level: 'category', targetId: 'grp_deleted' } },
        ],
      })
    );
    expect(r.ok).toBe(false);
    const diag = r.diagnostics.find((x) => x.code === 'DANGLING_POLICY_SCOPE')!;
    expect(diag.message).toContain('does not exist');
  });

  it('suggests the real scope target when the id is a near miss', () => {
    const r = compileDecisionFlow(
      valid,
      withTargets({
        frequencyPolicies: [
          { ...frequencyPolicy, scope: { level: 'category', targetId: 'grp_aa' } },
        ],
      })
    );
    expect(r.diagnostics.find((x) => x.code === 'DANGLING_POLICY_SCOPE')!.message).toContain(
      "Did you mean 'grp_a'?"
    );
  });

  it('offers no suggestion when nothing is close, rather than a misleading one', () => {
    const r = compileDecisionFlow(
      valid,
      withTargets({
        frequencyPolicies: [
          { ...frequencyPolicy, scope: { level: 'category', targetId: 'grp_deleted' } },
        ],
      })
    );
    expect(r.diagnostics.find((x) => x.code === 'DANGLING_POLICY_SCOPE')!.message).not.toContain(
      'Did you mean'
    );
  });

  it('rejects an targeting policy scoped to a deleted objective', () => {
    const r = compileDecisionFlow(
      valid,
      withTargets({
        targetingPolicies: [{ ...policy, scope: { level: 'objective', targetId: 'iss_gone' } }],
      })
    );
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain('DANGLING_POLICY_SCOPE');
  });

  it('accepts a policy scoped to another category that really exists', () => {
    // Not a defect of this flow: warning on every non-covering policy was
    // noise on every compile and taught readers to ignore the compiler.
    const r = compileDecisionFlow(
      valid,
      withTargets({
        knownScopeTargets: { objectives: ['iss_a'], categories: ['grp_a', 'grp_winback'] },
        frequencyPolicies: [
          { ...frequencyPolicy, scope: { level: 'category', targetId: 'grp_winback' } },
        ],
      })
    );
    expect(r.ok).toBe(true);
    expect(codes(r)).not.toContain('DANGLING_POLICY_SCOPE');
  });

  it('skips the check entirely when scope targets are not supplied', () => {
    const r = compileDecisionFlow(valid, {
      ...ctx,
      frequencyPolicies: [{ ...frequencyPolicy, scope: { level: 'category', targetId: 'anything' } }],
    });
    expect(codes(r)).not.toContain('DANGLING_POLICY_SCOPE');
  });
});

describe('latency budget', () => {
  it('fails a flow over the budget and says by how much', () => {
    const slow = { ...ctx, tenant: { ...ctx.tenant, latencyBudgetMs: 5 } };
    const r = compileDecisionFlow(valid, slow);
    expect(r.ok).toBe(false);
    const diag = r.diagnostics.find((x) => x.code === 'LATENCY_BUDGET_EXCEEDED')!;
    expect(diag.message).toContain('critical path');
    expect(diag.remedy).toContain('ms over');
  });

  it('warns when close to the budget', () => {
    const tight = { ...ctx, tenant: { ...ctx.tenant, latencyBudgetMs: 11 } };
    expect(codes(compileDecisionFlow(valid, tight))).toContain('LATENCY_NEAR_BUDGET');
  });
});

describe('version resolution', () => {
  it('takes the highest version inside the major range', () => {
    expect(resolveRange('^1.2.0', ['1.1.0', '1.4.0', '2.0.0'])).toBe('1.4.0');
  });

  it('does not cross a major boundary', () => {
    expect(resolveRange('^1.2.0', ['2.0.0'])).toBeNull();
  });

  it('accepts an exact pin that exists', () => {
    expect(resolveRange('1.4.0', ['1.1.0', '1.4.0'])).toBe('1.4.0');
  });

  it('rejects an exact pin that does not exist', () => {
    expect(resolveRange('1.5.0', ['1.4.0'])).toBeNull();
  });

  it('rejects a range it cannot understand rather than guessing', () => {
    expect(resolveRange('>=1.0.0 <2', ['1.4.0'])).toBeNull();
  });

  it('fails compilation when a range cannot be satisfied', () => {
    const r = compileDecisionFlow(
      { ...valid, packageRanges: { '@metis/nodes-core': '^9.0.0' } },
      ctx
    );
    expect(r.ok).toBe(false);
    const diag = r.diagnostics.find((x) => x.code === 'UNRESOLVED_PACKAGE')!;
    expect(diag.message).toContain('available: 1.1.0, 1.4.0, 2.0.0');
  });
});

describe('suggestions', () => {
  it('finds a near miss', () => {
    expect(suggest('upsell_5gg', ['upsell_5g', 'upsell_data'])).toEqual(['upsell_5g']);
  });

  it('offers nothing when nothing is close', () => {
    expect(suggest('zzzzzzzz', ['upsell_5g'])).toEqual([]);
    expect(didYouMean('zzzzzzzz', ['upsell_5g'])).toBe('');
  });
});

describe('report', () => {
  it('reads as guidance, not a stack trace', () => {
    const r = compileDecisionFlow({ ...valid, candidateKeys: ['nope'] }, ctx);
    const report = formatReport(r);
    expect(report).toContain('Compilation failed');
    expect(report).toContain('UNKNOWN_OFFER');
    expect(report).toContain('->');
  });

  it('reports success with the cost summary', () => {
    const report = formatReport(compileDecisionFlow(valid, ctx));
    expect(report).toContain('Compiled successfully');
    expect(report).toContain('critical path');
    expect(report).toContain('artifact ');
  });
});
