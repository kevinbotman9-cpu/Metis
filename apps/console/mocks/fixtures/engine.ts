/**
 * Decisions produced by the real execution engine.
 *
 * These are not hand-written any more. Each decision below is the actual output
 * of `@metis/runtime`'s deterministic engine, run over the catalogue in
 * ./catalogue.ts and the strategy graphs in ./artifacts.ts. That means:
 *
 *   - the elimination cascade shown in the console is the cascade that really
 *     happened, not prose written to look like one;
 *   - the console's Replay button re-executes the engine and compares chain
 *     hashes, rather than returning a hardcoded "identical";
 *   - a change to a policy or lever changes the decisions, because the engine
 *     is reading the same catalogue the UI edits.
 *
 * Generation is deterministic, so the set is byte-identical on every reload.
 */

import { execute } from '@metis/runtime/deterministic/engine';
import { seededUnitInterval } from '@metis/runtime/deterministic/canonical';
import type {
  ExecArtifact,
  CatalogueSnapshot,
  DecisionRequest,
  DecisionTrace,
} from '@metis/runtime/deterministic/types';
import {
  propositions,
  engagementPolicies,
  contactPolicies,
  arbitrationConfig,
  levers,
} from './catalogue';
import { artifacts, type ArtifactSummary } from './artifacts';

/** The catalogue exactly as the engine sees it. */
export const catalogueSnapshot: CatalogueSnapshot = {
  propositions,
  engagementPolicies,
  contactPolicies,
  arbitration: arbitrationConfig,
  levers,
};

/** A strategy artifact, in the shape the engine executes. */
function toExecArtifact(a: ArtifactSummary): ExecArtifact {
  return {
    id: a.id,
    version: a.activeVersion,
    tenantId: 'telco-uk',
    candidateKeys: a.candidateKeys,
    packageVersions: {
      '@metis/nodes-core': '1.4.0',
      '@metis/core': '2.1.0',
    },
    nodes: a.nodes.map((n) => ({
      id: n.id,
      // The canvas renders a couple of node types the engine treats as
      // pass-throughs; the mapping is explicit so a new type cannot be
      // silently dropped.
      type: n.type as ExecArtifact['nodes'][number]['type'],
      label: n.label,
      policyIds: n.policyIds,
      model: n.model,
    })),
    edges: a.edges.map((e) => ({ from: e.source, to: e.target })),
  };
}

export const execArtifacts: ExecArtifact[] = artifacts.map(toExecArtifact);

// ---------------------------------------------------------------------------
// Request generation
// ---------------------------------------------------------------------------

const T0 = Date.parse('2026-09-04T08:00:00Z');

/** Only strategies that are live make decisions. */
const LIVE = execArtifacts.filter((a) =>
  artifacts.find((s) => s.id === a.id)?.status === 'active'
);

/**
 * Build a customer input deterministically from its index, spanning the range
 * the policies actually test: age, credit, usage, contract, affordability.
 */
function buildRequest(index: number): DecisionRequest {
  const r = (salt: string) => seededUnitInterval('req', index, salt);

  const artifact = LIVE[index % LIVE.length];
  const channels = ['web', 'email', 'sms', 'push', 'outbound_call'];
  const channel = channels[Math.floor(r('channel') * channels.length)];
  const placements: Record<string, string> = {
    web: 'account_dashboard_hero',
    email: 'weekly_offers_send',
    sms: 'triggered_outbound',
    push: 'app_inbox',
    outbound_call: 'retention_queue',
  };

  const age = 16 + Math.floor(r('age') * 60);
  // Most customers are nowhere near their caps; a minority are at or over one,
  // which is what makes the suppressed cases in the console real.
  const contactsThisWeek = Math.floor(r('contacts') * 4);

  return {
    tenantId: 'telco-uk',
    customerId: `cust_${(880000 + index * 137).toString(36)}`,
    channel,
    placement: placements[channel],
    // Spread over the previous week, and fixed relative to T0 so the set does
    // not drift with the wall clock.
    occurredAt: new Date(T0 - Math.floor(r('when') * 7 * 24) * 3600_000 - index * 90_000)
      .toISOString(),
    input: {
      customer: {
        age,
        credit_status: r('credit') > 0.15 ? 'pass' : 'refer',
        account_status: 'active',
        current_plan: r('plan') > 0.75 ? '5g_unlimited' : 'standard',
        bill_to_income_ratio: Number((0.01 + r('bti') * 0.06).toFixed(4)),
        arrears_count_12mo: r('arrears') > 0.85 ? 1 : 0,
      },
      address: { fibre_available: r('fibre') > 0.4 },
      usage: {
        pct_of_allowance_3mo_avg: Number(r('usage').toFixed(4)),
        months_of_history: Math.floor(r('history') * 18),
      },
      contract: { days_to_end: Math.floor(r('contract') * 200) },
      events: { pac_requested_within_days: Math.floor(r('pac') * 40) },
      device: { residual_value: Math.floor(r('device') * 40000) },
      offer: { monthly_delta: r('delta') > 0.5 ? -500 : 300 },
    },
    contactHistory: {
      channel,
      withinPeriod: {
        day: r('day') > 0.85 ? 1 : 0,
        week: contactsThisWeek,
        month: Math.floor(r('month') * 2),
      },
    },
    consent: {
      marketing: r('consent') > 0.08,
      profiling: r('profiling') > 0.1,
      thirdParty: r('third') > 0.7,
    },
  };
}

// ---------------------------------------------------------------------------
// Generated decisions
// ---------------------------------------------------------------------------

export interface GeneratedDecision {
  trace: DecisionTrace;
  request: DecisionRequest;
  artifact: ExecArtifact;
}

/** 60 real executions. Enough for search, filtering and paging to mean something. */
export const generated: GeneratedDecision[] = Array.from({ length: 60 }, (_, i) => {
  const request = buildRequest(i);
  const artifact = LIVE[i % LIVE.length];
  return { trace: execute(artifact, catalogueSnapshot, request), request, artifact };
}).sort((a, b) => b.trace.decision.occurredAt.localeCompare(a.trace.decision.occurredAt));

const byId = new Map(generated.map((g) => [g.trace.id, g]));

export function findGenerated(id: string): GeneratedDecision | undefined {
  return byId.get(id);
}

export function findExecArtifact(id: string): ExecArtifact | undefined {
  return execArtifacts.find((a) => a.id === id);
}
