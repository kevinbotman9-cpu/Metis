import { seededUnitInterval } from '@metis/runtime/deterministic/canonical';
import type { OutcomeEvent, OutcomeType } from '@metis/ledger';
import { decisionIndexOf, inChurnCohort } from './engine';
import { offers } from './catalogue';
import type { DecisionRecord } from './decisions';

/**
 * What happened after the seeded decisions — phase two of ADR-008.
 *
 * Phase one gave `/performance` a producer, and it reported on the two
 * decisions a reviewer had just clicked. Two rows is a demonstration that the
 * wiring works, not a demonstration of the product: a marketer opening the
 * screen still saw 3,425 of 3,427 offers with nothing recorded against them.
 *
 * These are a **projection**, in the same sense the committed decision index
 * is one, and deliberately not ledger rows. `DecisionLedger.recordOutcome`
 * refuses an outcome whose decision it cannot find, which is the invariant that
 * makes the join trustworthy — and the seeded decisions are not in the ledger
 * because putting them there costs 10,400 engine executions, which is the
 * 13.1-second import the two-tier index exists to avoid. So the report merges
 * two sources and the invariant stays intact: nothing here is ever written
 * through `recordOutcome`, and a real outcome from a real client still has to
 * find a real decision.
 *
 * ## The shape, and why each rule is here
 *
 * Every rule below is from ADR-008 §6 and every one of them exists to stop the
 * corpus teaching something false.
 *
 * **Only decisions that offered something.** A suppressed decision cannot have
 * an impression. Generating one would make the frequency policy look like an
 * offer that failed.
 *
 * **A nested funnel.** conversion ⊆ acceptance ⊆ click ⊆ impression, so every
 * rate is monotone. A corpus where clicks exceed impressions is the tell that
 * the generator counted events rather than decisions, and it would silently
 * invalidate the property `buildPerformance` is built around.
 *
 * **Coverage below 100%, and different per channel.** If every offered decision
 * reported, `measured` and `offered` would be the same number on screen, the
 * distinction the report is designed around would be invisible, and the next
 * person would delete it as redundant. Web reports most; an outbound call
 * reports least, because somebody has to type the outcome in.
 *
 * **Value on conversions only.** A click is not a conversion worth nothing.
 * The amount is the winning offer's expected margin with real variance, so
 * realised and expected differ — a demo where they match teaches the wrong
 * thing about the product.
 *
 * **The churn cohort converts worse.** They already exist in the decisions,
 * near contract end and mostly without marketing consent. Drawing their
 * outcomes independently would make the story true in one half of the data and
 * false in the other.
 *
 * **One offer is offered often and accepted rarely.** The demo exists so a
 * marketer can find something. A corpus where everything performs adequately
 * has nothing in it to find.
 */

const r = (...parts: (string | number)[]) => seededUnitInterval('demo-telco-uk', 'outcome', ...parts);

/**
 * How much of each channel reports back at all.
 *
 * Web is instrumented in the page and reports most; an outbound call is a
 * person typing a disposition afterwards, and reports least. These are the
 * numbers that keep `measured` visibly smaller than `offered`.
 */
const COVERAGE: Record<string, number> = {
  web: 0.74,
  push: 0.67,
  email: 0.61,
  sms: 0.58,
  outbound_call: 0.41,
};

/** Conditional rates, each over the step above it. */
const CLICK_GIVEN_IMPRESSION = 0.23;
const ACCEPT_GIVEN_CLICK = 0.19;
const CONVERT_GIVEN_ACCEPT = 0.71;

/** Customers on their way out engage and convert materially worse. */
const CHURN_PENALTY = 0.42;

/**
 * The offer that gets shown constantly and taken almost never.
 *
 * Chosen rather than emergent, because "somewhere in 240 offers there is
 * probably a bad one" is not a demo — a person has to be able to find it in
 * under a minute. `acq_sim_30` wins 619 decisions, the third most in the
 * corpus, and is taken by almost nobody: high reach and no value is the finding
 * a marketer is supposed to make, and it is only a finding if the offer is
 * prominent enough to be looked at.
 */
export const POOR_PERFORMER = 'acq_sim_30';
const POOR_PERFORMER_ACCEPT = 0.012;

/** Minutes, hours and days, as milliseconds. */
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const marginByKey = new Map(offers.map((o) => [o.key, o.financials.expectedMargin.amount]));

function at(base: string, ms: number): string {
  return new Date(new Date(base).getTime() + ms).toISOString();
}

/**
 * Outcomes for one seeded decision. Empty for a decision that offered nothing.
 *
 * Pure and total: the same decision always produces the same events, on any
 * machine, with no clock and no `Math.random`. That is what lets the report be
 * recomputed rather than trusted, and what lets a test assert the funnel is
 * monotone across all 10,400 rather than on a sample.
 */
export function seededOutcomesFor(d: DecisionRecord): OutcomeEvent[] {
  if (!d.winner) return [];

  const coverage = COVERAGE[d.channel] ?? 0.5;
  if (r('impression', d.id) >= coverage) return [];

  const index = decisionIndexOf(d.customerId);
  const churning = index !== null && inChurnCohort(index);
  const penalty = churning ? CHURN_PENALTY : 1;

  const events: OutcomeEvent[] = [];
  const push = (type: OutcomeType, ms: number, valueMinor: number | null = null) =>
    events.push({
      tenantId: d.tenantId ?? 'telco-uk',
      decisionId: d.id,
      type,
      // Lagged from the decision's own timestamp, never the clock — the same
      // rule the decision follows, and what lets an outcome be read beside it.
      occurredAt: at(d.timestamp, ms),
      valueMinor,
    });

  push('impression', 2 * MIN + Math.floor(r('impression-lag', d.id) * 8 * MIN));
  if (r('click', d.id) >= CLICK_GIVEN_IMPRESSION * penalty) return events;

  push('click', 12 * MIN + Math.floor(r('click-lag', d.id) * 40 * MIN));

  const acceptRate =
    d.winner === POOR_PERFORMER ? POOR_PERFORMER_ACCEPT : ACCEPT_GIVEN_CLICK * penalty;
  if (r('acceptance', d.id) >= acceptRate) {
    // A click that went nowhere is a rejection, and recording it is the
    // difference between "nobody said" and "they said no". Without this the
    // corpus would have no rejections at all, and the reason code exists.
    if (r('rejection', d.id) < 0.34) push('rejection', 3 * HOUR);
    return events;
  }

  push('acceptance', 2 * HOUR + Math.floor(r('accept-lag', d.id) * 30 * HOUR));
  if (r('conversion', d.id) >= CONVERT_GIVEN_ACCEPT * penalty) return events;

  // Realised, not expected: ±35% around the offer's own margin, so the two
  // columns on /performance disagree the way they do in life.
  const expected = marginByKey.get(d.winner) ?? 0;
  const realised = Math.round(expected * (0.65 + r('value', d.id) * 0.7));
  push('conversion', 2 * DAY + Math.floor(r('convert-lag', d.id) * 12 * DAY), realised);

  return events;
}

/**
 * Every seeded outcome, keyed by decision id, for the decisions given.
 *
 * Built per request over the rows the report is about rather than cached: the
 * whole corpus is 10,400 calls of pure arithmetic and measures under 40ms,
 * which is cheaper than the cache invalidation question it would otherwise
 * raise the first time a filter narrows the set.
 */
export function seededOutcomeMap(rows: DecisionRecord[]): Map<string, OutcomeEvent[]> {
  const map = new Map<string, OutcomeEvent[]>();
  for (const row of rows) {
    const events = seededOutcomesFor(row);
    if (events.length > 0) map.set(row.id, events);
  }
  return map;
}
