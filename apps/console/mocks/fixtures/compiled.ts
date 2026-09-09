/**
 * Compilation results for the tenant's flows.
 *
 * Every flow in ./artifacts.ts is put through the real compiler against the
 * real catalogue. The console shows what it says, including the warnings - a
 * compiler whose findings are hidden is no better than no compiler.
 *
 * Deterministic: the same sources and catalogue always give the same result,
 * and the artifact hash does not include the compile timestamp.
 */

import {
  compileDecisionFlow,
  type CompileContext,
  type CompileResult,
  type DecisionFlowSource,
} from '@metis/compiler/decision-flow/compile';
import {
  objectives,
  categories,
  offers,
  targetingPolicies,
  frequencyPolicies,
  arbitrationConfig,
  connectors,
} from './catalogue';
import { artifacts, type ArtifactSummary } from './artifacts';
import { profileSchema } from './profile-schema';

/** Versions the registry has published, for range resolution. */
const AVAILABLE_PACKAGES: Record<string, string[]> = {
  '@metis/nodes-core': ['1.1.0', '1.2.0', '1.4.0'],
  '@metis/core': ['2.0.0', '2.1.0'],
};

export const compileContext: CompileContext = {
  offers,
  targetingPolicies,
  frequencyPolicies,
  arbitration: arbitrationConfig,
  availablePackages: AVAILABLE_PACKAGES,
  knownScopeTargets: {
    objectives: objectives.map((i) => i.id),
    categories: categories.map((g) => g.id),
  },
  connectors,
  // The declared data model. With it, policy conditions are checked in full —
  // every path segment, the operator against the field's type, the value
  // against its type and enum members — rather than only the root segment,
  // which is all a connector can supply and all the previous check could see.
  profileSchema,
  tenant: { id: 'telco-uk', latencyBudgetMs: 50, maxNodes: 100 },
};

/**
 * A flow as authored, from the console's view of it.
 *
 * Exported because the registry publishes from this shape: what the console
 * shows and what the registry compiles must be the same source, or the
 * compiler's verdict on screen is about something else.
 */
export function toSource(a: ArtifactSummary): DecisionFlowSource {
  return {
    id: a.id,
    version: a.activeVersion,
    tenantId: 'telco-uk',
    candidateKeys: a.candidateKeys,
    packageRanges: { '@metis/nodes-core': '^1.2.0', '@metis/core': '^2.0.0' },
    nodes: a.nodes.map((n) => ({
      id: n.id,
      type: n.type as DecisionFlowSource['nodes'][number]['type'],
      label: n.label,
      policyIds: n.policyIds,
      model: n.model,
      // Connector latency joins the critical path, so a source without this
      // compiles against a budget that ignores its integrations.
      connectorIds: n.connectorIds,
      estimatedMs: n.estimatedMs,
    })),
    edges: a.edges.map((e) => ({ from: e.source, to: e.target })),
  };
}

export interface FlowCompilation {
  artifactId: string;
  result: CompileResult;
}

export const compilations: FlowCompilation[] = artifacts.map((a) => ({
  artifactId: a.id,
  result: compileDecisionFlow(toSource(a), compileContext),
}));

const byId = new Map(compilations.map((c) => [c.artifactId, c]));

export function findCompilation(artifactId: string): FlowCompilation | undefined {
  return byId.get(artifactId);
}
