/**
 * End-to-end: author -> compile -> execute -> replay.
 *
 * This is the two-plane architecture in one test. The authoring plane produces
 * a flow; the compiler refuses it or pins it; the execution plane runs it
 * deterministically; replay proves the result reproduces.
 *
 * It replaces an older integration test that had been broken for some time and
 * never ran, because the repo had two test runners and this file matched the
 * one nothing invoked.
 */

import { describe, it, expect } from 'vitest';
import {
  compileDecisionFlow,
  type DecisionFlowSource,
  type CompileContext,
} from '../../packages/compiler/src/decision-flow/compile';
import { execute, replay } from '../../packages/runtime/src/deterministic/engine';
import type {
  ExecArtifact,
  CatalogueSnapshot,
  DecisionRequest,
} from '../../packages/runtime/src/deterministic/types';
import type { Offer, TargetingPolicy } from '../../packages/core/src/domain';

const gbp = (amount: number) => ({ amount, currency: 'GBP' as const });

const offer = (
  over: Partial<Offer> & Pick<Offer, 'id' | 'key'>
): Offer =>
  ({
    categoryId: 'grp_mobile',
    objectiveId: 'iss_growth',
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
    creativeIds: ['trt_email'],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'test',
    ...over,
  }) as Offer;

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

const offers = [
  offer({ id: 'p_5g', key: 'upsell_5g', policyIds: ['pol_age'] }),
  offer({
    id: 'p_data',
    key: 'upsell_data',
    financials: {
      price: gbp(800),
      cost: gbp(150),
      expectedMargin: gbp(7800),
      termMonths: 12,
      oneOff: false,
    },
  }),
];

const arbitration = {
  id: 'arb',
  tenantId: 'telco-uk',
  weights: { propensity: 1, value: 1, boost: 1, context: 0.5 },
  utility: { id: 'multiplicative', version: '1.0.0' },
  formula: 'Priority = P^1 x V^1 x L^1 x C^0.5',
  updatedAt: '2026-01-01T00:00:00Z',
  updatedBy: 'test',
};

const compileContext: CompileContext = {
  offers,
  targetingPolicies: [adultOnly],
  frequencyPolicies: [],
  arbitration,
  availablePackages: { '@metis/nodes-core': ['1.1.0', '1.4.0'] },
  knownScopeTargets: { objectives: ['iss_growth'], categories: ['grp_mobile'] },
  tenant: { id: 'telco-uk', latencyBudgetMs: 50, maxNodes: 100 },
};

const catalogue: CatalogueSnapshot = {
  offers,
  targetingPolicies: [adultOnly],
  frequencyPolicies: [],
  arbitration,
  boosts: [],
};

const source: DecisionFlowSource = {
  id: 'next-best-action',
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

const request: DecisionRequest = {
  tenantId: 'telco-uk',
  customerId: 'cust_integration',
  channel: 'email',
  placement: 'weekly_offers_send',
  occurredAt: '2026-09-04T08:00:00.000Z',
  input: { customer: { age: 41 } },
  consent: { marketing: true, profiling: true, thirdParty: false },
};

/** The compiler and the engine agree on the artifact shape. */
function toExecArtifact(
  compiled: NonNullable<ReturnType<typeof compileDecisionFlow>['artifact']>
): ExecArtifact {
  return {
    id: compiled.id,
    version: compiled.version,
    tenantId: compiled.tenantId,
    candidateKeys: compiled.candidateKeys,
    packageVersions: compiled.packageVersions,
    nodes: compiled.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      policyIds: n.policyIds,
      model: n.model,
    })),
    edges: compiled.edges,
  };
}

describe('author -> compile -> execute -> replay', () => {
  it('carries a flow all the way through to a reproducible decision', () => {
    const compiled = compileDecisionFlow(source, compileContext);
    expect(compiled.ok).toBe(true);

    const artifact = toExecArtifact(compiled.artifact!);
    const trace = execute(artifact, catalogue, request);

    expect(trace.decision.winner).not.toBeNull();
    expect(trace.id).toBe(`dec_${trace.chainHash.slice(0, 16)}`);

    const result = replay(artifact, catalogue, trace, request.input);
    expect(result.identical).toBe(true);
  });

  it('carries the pinned versions from the compiler into the trace', () => {
    const compiled = compileDecisionFlow(source, compileContext);
    const artifact = toExecArtifact(compiled.artifact!);
    const trace = execute(artifact, catalogue, request);

    // ^1.2.0 resolved to 1.4.0 at compile time, and the decision records it.
    expect(compiled.artifact!.packageVersions['@metis/nodes-core']).toBe('1.4.0');
    expect(trace.decision.packageVersions['@metis/nodes-core']).toBe('1.4.0');
  });

  it('stays inside the latency budget the compiler proved', () => {
    const compiled = compileDecisionFlow(source, compileContext);
    const cost = compiled.artifact!.costManifest;
    expect(cost.withinBudget).toBe(true);

    const artifact = toExecArtifact(compiled.artifact!);
    const trace = execute(artifact, catalogue, request);
    // The measured run must not exceed the budget the compiler signed off.
    expect(trace.measured.totalMs).toBeLessThan(cost.latencyBudgetMs);
  });

  it('refuses to produce an artifact the runtime could not execute safely', () => {
    // A dangling policy reference would fail at runtime, or worse, silently
    // skip a rule. The compiler stops it reaching the engine at all.
    const broken = compileDecisionFlow(
      {
        ...source,
        nodes: source.nodes.map((n) =>
          n.id === 'gate' ? { ...n, policyIds: ['pol_does_not_exist'] } : n
        ),
      },
      compileContext
    );

    expect(broken.ok).toBe(false);
    expect(broken.artifact).toBeNull();
    expect(broken.diagnostics.map((d) => d.code)).toContain('UNKNOWN_POLICY');
  });

  it('produces the same decision from two independent compilations', () => {
    // Compilation is deterministic, so the whole pipeline is.
    const a = toExecArtifact(compileDecisionFlow(source, compileContext).artifact!);
    const b = toExecArtifact(compileDecisionFlow(source, compileContext).artifact!);

    expect(execute(a, catalogue, request).chainHash).toBe(
      execute(b, catalogue, request).chainHash
    );
  });

  it('changes the decision when the catalogue changes, and replay says so', () => {
    const artifact = toExecArtifact(compileDecisionFlow(source, compileContext).artifact!);
    const original = execute(artifact, catalogue, request);

    const boosted: CatalogueSnapshot = {
      ...catalogue,
      boosts: [
        {
          id: 'lev',
          name: 'Boost data',
          scope: { level: 'offer', targetId: 'p_data' },
          value: 50,
          reason: 'test',
          validity: null,
          updatedAt: '2026-01-01T00:00:00Z',
          updatedBy: 'test',
        },
      ],
    };

    const result = replay(artifact, boosted, original, request.input);
    expect(result.identical).toBe(false);
    // The divergence is attributable, not just a failed boolean.
    expect(result.differences.some((d) => d.path.includes('winner'))).toBe(true);
  });
});
