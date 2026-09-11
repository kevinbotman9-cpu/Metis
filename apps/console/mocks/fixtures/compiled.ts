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
  packs,
  targetingPolicies,
  frequencyPolicies,
  arbitrationConfig,
  connectors,
  creatives,
  placements,
} from './catalogue';
import { artifacts, type ArtifactSummary } from './artifacts';
import { profileSchema } from './profile-schema';

/** Versions the registry has published, for range resolution. */
const AVAILABLE_PACKAGES: Record<string, string[]> = {
  '@metis/nodes-core': ['1.1.0', '1.2.0', '1.4.0'],
  '@metis/core': ['2.0.0', '2.1.0'],
};

/**
 * What a flow compiles against, from whichever catalogue is asking.
 *
 * There is one question — *does this flow compile* — and until 2026-09-11 it
 * had three answers. `compilations` below compiled with `servedChannels`;
 * `seedRegistry` published without them, so ADR-012 §B2's channel-aware
 * `NO_DELIVERABLE_CREATIVE` fell back to *"has an id in `creativeIds`"* and
 * accepted a flow the console showed as broken; and the route built a third
 * with its own copy of the channel lookup. `retention-outbound` was live
 * because one of them said yes (G-071).
 *
 * So the context is built here, once, and the caller supplies the catalogue it
 * wants judged: the fixtures for a seeded compile, the store for a live one.
 * The per-flow part — which channels this flow's own slots deliver on — is
 * computed from that same catalogue rather than from a second lookup.
 */
export interface CompileSources {
  offers: typeof offers;
  targetingPolicies: typeof targetingPolicies;
  frequencyPolicies: typeof frequencyPolicies;
  connectors: typeof connectors;
  arbitration: typeof arbitrationConfig;
  profileSchema: typeof profileSchema;
  creatives: typeof creatives;
  placements: typeof placements;
}

/** The fixtures, for a seeded compile. */
export const FIXTURE_SOURCES: CompileSources = {
  offers,
  targetingPolicies,
  frequencyPolicies,
  connectors,
  arbitration: arbitrationConfig,
  profileSchema,
  creatives,
  placements,
};

export function compileContextFor(
  flowId: string,
  from: CompileSources = FIXTURE_SOURCES
): CompileContext {
  return {
    ...compileContext,
    offers: from.offers,
    targetingPolicies: from.targetingPolicies,
    frequencyPolicies: from.frequencyPolicies,
    connectors: from.connectors,
    arbitration: from.arbitration,
    profileSchema: from.profileSchema,
    // ADR-012 §B2. Without these two the check falls back to "has an id in
    // creativeIds", which an offer whose only creative is switched off, or is
    // written for a channel nobody serves, satisfies.
    creatives: from.creatives,
    // This flow's own slots — ADR-013 §2. A flow answering an outbound-call
    // slot must not be judged against web because another flow's placement is
    // a web one.
    servedChannels: [
      ...new Set(
        from.placements.filter((p) => p.artifactId === flowId && p.decidable).map((p) => p.channel)
      ),
    ],
  };
}

export const compileContext: CompileContext = {
  offers,
  // Without this the artifact records no policy sources and a refusal can name
  // a rule and no pack, which is the whole of G-055.
  packs,
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
  // ADR-012 §B2. Without these the check falls back to "has an id in
  // `creativeIds`", which an offer whose only creative is switched off, or is
  // written for a channel nobody delivers on, satisfies.
  creatives,
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
  // One builder, shared with `seedRegistry` and the route. They diverged twice:
  // on 2026-09-10 the route had `creatives` and `servedChannels` and this did
  // not, and until 2026-09-11 the registry had neither (G-071).
  result: compileDecisionFlow(toSource(a), compileContextFor(a.id)),
}));

/**
 * The schema pin as the registry publishes it.
 *
 * The pin is over the schema's content, so it is the same for every flow; what
 * differs is whether a flow has a compiled artifact to carry it. Taken from a
 * compile against `compileContext` — the context `seedRegistry` publishes with
 * — rather than from `compilations` above, which adds `servedChannels` and
 * therefore rejects `retention-outbound` under ADR-012 §B2 while the registry
 * accepted it.
 *
 * That disagreement is [G-071](../../../docs/gaps.md), and this constant is
 * where it shows: the seeded decisions have to carry the pin the *published*
 * artifact carries, or the corpus stops describing what the route does.
 */
export const schemaPin = compileDecisionFlow(toSource(artifacts[0]), compileContextFor(artifacts[0].id))
  .artifact?.schema;

const byId = new Map(compilations.map((c) => [c.artifactId, c]));

export function findCompilation(artifactId: string): FlowCompilation | undefined {
  return byId.get(artifactId);
}
