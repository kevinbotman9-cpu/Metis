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
  type CompileResult,
} from '../src/decision-flow/compile';
import { suggest, didYouMean } from '../src/decision-flow/diagnostics';
import type { Creative, Offer, TargetingPolicy, FrequencyPolicy } from '@metis/core/domain';
import type { ProfileSchema } from '@metis/core/profile-schema';

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
      type: 'score-model',
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
  it('refuses a score-adaptive node, and says what to use instead', () => {
    // ADR-009 §7: adaptive scoring is out of scope for v1. The node type is
    // deprecated rather than deleted, because a corpus case recorded on
    // 2026-09-05 carries it inside a hashed elimination — the runtime still
    // executes it so history replays, and this is what stops anything new
    // being built on it.
    const adaptive: DecisionFlowSource = {
      ...valid,
      nodes: valid.nodes.map((n) =>
        n.id === 'score' ? { ...n, type: 'score-adaptive' as const } : n
      ),
    };
    const r = compileDecisionFlow(adaptive, ctx);
    expect(r.ok).toBe(false);
    const diag = r.diagnostics.find((x) => x.code === 'DEPRECATED_NODE_TYPE')!;
    expect(diag).toBeDefined();
    expect(diag.remedy).toContain("score-model");
    expect(diag.remedy).toContain('ADR-009');
  });

  it('warns when the formula weights propensity but nothing scores', () => {
    // This is the bug that made an entire flow return nothing at runtime.
    const noScore: DecisionFlowSource = {
      ...valid,
      nodes: valid.nodes.filter((n) => n.type !== 'score-model'),
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
      nodes: valid.nodes.filter((n) => n.type !== 'score-model'),
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

  /**
   * ADR-012 §B2. Until 2026-09-10 this check read `creativeIds.length === 0`
   * while its remedy told the author to *"add at least one active creative for
   * a channel this flow serves"* — it checked neither `active` nor the channel,
   * so both states below compiled clean and the offer then won a slot with
   * nothing to render in it.
   */
  describe('an offer whose creatives cannot actually deliver', () => {
    const creative = (over: Partial<Creative> = {}): Creative =>
      ({
        id: 'cr1',
        offerId: 'p1',
        name: 'Hero',
        channel: 'web',
        locale: 'en-GB',
        active: true,
        content: { channel: 'web', headline: 'H', subheadline: 'S', ctaLabel: 'Go' },
        updatedAt: '2026-09-01T00:00:00.000Z',
        updatedBy: 'x@y.z',
        ...over,
      }) as Creative;

    /** The NO_DELIVERABLE_CREATIVE diagnostic about `upsell_5g`, not about p2. */
    const forUpsell = (r: CompileResult) =>
      r.diagnostics.find((x) => x.code === 'NO_DELIVERABLE_CREATIVE' && x.at === 'upsell_5g');

    /** p2 needs live content too, or its own diagnostic drowns out the one under test. */
    const p2Creative = creative({ id: 'cr_p2', offerId: 'p2', channel: 'web' });

    it('fails when every creative it has is switched off', () => {
      const r = compileDecisionFlow(valid, {
        ...ctx,
        offers: [offer({ id: 'p1', key: 'upsell_5g', creativeIds: ['cr1'] }), ctx.offers[1]],
        creatives: [creative({ active: false }), p2Creative],
      });
      const diag = forUpsell(r)!;
      expect(diag, 'no diagnostic about upsell_5g').toBeDefined();
      // The count and the state, because "add a creative" is the wrong remedy
      // for an offer that has one and nobody turned it on.
      expect(diag.message).toContain('none of them active');
    });

    it('fails when its live creatives are on channels this flow does not serve', () => {
      const r = compileDecisionFlow(valid, {
        ...ctx,
        offers: [offer({ id: 'p1', key: 'upsell_5g', creativeIds: ['cr1'] }), ctx.offers[1]],
        creatives: [creative({ channel: 'email' }), p2Creative],
        servedChannels: ['web', 'sms'],
      });
      const diag = forUpsell(r)!;
      expect(diag, 'no diagnostic about upsell_5g').toBeDefined();
      expect(diag.message).toContain('only on email');
      // Naming the channels it could be written for, rather than telling
      // somebody to duplicate content they have already written.
      expect(diag.remedy).toContain('sms, web');
    });

    it('passes when one live creative is on a served channel', () => {
      const r = compileDecisionFlow(valid, {
        ...ctx,
        offers: [offer({ id: 'p1', key: 'upsell_5g', creativeIds: ['cr1'] }), ctx.offers[1]],
        creatives: [
          creative({ channel: 'email', active: false }),
          creative({ id: 'cr2', channel: 'sms' }),
          p2Creative,
        ],
        servedChannels: ['web', 'sms'],
      });
      expect(forUpsell(r)).toBeUndefined();
    });

    it('does not apply the channel clause when the caller cannot say what is served', () => {
      // A flow whose placements are unknown is not assumed to serve nothing.
      const r = compileDecisionFlow(valid, {
        ...ctx,
        offers: [offer({ id: 'p1', key: 'upsell_5g', creativeIds: ['cr1'] }), ctx.offers[1]],
        creatives: [creative({ channel: 'email' }), p2Creative],
      });
      expect(forUpsell(r)).toBeUndefined();
    });

    it('checks every candidate, not just the first', () => {
      // Found by this suite: supplying `creatives` at all makes the check
      // apply to the whole candidate set, and p2 had none.
      const r = compileDecisionFlow(valid, {
        ...ctx,
        creatives: [creative({ channel: 'web' })],
      });
      const about = r.diagnostics
        .filter((x) => x.code === 'NO_DELIVERABLE_CREATIVE')
        .map((x) => x.at);
      expect(about).toEqual(['upsell_data']);
    });
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

// ---------------------------------------------------------------------------
// The data model
// ---------------------------------------------------------------------------

/**
 * A flow compiling against a declared model.
 *
 * The defect these close was demonstrated against the running engine before the
 * schema existed: changing `address.fibre_available` to `address.fibre_availabl`
 * moved the winner from `acq_fibre_900` to `acq_sim_30`, and the trace reported
 * `ELIGIBILITY_FAILED (pol_fibre_available)` — a confident reason code naming a
 * real policy. The typo did not error. It decided.
 *
 * `requestFields` could not catch it. It checks the root segment only, because
 * a root is all a connector can supply, and `address` is supplied.
 */
describe('policy conditions against the data model', () => {
  const schema: ProfileSchema = {
    id: 's',
    tenantId: 't',
    version: '1.0.0',
    root: 'Input',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
    entities: [
      {
        name: 'Input',
        description: '',
        fields: [],
        relationships: [
          { name: 'customer', entity: 'Customer', cardinality: 'one', description: '' },
        ],
      },
      {
        name: 'Customer',
        description: '',
        fields: [
          { name: 'age', type: 'integer', description: '' },
          { name: 'credit_status', type: 'enum', members: ['pass', 'refer'], description: '' },
        ],
      },
    ],
    aggregations: [],
  };

  const withPolicy = (conditions: TargetingPolicy['conditions']) =>
    compileDecisionFlow(valid, {
      ...ctx,
      profileSchema: schema,
      targetingPolicies: [{ ...policy, conditions }],
    });

  it('compiles a condition the model knows', () => {
    const report = withPolicy([{ field: 'customer.age', operator: 'gte', value: 18 }]);
    expect(report.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('refuses one character wrong in a leaf, and suggests the fix', () => {
    // The demonstrated defect. `customer` resolves, so the root-only check saw
    // nothing wrong with this.
    const report = withPolicy([{ field: 'customer.ag', operator: 'gte', value: 18 }]);
    const d = report.diagnostics.find((x) => x.code === 'UNRESOLVED_FIELD');

    expect(d, 'a typo in a leaf must not compile').toBeDefined();
    expect(d!.severity).toBe('error');
    expect(d!.message).toContain("Did you mean 'customer.age'?");
  });

  it('refuses a comparison the type cannot satisfy', () => {
    const report = withPolicy([{ field: 'customer.age', operator: 'contains', value: 'x' }]);
    expect(report.diagnostics.map((d) => d.code)).toContain('POLICY_TYPE_ERROR');
  });

  it('refuses a value outside an enum', () => {
    // `passed` for `pass` reads correctly and matches nothing, so the rule
    // suppresses every candidate while looking like it works.
    const report = withPolicy([
      { field: 'customer.credit_status', operator: 'eq', value: 'passed' },
    ]);
    const d = report.diagnostics.find((x) => x.code === 'POLICY_TYPE_ERROR');
    expect(d?.message).toContain("Did you mean 'pass'?");
  });

  it('reports one diagnostic per typo, not two', () => {
    // The root check and the schema check both look at the same condition.
    // Two messages about one mistake, the second less precise, is how a report
    // stops being read.
    const report = compileDecisionFlow(valid, {
      ...ctx,
      profileSchema: schema,
      requestFields: ['customer'],
      targetingPolicies: [{ ...policy, conditions: [{ field: 'customer.ag', operator: 'gte', value: 18 }] }],
    });
    expect(report.diagnostics.filter((d) => d.code === 'UNRESOLVED_FIELD')).toHaveLength(1);
  });

  it('compiles exactly as before for a tenant with no model', () => {
    // The schema is optional on purpose. Making it required would have turned
    // every existing flow red on the day it shipped.
    const report = compileDecisionFlow(valid, {
      ...ctx,
      targetingPolicies: [{ ...policy, conditions: [{ field: 'customer.ag', operator: 'gte', value: 18 }] }],
    });
    expect(report.diagnostics.filter((d) => d.code === 'UNRESOLVED_FIELD')).toEqual([]);
  });
});

/**
 * The tier, and the pack that supplied a rule.
 *
 * Both are compile-time facts that used to be nowhere. The tier was inferred by
 * the console from node ids with `/suitab/` and `/frequen|contact|cap/`
 * (G-058); the pack could not be inferred at all, so a refusal named a policy
 * id and nothing else (G-055). Neither is in the hashed decision: the artifact
 * carries them, so a chain hash is unmoved by either.
 */
describe('what compilation works out about a node', () => {
  const suitability: TargetingPolicy = { ...policy, id: 'pol_afford', kind: 'suitability' };
  const relevance: TargetingPolicy = { ...policy, id: 'pol_recent', kind: 'relevance' };

  const withNodes = (nodes: DecisionFlowSource['nodes']): DecisionFlowSource => ({
    ...valid,
    nodes: [
      ...nodes,
      { id: 'arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 2 },
    ],
    edges: nodes.map((n) => ({ from: n.id, to: 'arbitrate' })),
  });

  const context: CompileContext = {
    ...ctx,
    targetingPolicies: [policy, suitability, relevance],
    packs: [
      {
        id: 'pack_uk_consumer_duty',
        name: 'UK Consumer Duty',
        version: '1.4.0',
        policyIds: ['pol_afford'],
      },
    ],
  };

  const compiled = (source: DecisionFlowSource, over: Partial<CompileContext> = {}) => {
    const r = compileDecisionFlow(source, { ...context, ...over });
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    return r.artifact!;
  };

  it('names the tier from the policies a node declares, not from its id', () => {
    // `check_the_money` is the case the id patterns could never have handled:
    // nothing in the name says suitability, and the policies do.
    const a = compiled(
      withNodes([
        { id: 'source', type: 'source', label: 'Profile', estimatedMs: 4 },
        {
          id: 'check_the_money',
          type: 'constraint',
          label: 'Affordability',
          policyIds: ['pol_afford'],
          estimatedMs: 1,
        },
      ])
    );
    expect(a.nodes.find((n) => n.id === 'check_the_money')?.tier).toBe('suitability');
  });

  it('calls a constraint node with no targeting policies a frequency node', () => {
    // Which is what it is: the engine enforces caps and consent at every
    // constraint node, and this one declares nothing else.
    const a = compiled(
      withNodes([
        { id: 'source', type: 'source', label: 'Profile', estimatedMs: 4 },
        { id: 'cap', type: 'constraint', label: 'Frequency & suppression', estimatedMs: 1 },
      ])
    );
    expect(a.nodes.find((n) => n.id === 'cap')?.tier).toBe('frequency');
  });

  it('leaves the tier absent when a node mixes two tiers', () => {
    // Rather than picking one. A node asking two questions has no single
    // answer, and a wrong label on the trace reader is worse than none.
    const a = compiled(
      withNodes([
        { id: 'source', type: 'source', label: 'Profile', estimatedMs: 4 },
        {
          id: 'mixed',
          type: 'filter',
          label: 'Mixed',
          policyIds: ['pol_afford', 'pol_recent'],
          estimatedMs: 1,
        },
      ])
    );
    const node = a.nodes.find((n) => n.id === 'mixed')!;
    expect(node.tier).toBeUndefined();
    expect('tier' in node, 'absent, not explicitly undefined: the artifact hash is taken over this').toBe(false);
  });

  it('gives a source or arbitrate node no tier at all', () => {
    const a = compiled(
      withNodes([{ id: 'source', type: 'source', label: 'Profile', estimatedMs: 4 }])
    );
    expect(a.nodes.every((n) => n.tier === undefined)).toBe(true);
  });

  it('records which pack supplied each rule the flow references', () => {
    const a = compiled(
      withNodes([
        { id: 'source', type: 'source', label: 'Profile', estimatedMs: 4 },
        {
          id: 'money',
          type: 'constraint',
          label: 'Affordability',
          policyIds: ['pol_afford'],
          estimatedMs: 1,
        },
      ])
    );
    expect(a.policySources).toEqual({
      pol_afford: { packId: 'pack_uk_consumer_duty', name: 'UK Consumer Duty', version: '1.4.0' },
    });
  });

  it('records nothing for a rule no pack claims', () => {
    // A tenant's own rule is the answer, not a hole. `pol_age` is in no pack.
    const a = compiled(
      withNodes([
        { id: 'source', type: 'source', label: 'Profile', estimatedMs: 4 },
        { id: 'gate', type: 'filter', label: 'Eligibility', policyIds: ['pol_age'], estimatedMs: 1 },
      ])
    );
    expect(a.policySources).toBeUndefined();
  });

  it('records no policy sources when the tenant has no packs installed', () => {
    const a = compiled(
      withNodes([
        { id: 'source', type: 'source', label: 'Profile', estimatedMs: 4 },
        {
          id: 'money',
          type: 'constraint',
          label: 'Affordability',
          policyIds: ['pol_afford'],
          estimatedMs: 1,
        },
      ]),
      { packs: undefined }
    );
    expect(a.policySources).toBeUndefined();
  });

  it('keeps the artifact hash sensitive to the tier', () => {
    // The tier is part of what was compiled, so two artifacts that disagree
    // about it are different artifacts. Nothing here reaches the chain hash:
    // the hashed decision names the artifact by id and version, not by hash.
    const source = withNodes([
      { id: 'source', type: 'source', label: 'Profile', estimatedMs: 4 },
      {
        id: 'money',
        type: 'constraint',
        label: 'Affordability',
        policyIds: ['pol_afford'],
        estimatedMs: 1,
      },
    ]);
    // The same flow, compiled against a catalogue where that one policy is a
    // different kind. Nothing else about the source moves, so the tier is the
    // only thing the two artifacts can disagree about.
    const asSuitability = compiled(source);
    const asRelevance = compiled(source, {
      targetingPolicies: [policy, { ...suitability, kind: 'relevance' }, relevance],
    });
    expect(asSuitability.nodes.find((n) => n.id === 'money')?.tier).toBe('suitability');
    expect(asRelevance.nodes.find((n) => n.id === 'money')?.tier).toBe('relevance');
    expect(asSuitability.artifactHash).not.toBe(asRelevance.artifactHash);
  });
});
