/**
 * Compilation results for the tenant's strategies.
 *
 * Every strategy in ./artifacts.ts is put through the real compiler against the
 * real catalogue. The console shows what it says, including the warnings - a
 * compiler whose findings are hidden is no better than no compiler.
 *
 * Deterministic: the same sources and catalogue always give the same result,
 * and the artifact hash does not include the compile timestamp.
 */

import {
  compileStrategy,
  type CompileContext,
  type CompileResult,
  type StrategySource,
} from '@metis/compiler/strategy/compile';
import {
  issues,
  groups,
  propositions,
  engagementPolicies,
  contactPolicies,
  arbitrationConfig,
} from './catalogue';
import { artifacts, type ArtifactSummary } from './artifacts';

/** Versions the registry has published, for range resolution. */
const AVAILABLE_PACKAGES: Record<string, string[]> = {
  '@metis/nodes-core': ['1.1.0', '1.2.0', '1.4.0'],
  '@metis/core': ['2.0.0', '2.1.0'],
};

export const compileContext: CompileContext = {
  propositions,
  engagementPolicies,
  contactPolicies,
  arbitration: arbitrationConfig,
  availablePackages: AVAILABLE_PACKAGES,
  knownScopeTargets: {
    issues: issues.map((i) => i.id),
    groups: groups.map((g) => g.id),
  },
  tenant: { id: 'telco-uk', latencyBudgetMs: 50, maxNodes: 100 },
};

function toSource(a: ArtifactSummary): StrategySource {
  return {
    id: a.id,
    version: a.activeVersion,
    tenantId: 'telco-uk',
    candidateKeys: a.candidateKeys,
    packageRanges: { '@metis/nodes-core': '^1.2.0', '@metis/core': '^2.0.0' },
    nodes: a.nodes.map((n) => ({
      id: n.id,
      type: n.type as StrategySource['nodes'][number]['type'],
      label: n.label,
      policyIds: n.policyIds,
      model: n.model,
      estimatedMs: n.estimatedMs,
    })),
    edges: a.edges.map((e) => ({ from: e.source, to: e.target })),
  };
}

export interface StrategyCompilation {
  artifactId: string;
  result: CompileResult;
}

export const compilations: StrategyCompilation[] = artifacts.map((a) => ({
  artifactId: a.id,
  result: compileStrategy(toSource(a), compileContext),
}));

const byId = new Map(compilations.map((c) => [c.artifactId, c]));

export function findCompilation(artifactId: string): StrategyCompilation | undefined {
  return byId.get(artifactId);
}
