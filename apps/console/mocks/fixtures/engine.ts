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
 *     hashes, rather than returning a hardcoded "identical".
 *
 * Generation is deterministic, so the set is byte-identical on every reload.
 *
 * ## What `catalogueSnapshot` here is, and is not
 *
 * It is the catalogue *these fixture decisions were made against*, frozen at
 * import. It is deliberately not what live decisions use.
 *
 * This comment used to claim a third thing: "a change to a policy or boost
 * changes the decisions, because the engine is reading the same catalogue the
 * UI edits." That was false for as long as it stood. The console writes to
 * `store.*`, which is seeded from these modules and is a separate mutable
 * copy, so publishing arbitration weights persisted, audited, updated the
 * formula on screen, and changed no decision.
 *
 * Live decisions now build their catalogue from the store — see
 * `mocks/catalogue-state.ts`. This snapshot stays frozen on purpose: the 5,000
 * decisions below name its hash, and a snapshot that moved under them would
 * make the console's entire decision history unreplayable.
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
const DAY = 86_400_000;

/** Two years of history, which is what the charts in the console spec show. */
const HISTORY_DAYS = 730;

/**
 * When a decision happened, over 24 months rather than one week.
 *
 * Two shapes are laid over the uniform draw, because a flat two years is as
 * obviously synthetic as a flat catalogue:
 *
 * **Seasonality.** Decision volume peaks in the run-up to Christmas and again
 * in the September back-to-school window, and falls away in midsummer. Applied
 * by pulling the uniform draw toward those months rather than by binning, so
 * the series stays continuous and the daily counts still wobble.
 *
 * **Recency.** Far more traffic is recent than two years old — the platform was
 * ramping. The square favours the recent end without emptying the far one.
 *
 * The hour of day is not uniform either: a consumer telco decides very little
 * at 04:00 and a great deal at 19:00.
 */
function occurredAt(index: number): string {
  const u = seededUnitInterval('when', index);
  const recent = Math.pow(u, 1.6);
  let daysAgo = recent * HISTORY_DAYS;

  // Month-of-year weighting. 1.0 is an average month.
  const SEASON = [0.9, 0.85, 0.95, 1.0, 1.0, 0.95, 0.8, 0.75, 1.15, 1.1, 1.3, 1.45];
  const at = T0 - daysAgo * DAY;
  const month = new Date(at).getUTCMonth();
  const pull = SEASON[month];
  // Shift within its own month rather than across the series, so the weighting
  // changes density without reordering history.
  daysAgo -= (pull - 1) * 9 * seededUnitInterval('season', index);

  const hourBias = [
    0.2, 0.12, 0.08, 0.06, 0.08, 0.18, 0.45, 0.8, 1.0, 1.05, 1.0, 0.95,
    0.9, 0.95, 1.0, 1.05, 1.15, 1.35, 1.5, 1.45, 1.2, 0.9, 0.6, 0.35,
  ];
  let hour = Math.floor(seededUnitInterval('hour', index) * 24);
  if (seededUnitInterval('hourkeep', index) > hourBias[hour] / 1.5) {
    hour = [9, 12, 17, 18, 19, 20][Math.floor(seededUnitInterval('peak', index) * 6)];
  }

  const day = new Date(T0 - Math.max(0, Math.floor(daysAgo)) * DAY);
  day.setUTCHours(hour, Math.floor(seededUnitInterval('min', index) * 60), Math.floor(seededUnitInterval('sec', index) * 60), 0);
  return day.toISOString();
}

/**
 * The churn cohort: customers on their way out, and the reason a demo has
 * something to look at.
 *
 * One customer in eleven is in it. They are near the end of a contract, have
 * requested a PAC code recently, use little data, and — the part that shows on
 * screen — a majority of them have withdrawn marketing consent. That makes
 * their decisions suppress rather than offer, which is visible in the decisions
 * grid as a run of empty winners and in the trace as a consent denial with a
 * named rule. Nothing about it is annotated; it is a property of the data.
 */
function inChurnCohort(index: number): boolean {
  return seededUnitInterval('churn', index) > 0.91;
}

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
  // The consent registry is the record of the same withdrawal the request
  // carries. If these disagreed, the trace would show a provenance line
  // contradicting the consent it acted on.
  const churning = inChurnCohort(index);

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
    marketingConsent: churning ? r('mkt') > 0.72 : r('mkt') > 0.08,
    profilingConsent: churning ? r('prof') > 0.68 : r('prof') > 0.12,
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
  /**
   * Most customers are nowhere near their caps; a minority are at or over one,
   * which is what makes the suppressed cases in the console real.
   *
   * Skewed, not uniform. A uniform 0–3 puts half the population at or over the
   * two-per-week email cap and a quarter over the global three, which made two
   * decisions in three suppress — a decisions grid that reads as broken rather
   * than as governed. In a real week most customers have been contacted no
   * times at all.
   */
  const c = r('contacts');
  const contactsThisWeek = c > 0.94 ? 3 : c > 0.84 ? 2 : c > 0.6 ? 1 : 0;

  // On their way out. Near contract end, a PAC code requested recently, light
  // usage — and mostly without marketing consent, which is what makes their
  // decisions suppress on screen rather than merely look different in a table.
  const churning = inChurnCohort(index);

  return {
    tenantId: 'telco-uk',
    customerId: `cust_${(880000 + index * 137).toString(36)}`,
    channel,
    placement: placements[channel],
    // Fixed relative to T0 so the set does not drift with the wall clock.
    occurredAt: occurredAt(index),
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
        pct_of_allowance_3mo_avg: Number((churning ? r('usage') * 0.3 : r('usage')).toFixed(4)),
        months_of_history: Math.floor(r('history') * 18),
      },
      contract: { days_to_end: churning ? Math.floor(r('contract') * 21) : Math.floor(r('contract') * 200) },
      events: {
        pac_requested_within_days: churning ? Math.floor(r('pac') * 9) : Math.floor(r('pac') * 40),
      },
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
      // The live path really does resolve — as of 2026-09-07, and not before.
      // `POST /api/decisions` runs resolveInputs through a gateway before
      // executing; this comment claimed as much for some time while nothing
      // called the resolver at all. `decision-resolution.test.ts` is what makes
      // the claim checkable, and it fails if the wiring is removed.
      ...connectorPayload(index),
    },
    contactHistory: {
      channel,
      withinPeriod: {
        day: r('day') > 0.9 ? 1 : 0,
        week: contactsThisWeek,
        month: r('month') > 0.72 ? 1 : 0,
      },
    },
    consent: {
      // Withdrawing consent is most of what leaving looks like before it
      // happens, so the cohort carries it and the suppressions follow.
      marketing: churning ? r('consent') > 0.72 : r('consent') > 0.08,
      profiling: churning ? r('profiling') > 0.68 : r('profiling') > 0.1,
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
 */
export const DECISION_COUNT = 10_400;

/**
 * One decision, executed on demand.
 *
 * **Why this is not an array any more.** Executing all 10,400 up front costs
 * about thirteen seconds, and it was paid on every import — the dev server,
 * Storybook, and every test file that touches a fixture. Holding the results
 * costs more still: the full traces serialise to 80 MB, because each carries
 * its elimination cascade and a score line per candidate.
 *
 * So the flat rows the grid, the search and the charts read are generated once
 * by `scripts/build-decision-index.mjs` and committed (1.5 MB), and a full
 * trace is re-executed here the moment somebody opens one. That costs about
 * 0.6ms, which is imperceptible, and it is the same execution that produced
 * the committed row — the cascade shown is still one that really happened.
 *
 * Memoised, because the trace reader, the replay endpoint and the audit view
 * all ask for the same decision within a page load.
 */
const cache = new Map<number, GeneratedDecision>();

export function executeAt(index: number): GeneratedDecision {
  const hit = cache.get(index);
  if (hit) return hit;

  const request = buildRequest(index);
  const artifact = LIVE[index % LIVE.length];
  const made = { trace: execute(artifact, catalogueSnapshot, request), request, artifact };
  cache.set(index, made);
  return made;
}

/** Every decision, in the order they were made. Executes as it goes. */
export function* everyDecision(): Generator<GeneratedDecision> {
  for (let i = 0; i < DECISION_COUNT; i++) yield executeAt(i);
}

export function findExecArtifact(id: string): ExecArtifact | undefined {
  return execArtifacts.find((a) => a.id === id);
}
