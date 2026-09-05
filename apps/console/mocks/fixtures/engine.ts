/**
 * Decisions produced by the real execution engine.
 *
 * These are not hand-written any more. Each decision below is the actual output
 * of `@metis/runtime`'s deterministic engine, run over the catalogue in
 * ./catalogue.ts and the flow graphs in ./artifacts.ts. That means:
 *
 *   - the elimination cascade shown in the console is the cascade that really
 *     happened, not prose written to look like one;
 *   - the console's Replay button re-executes the engine and compares chain
 *     hashes, rather than returning a hardcoded "identical";
 *   - a change to a policy or boost changes the decisions, because the engine
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
  DecisionRecord,
} from '@metis/runtime/deterministic/types';
import {
  offers,
  targetingPolicies,
  frequencyPolicies,
  arbitrationConfig,
  boosts,
  connectors,
} from './catalogue';
import { artifacts, type ArtifactSummary } from './artifacts';

/** The catalogue exactly as the engine sees it. */
export const catalogueSnapshot: CatalogueSnapshot = {
  offers,
  targetingPolicies,
  frequencyPolicies,
  arbitration: arbitrationConfig,
  boosts,
  connectors,
};

/** A flow artifact, in the shape the engine executes. */
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
      connectorIds: n.connectorIds,
    })),
    edges: a.edges.map((e) => ({ from: e.source, to: e.target })),
  };
}

export const execArtifacts: ExecArtifact[] = artifacts.map(toExecArtifact);

// ---------------------------------------------------------------------------
// Request generation
// ---------------------------------------------------------------------------

const T0 = Date.parse('2026-09-04T08:00:00Z');

/** Only flows that are live make decisions. */
const LIVE = execArtifacts.filter((a) =>
  artifacts.find((s) => s.id === a.id)?.status === 'active'
);

/**
 * What the connectors would have returned for this customer.
 *
 * Deterministic from the index, like everything else here, so the corpus is
 * byte-identical on every reload. Field names match the bindings the connectors
 * in ./catalogue.ts declare - if one is renamed there and not here, the field
 * silently stops arriving, which is exactly what the compiler's
 * UNRESOLVED_FIELD diagnostic exists to catch.
 */
export function connectorPayload(index: number): Record<string, unknown> {
  const r = (salt: string) => seededUnitInterval('conn', index, salt);
  const arrears = r('arrears') > 0.88 ? Math.floor(r('days') * 60) : 0;

  return {
    // conn_billing_ledger
    monthlySpend: 1200 + Math.floor(r('spend') * 9000),
    arrearsDays: arrears,
    inGoodStanding: arrears === 0,
    // conn_network_usage
    dataUsageGb: Number((r('data') * 120).toFixed(2)),
    roamingDays: Math.floor(r('roam') * 14),
    tenureMonths: Math.floor(r('tenure') * 72),
    // conn_consent_registry
    marketingConsent: r('mkt') > 0.08,
    profilingConsent: r('prof') > 0.12,
  };
}

/**
 * Build a customer input deterministically from its index, spanning the range
 * the policies actually test: age, credit, usage, contract, affordability.
 */
function buildRequest(index: number): DecisionRequest {
  const r = (salt: string) => seededUnitInterval('req', index, salt);

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

      // Fields the connectors supply, at the names they declare.
      //
      // These are recorded, not fetched: the 5,000-decision corpus is built
      // synchronously at import, and resolution is asynchronous because real
      // I/O is. What is stored here is exactly what a real system stores - the
      // input snapshot resolution produced - so the traces carry genuine
      // provenance and the console can show where each field came from.
      //
      // The live path really does resolve. `POST /api/decisions` runs
      // resolveInputs through a gateway before executing, and the resolver
      // itself is covered by 19 tests in packages/runtime.
      ...connectorPayload(index),
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
  trace: DecisionRecord;
  request: DecisionRequest;
  artifact: ExecArtifact;
}

/**
 * Real executions, at a volume the console has to cope with rather than a
 * token sample: a virtualised grid, a search that has to narrow something, and
 * latency percentiles that mean anything all need thousands of rows.
 *
 * At ~0.17ms per decision this costs well under a second, paid once at import.
 */
const DECISION_COUNT = 5000;

export const generated: GeneratedDecision[] = Array.from({ length: DECISION_COUNT }, (_, i) => {
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
