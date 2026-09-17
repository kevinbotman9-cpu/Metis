/**
 * What happened after the decisions.
 *
 * Outcomes have been recorded since the ledger existed and **nothing read
 * them** — confirmed by grep across every package source when the gap was
 * registered. `POST /outcomes` stored, `outcomesFor` fetched one decision's
 * worth, and no surface joined the two. So the platform could tell you what it
 * decided and never whether it worked.
 *
 * This is the join, and it is deliberately arithmetic rather than analysis.
 * Attribution modelling, uplift and incrementality are all statistical claims
 * that would be unfalsifiable inside a platform whose selling point is that
 * every number is traceable to its source. What is here counts things, and
 * every count is reachable back to the decisions behind it.
 *
 * ## Three rules the numbers follow
 *
 * **Distinct decisions, not events.** A channel that fires an impression twice
 * must not report two impressions of one offer, and a rate computed over event
 * counts can exceed 1 — which is the tell that it was measuring the wrong
 * thing.
 *
 * **A rate is over what was observed, not over what was offered.** An offer
 * made 146 times that no channel ever reported back on has no acceptance rate.
 * Dividing by 146 gives 0.0%, which reads as "we measured and nobody took it"
 * — the opposite of the truth, which is that nobody said. The denominator is
 * the decisions with an outcome, and the coverage is reported beside it so the
 * reader can see how much of the picture is missing.
 *
 * **A suppressed decision is not a failed offer.** Decisions that offered
 * nothing are counted on their own, because folding them into a denominator
 * would make every policy that works look like an offer that did not.
 */

import type { LedgerEntry, OutcomeEvent, OutcomeType } from './types';
import { FUNNEL_STAGES, type FunnelStageId } from './policy-funnel';

/**
 * Why a group of decisions offered nothing: the policy-funnel stage that removed
 * each one's last candidate.
 *
 * `no_candidates` is a decision whose flow had nothing to consider.
 * `unaccounted` is one whose record does not say — no step left it empty,
 * or the step that did carries no code in the closed set. Zero on a correct
 * engine, and counted rather than folded into a stage, for the reason
 * `PolicyFunnelReport.unaccounted` gives.
 */
export interface SuppressionReason {
  stage: FunnelStageId | 'no_candidates' | 'unaccounted';
  /** Distinct decisions. They sum to `suppressed`. */
  decisions: number;
  /** The first such decision in input order, so the number links to a trace. */
  sampleDecisionId: string;
}

export interface PerformanceRow {
  /** The offer key that won. */
  action: string;
  channel: string;
  flowId: string;
  /** Decisions where this action was the winner. The denominator. */
  offered: number;
  /**
   * Decisions with any outcome at all. The denominator for every rate here.
   *
   * Separate from `offered` because they answer different questions: how often
   * this was put in front of somebody, and how much of that we know anything
   * about.
   */
  measured: number;
  /** Distinct decisions with at least one outcome of each type. */
  impressions: number;
  clicks: number;
  acceptances: number;
  rejections: number;
  conversions: number;
  /**
   * Realised value in minor units, summed over outcomes that carried one.
   *
   * Null when no outcome carried a value — distinct from zero, which would
   * claim the offers were worth nothing rather than that nobody said.
   */
  valueMinor: number | null;
  /**
   * Null when nothing was measured — not zero.
   *
   * Zero would claim the offer was seen and refused. Null says nobody reported.
   */
  acceptanceRate: number | null;
  clickRate: number | null;
}

/**
 * One stage of the loop, for one channel.
 *
 * Every field is a subset of the one before it — that is the property the
 * Cascade pattern rests on (`METIS_CONSOLE_SPEC.md` §4.7), and the one that
 * caught G-046: `seen` exceeded `deliverable` for a day, which meant the two
 * were counting different populations.
 */
export interface ChannelStages {
  channel: string;
  /** Whether anything carries a decision on this channel to a customer. */
  delivers: boolean;
  decisions: number;
  offered: number;
  deliverable: number;
  seen: number;
  acted: number;
}

/** One day of the loop, for the rail's sparklines. */
export interface LoopDay {
  /** `YYYY-MM-DD`, from the decision's own timestamp. */
  date: string;
  decisions: number;
  offered: number;
  deliverable: number;
  seen: number;
  acted: number;
}

export interface PerformanceReport {
  rows: PerformanceRow[];
  /** Every decision in range, including the ones that offered nothing. */
  decisions: number;
  /** Decisions with a winner. */
  offered: number;
  /**
   * Decisions that offered nothing.
   *
   * Reported beside the rest rather than hidden: on a platform whose
   * suitability tier exists to refuse profitable offers, suppression is a
   * result, not a shortfall.
   */
  suppressed: number;
  /**
   * What `suppressed` is made of, largest first.
   *
   * The loop showed the drop from decisions to "offered something" and never
   * said why; the cause — consent, frequency, a policy — was only on the policy
   * funnel, a screen away. This is that cause, per decision: the stage that
   * removed its last candidate, so the groups sum to `suppressed`. The funnel
   * counts candidates; this counts the decisions they emptied.
   */
  suppressedBy: SuppressionReason[];
  /** Decisions with at least one outcome recorded against them. */
  measured: number;
  /**
   * Offered decisions on a channel something actually delivers.
   *
   * The stage between `offered` and `measured`, and the one the loop breaks at:
   * a decision can be correct, recorded and replayable and still reach nobody,
   * because the channel that won it has no sender. ADR-013.
   *
   * Null when the caller did not say which channels deliver — absent rather
   * than zero, because "nothing is deliverable" and "nobody told us" are
   * different answers and a screen must not render the second as the first.
   */
  deliverable: number | null;
  /** Decisions with a click, acceptance or conversion — the customer did something. */
  acted: number;
  /**
   * Offered decisions with at least one outcome that carried a value: the
   * population every row's `valueMinor` is summed over.
   *
   * What realised value rests on, and not the same as `acted`. A click is acted
   * on and worth nothing. On the seeded tenant 278 decisions were acted on and 24
   * carried a value. Re-rolled 200 times, realised value varied 17.7% and this
   * count 17.8%, while the value per valued decision varied 3.8% (ADR-023). So
   * this count, not `acted`, says how far the figure can be trusted.
   */
  valued: number;
  /** The same five stages per channel, so a rate can name its population. */
  channels: ChannelStages[];
  /** Daily, oldest first. */
  series: LoopDay[];
  /** The window the numbers cover, from the decisions themselves. */
  from: string | null;
  to: string | null;
}

const TYPES: OutcomeType[] = ['impression', 'click', 'acceptance', 'rejection', 'conversion'];

const STAGE_INDEX = new Map<string, number>(
  FUNNEL_STAGES.flatMap((stage, i) => stage.codes.map((code) => [code, i] as const))
);

/**
 * The stage that removed a suppressed decision's last candidate.
 *
 * The first step that leaves nothing standing, in the order the flow ran. A step
 * can remove candidates for more than one reason; the stage that removed the
 * most of them there is the one named, and a tie goes to the stage a decision
 * meets first, so the answer does not depend on the order denials were written.
 */
export function suppressionStageOf(entry: LedgerEntry): SuppressionReason['stage'] {
  const d = entry.record.decision;
  if (d.candidateKeys.length === 0) return 'no_candidates';
  const emptied = d.eliminations.find((step) => step.survived.length === 0);
  if (!emptied) return 'unaccounted';

  const removed = new Map<number, number>();
  for (const denial of emptied.denials) {
    const i = STAGE_INDEX.get(denial.code);
    if (i !== undefined) removed.set(i, (removed.get(i) ?? 0) + 1);
  }
  if (removed.size === 0) return 'unaccounted';
  const [top] = [...removed.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return FUNNEL_STAGES[top[0]].id;
}

/** Percentage as a fraction, or null when the denominator is zero. */
function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Join decisions to their outcomes and count.
 *
 * `outcomes` is keyed by decision id. Taking it as a map rather than fetching
 * keeps this pure — it can be run over a fixture, a page of results or a whole
 * tenant without knowing which, and it is the same function in every case.
 */
export function buildPerformance(
  entries: LedgerEntry[],
  outcomes: Map<string, OutcomeEvent[]>,
  /**
   * The channels something delivers on, from the tenant's placements.
   *
   * Omitted means the caller does not know, and `deliverable` comes back null
   * rather than zero. The ledger has no opinion about placements — they are not
   * part of the hashed catalogue and this package does not import them — so the
   * fact is passed in by whoever does.
   */
  deliverableChannels?: readonly string[]
): PerformanceReport {
  type Bucket = {
    action: string;
    channel: string;
    flowId: string;
    offered: number;
    /** Decision ids seen per outcome type, so a repeat cannot inflate a count. */
    seen: Record<OutcomeType, Set<string>>;
    /** Decisions with any outcome, which is what a rate can be taken over. */
    measured: Set<string>;
    valueMinor: number | null;
  };

  const buckets = new Map<string, Bucket>();
  let offered = 0;
  let suppressed = 0;
  const suppression = new Map<SuppressionReason['stage'], SuppressionReason>();
  let measured = 0;
  let acted = 0;
  let valued = 0;
  let deliverable = 0;
  let from: string | null = null;
  let to: string | null = null;

  const delivers = deliverableChannels ? new Set(deliverableChannels) : null;
  const ACTED: OutcomeType[] = ['click', 'acceptance', 'conversion'];

  const perChannel = new Map<string, ChannelStages>();
  const stageOf = (channel: string): ChannelStages => {
    let row = perChannel.get(channel);
    if (!row) {
      row = {
        channel,
        delivers: delivers ? delivers.has(channel) : false,
        decisions: 0,
        offered: 0,
        deliverable: 0,
        seen: 0,
        acted: 0,
      };
      perChannel.set(channel, row);
    }
    return row;
  };

  const days = new Map<string, LoopDay>();
  const dayOf = (at: string): LoopDay => {
    const date = at.slice(0, 10);
    let d = days.get(date);
    if (!d) {
      d = { date, decisions: 0, offered: 0, deliverable: 0, seen: 0, acted: 0 };
      days.set(date, d);
    }
    return d;
  };

  for (const entry of entries) {
    if (from === null || entry.occurredAt < from) from = entry.occurredAt;
    if (to === null || entry.occurredAt > to) to = entry.occurredAt;

    const events = outcomes.get(entry.decisionId) ?? [];
    const didAct = events.some((e) => ACTED.includes(e.type));
    if (events.length > 0) measured += 1;
    if (didAct) acted += 1;

    const channel = entry.record.decision.channel;
    const stage = stageOf(channel);
    const day = dayOf(entry.occurredAt);
    stage.decisions += 1;
    day.decisions += 1;
    if (events.length > 0) {
      stage.seen += 1;
      day.seen += 1;
    }
    if (didAct) {
      stage.acted += 1;
      day.acted += 1;
    }

    const winner = entry.record.decision.winner;
    if (!winner) {
      suppressed += 1;
      const stage = suppressionStageOf(entry);
      const reason = suppression.get(stage);
      if (reason) reason.decisions += 1;
      else suppression.set(stage, { stage, decisions: 1, sampleDecisionId: entry.decisionId });
      continue;
    }
    offered += 1;
    stage.offered += 1;
    day.offered += 1;
    if (delivers?.has(channel)) {
      deliverable += 1;
      stage.deliverable += 1;
      day.deliverable += 1;
    }
    // JSON rather than a delimiter: it is injective for strings, so an action
    // containing whatever separator was chosen cannot collide with another
    // triple — and it stays printable, which a control character does not.
    const key = JSON.stringify([winner, channel, entry.flowId]);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        action: winner,
        channel,
        flowId: entry.flowId,
        offered: 0,
        seen: {
          impression: new Set(),
          click: new Set(),
          acceptance: new Set(),
          rejection: new Set(),
          conversion: new Set(),
        },
        measured: new Set(),
        valueMinor: null,
      };
      buckets.set(key, bucket);
    }

    bucket.offered += 1;
    if (events.length > 0) bucket.measured.add(entry.decisionId);
    // Once per decision however many of its events carried a value, and only
    // here, among offered decisions, so it counts exactly the decisions the
    // rows' `valueMinor` is summed over.
    if (events.some((e) => e.valueMinor !== null && e.valueMinor !== undefined)) valued += 1;
    for (const event of events) {
      // The decision id, not a counter: a channel that fires the same event
      // twice reports one, and a rate can never exceed 1.
      bucket.seen[event.type]?.add(entry.decisionId);
      if (event.valueMinor !== null && event.valueMinor !== undefined) {
        bucket.valueMinor = (bucket.valueMinor ?? 0) + event.valueMinor;
      }
    }
  }

  const rows: PerformanceRow[] = [...buckets.values()]
    .map((b) => ({
      action: b.action,
      channel: b.channel,
      flowId: b.flowId,
      offered: b.offered,
      measured: b.measured.size,
      impressions: b.seen.impression.size,
      clicks: b.seen.click.size,
      acceptances: b.seen.acceptance.size,
      rejections: b.seen.rejection.size,
      conversions: b.seen.conversion.size,
      valueMinor: b.valueMinor,
      // Over what was observed, never over what was offered.
      acceptanceRate: rate(b.seen.acceptance.size, b.measured.size),
      clickRate: rate(b.seen.click.size, b.measured.size),
    }))
    // Most-offered first, then by name so the order is stable when two tie —
    // a table that reorders between refreshes is one nobody trusts.
    .sort((a, b) => b.offered - a.offered || a.action.localeCompare(b.action));

  return {
    rows,
    decisions: entries.length,
    offered,
    suppressed,
    // Largest first; then the order a decision meets the stages, so equal
    // groups do not reorder between refreshes.
    suppressedBy: [...suppression.values()].sort((a, b) => {
      const order = (s: SuppressionReason['stage']) =>
        s === 'no_candidates' ? -1 : s === 'unaccounted' ? FUNNEL_STAGES.length : FUNNEL_STAGES.findIndex((f) => f.id === s);
      return b.decisions - a.decisions || order(a.stage) - order(b.stage);
    }),
    measured,
    deliverable: delivers ? deliverable : null,
    acted,
    valued,
    // Widest first: the reader is looking for where the volume went.
    channels: [...perChannel.values()].sort(
      (a, b) => b.decisions - a.decisions || a.channel.localeCompare(b.channel)
    ),
    series: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    from,
    to,
  };
}

/** Every outcome type, for a UI that must not hard-code the list. */
export const OUTCOME_TYPES = TYPES;
