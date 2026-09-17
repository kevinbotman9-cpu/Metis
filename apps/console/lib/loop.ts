import type { CascadeStage } from '@/components/cascade-rail';
import type { apiClient, ChannelStagesDto, PerformanceRowDto, SuppressionReasonDto } from '@/lib/api-client';
import type { Formatter } from '@/lib/format';
// A cycle — `policy-funnel` imports `pct` from here — and a safe one: each side
// reads the other's export only when called, never while the module loads.
import { STAGE_LABEL } from '@/lib/policy-funnel';

/**
 * The loop, as a model: decisions → offered → deliverable → seen → acted.
 *
 * `docs/METIS_CONSOLE_SPEC.md` §4.7. Read by `/performance` and by the Overview,
 * which draw the same decomposition for different readers — so the arithmetic
 * lives here, once, and neither screen can quietly count a stage differently
 * from the other.
 *
 * Pure: a report and the catalogue's margins in, the stages and the figures
 * that describe them out. No React, no query.
 */

export type LoopReport = Awaited<ReturnType<typeof apiClient.getPerformance>>;

export const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  web: 'Web',
  push: 'Push',
  outbound_call: 'Outbound call',
};

/** The trailing window the sparklines and trends describe. */
export const WINDOW_DAYS = 30;

export const channelLabel = (channel: string) => CHANNEL_LABEL[channel] ?? channel;

/**
 * `n` as a share of `of`, in the tenant's locale, or a dash when there is no
 * denominator. One decimal over small populations and none over large ones: at
 * five offers a tenth of a percent is a whole customer; at ten thousand it is
 * noise.
 *
 * This used `toFixed`, which wrote "45.1%" to a German tenant after every other
 * number on the screen had moved to "45,1" (G-092).
 */
export function pct(n: number, of: number, format: Formatter): string {
  if (of <= 0) return '—';
  const digits = of > 1000 ? 0 : 1;
  return format.number(n / of, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export interface Loop {
  stages: CascadeStage[];
  /** The last `WINDOW_DAYS` days of the report's series. */
  tail: LoopReport['series'];
  /** Channels where something carries a decision to a customer. */
  delivering: ChannelStagesDto[];
  /** Channels that offered something and have nothing to send it. */
  dead: ChannelStagesDto[];
  /** Offers made on a channel with no sender. */
  undeliverable: number;
  /** The population every rate below the break describes, in words. */
  population: string;
  /**
   * What the loop is closed on, as one sentence a reader can take whole.
   *
   * It was assembled in the pane as "Closed on {population}, open on
   * {dead.length}", which printed *"Closed on Web only, open on 0"* on every
   * tenant whose channels all deliver — a count where a sentence was expected,
   * and on a tenant with no decisions *"Closed on 0 delivered channels, open on
   * 0"*, which says nothing true at all. The three cases are different
   * statements, so they are three sentences.
   */
  closure: string;
  /**
   * Realised value, in minor units of the tenant's currency — or `null` when no
   * outcome carried a value.
   *
   * It summed `valueMinor ?? 0`, so a tenant whose only outcomes were clicks read
   * *"$0.00 from 1 acted on"*: a measured zero, when nothing had been measured.
   * The ledger's rule is the opposite — `packages/ledger/src/performance.ts`,
   * *"Null when nothing was measured — not zero"* — and the panes already draw a
   * dash for `null`. A click carries no value; only an acceptance or a
   * conversion does, and the storefront sends neither.
   */
  realised: number | null;
  /**
   * The line under realised value, saying what the figure rests on.
   *
   * It read *"from 278 acted on"*, which named the wrong population: a click is
   * acted on and carries no value, and on the seeded tenant 24 of those 278
   * carried one. The figure's stability follows that count (ADR-023): re-rolled
   * 200 times, realised value varied 17.7% and the count 17.8%. So the line names
   * the count, and below `REALISED_FLOOR` says the figure is thin and roughly how
   * much a count that small moves on its own. The number is drawn either way:
   * it is money reported, not an estimate, and hiding it would hide the one
   * measured amount at the volume where someone is checking by hand.
   */
  realisedLine: string;
  /**
   * Whether realised value carries the page's one accent. Only at or above
   * `REALISED_FLOOR` (ADR-023 §3). Below it, nothing on the page takes the
   * accent: moving it to a steadier figure would make "the accented figure" mean
   * different things on different tenants.
   */
  realisedAccent: boolean;
  /**
   * Expected margin × offers, over the delivered channels.
   *
   * A **ceiling**, and every screen that shows it says so. Expected margin is
   * what an offer is worth if the customer takes it — arbitration ranks on it —
   * so multiplying by offers gives what the platform would have made had every
   * one been accepted, which nothing ever is. It is the only expectation this
   * data supports: a decision record carries no propensity to weight it by.
   */
  expectedDelivered: number;
  /** The same ceiling, over the offers nothing sent. */
  expectedUndelivered: number;
  /**
   * Stages whose figure exceeds the stage above. §4.7: every stage is a subset
   * of the one above it, so a stage that is larger means the two are measuring
   * different populations and the screen is lying. Empty when the loop is sound.
   */
  inversions: { stage: string; value: number; above: string; aboveValue: number }[];
  /**
   * Where the loop loses most, as a neutral statement beside the red break.
   *
   * The break is kept for what cannot happen — an offer on a channel with no
   * sender. Ordinary drop-off is not a defect, and colouring it red would teach
   * a reader to ignore the red; so it is said separately, and only when it
   * means something. Decided by the product owner on 2026-09-17, with both
   * guards:
   *
   * - **A floor.** A share over fewer than `LOSES_MOST_FLOOR` at the stage above
   *   is not compared: at two decisions every stage is 0% or 100%.
   * - **Unreported is not lost.** A stage no channel has reported anything for
   *   is not a loss. The storefront sends no acceptance, and a person who never
   *   presses a call to action sends no click, so "acted on" would otherwise
   *   lose most on every hand-made history.
   *
   * Deliverable is never named: it is either whole or the break, which has its
   * own statement.
   */
  losesMost: LosesMost;
  /**
   * Why the decisions that offered nothing offered nothing, from the stage that
   * removed each one's last candidate. Null when every decision offered
   * something. The rail showed the drop and the pane never said why; the cause
   * was only on the policy funnel.
   */
  offeredNothing: string | null;
}

/** Below this many at the stage above, a share is not named as the largest loss. */
export const LOSES_MOST_FLOOR = 20;

/**
 * Below this many valued decisions, realised value is drawn, said to be thin,
 * and not emphasised. ADR-023 §2, accepted 2026-09-17.
 *
 * Not `LOSES_MOST_FLOOR`. That bounds a share, which one decision moves by five
 * points under 20. This bounds a sum over rare events, whose spread goes as
 * 1/√n: about 22% at 20, and about 10% at 100.
 */
export const REALISED_FLOOR = 100;

function realisedLineOf(data: LoopReport, realised: number | null, format: Formatter): string {
  const acted = format.number(data.acted);
  if (realised === null) {
    // A click is acted on and carries no value. Saying "0" here read as "we
    // measured it and it was worth nothing", which is the one thing the card
    // cannot know.
    return data.acted > 0 ? `${acted} acted on, none carrying a value` : 'nothing acted on yet';
  }
  const valued = data.valued ?? 0;
  const head = `from ${format.number(valued)} valued ${valued === 1 ? 'outcome' : 'outcomes'}, of ${acted} acted on`;
  if (valued >= REALISED_FLOOR) return head;
  // Computed, not written: a count this small moves by about 1/√n on its own.
  const spread = format.number(1 / Math.sqrt(Math.max(1, valued)), { style: 'percent', maximumFractionDigits: 0 });
  return `${head} — too few to read as a return: a count this small moves by about ${spread} with no change in behaviour`;
}

export type LosesMost =
  /** Nothing decided; `closure` already says so. */
  | { kind: 'nothing' }
  | { kind: 'too_few'; sentence: string }
  | { kind: 'unreported'; sentence: string }
  /** Every stage over the floor kept all of what reached it. */
  | { kind: 'whole'; sentence: string }
  | { kind: 'stage'; stage: 'offered' | 'seen' | 'acted'; sentence: string; unreported: string | null };

/** The words the policy funnel uses, plus the two groups that are not a stage. */
function suppressionLabel(stage: SuppressionReasonDto['stage']): string {
  if (stage === 'no_candidates') return 'nothing to consider';
  if (stage === 'unaccounted') return 'a record that does not say';
  return STAGE_LABEL[stage];
}

function offeredNothingSentence(data: LoopReport, format: Formatter): string | null {
  if (!(data.suppressed > 0)) return null;
  const groups = (data.suppressedBy ?? []).map(
    (g) => `${format.number(g.decisions)} at ${suppressionLabel(g.stage)}`
  );
  const n = format.number(data.suppressed);
  const head = `${n} ${data.suppressed === 1 ? 'decision' : 'decisions'} offered nothing`;
  return groups.length === 0 ? `${head}.` : `${head}: ${groups.join(', ')}.`;
}

function losesMostOf(data: LoopReport, deliverable: number, format: Formatter): LosesMost {
  if (data.decisions === 0) return { kind: 'nothing' };

  const noOutcome = 'No channel has reported an outcome yet, so nothing below Deliverable is counted as a loss.';
  const noAction = 'No channel has reported an action yet, so Acted on is not counted as a loss.';

  const candidates = [
    {
      stage: 'offered' as const,
      value: data.offered,
      above: data.decisions,
      // The ledger's own count of what it decided: never waiting on a channel.
      unreported: null,
      sentence: () =>
        `It loses most at Offered something: ${pct(data.offered, data.decisions, format)} of decisions offered anything.`,
    },
    {
      stage: 'seen' as const,
      value: data.measured,
      above: deliverable,
      unreported: data.measured === 0 ? noOutcome : null,
      sentence: () =>
        `It loses most at Seen: ${pct(data.measured, deliverable, format)} of deliverable decisions were reported seen, and ${format.number(deliverable - data.measured)} were not.`,
    },
    {
      stage: 'acted' as const,
      value: data.acted,
      above: data.measured,
      // Nothing seen means nothing to act on, which the stage above already says.
      unreported: data.measured > 0 && data.acted === 0 ? noAction : null,
      sentence: () =>
        `It loses most at Acted on: ${pct(data.acted, data.measured, format)} of seen decisions were acted on, and ${format.number(data.measured - data.acted)} were not.`,
    },
  ];

  const aboveFloor = candidates.filter((c) => c.above >= LOSES_MOST_FLOOR);
  const unreported = aboveFloor.find((c) => c.unreported)?.unreported ?? null;
  const measurable = aboveFloor.filter((c) => !c.unreported && !(c.stage === 'acted' && data.measured === 0));
  // A stage that kept everything that reached it lost nothing, and naming it
  // "where it loses most" at 100% would be a sentence with nothing in it.
  const eligible = measurable.filter((c) => c.value < c.above);

  if (eligible.length === 0) {
    if (unreported) return { kind: 'unreported', sentence: unreported };
    if (measurable.length > 0) {
      return { kind: 'whole', sentence: 'Every stage it can measure kept everything that reached it.' };
    }
    return {
      kind: 'too_few',
      sentence: `Too few decisions to say where the loop loses most: it names a stage once ${LOSES_MOST_FLOOR} have reached the stage above it.`,
    };
  }

  // Lowest share of the stage above; a tie goes to the earlier stage, where the
  // volume went first.
  const worst = eligible.reduce((a, b) => (b.value / b.above < a.value / a.above ? b : a));
  return { kind: 'stage', stage: worst.stage, sentence: worst.sentence(), unreported };
}

export function buildLoop(
  data: LoopReport,
  marginByKey: ReadonlyMap<string, number>,
  format: Formatter
): Loop {
  const tail = data.series.slice(-WINDOW_DAYS);
  const delivering = data.channels.filter((c) => c.delivers);
  const dead = data.channels.filter((c) => !c.delivers && c.offered > 0);
  const deliverable = data.deliverable ?? 0;
  const undeliverable = data.offered - deliverable;

  // Before a channel has carried anything there is no population to name, and
  // "0 delivered channels" read as a measurement of one.
  const population =
    delivering.length === 0
      ? 'no channel yet'
      : delivering.length === 1
        ? `${channelLabel(delivering[0].channel)} only`
        : `${delivering.length} delivered channels`;

  // Deliverable is what was offered, less what was offered on a channel nothing
  // delivers. When every channel that offered something delivers it, the two are
  // one count by definition, not by result — so the rail draws the stage as a
  // pass-through that says so, instead of a full bar that reads as a measurement.
  // Unknown delivery (a null `deliverable`) is not a pass-through: the report
  // could not say.
  const offeringNames = data.channels.filter((c) => c.offered > 0).map((c) => channelLabel(c.channel));
  const passThrough =
    data.deliverable !== null && data.deliverable !== undefined && data.offered > 0 && undeliverable === 0
      ? `Nothing offered can drop here: every channel that offered something delivers it (${offeringNames.join(', ')}). It drops only when an offer wins a slot on a channel with no sender.`
      : undefined;

  const offeredNothing = offeredNothingSentence(data, format);
  const deadNames = dead.map((c) => channelLabel(c.channel)).join(', ');
  const closure =
    data.decisions === 0
      ? 'Nothing has been decided, so no channel has been asked to deliver anything yet.'
      : dead.length === 0
        ? `Closed on ${population}: every channel that offered something delivers it.`
        : `Open on ${deadNames}: ${dead.length === 1 ? 'it offers' : 'they offer'} and nothing delivers. Closed on ${population}.`;

  const stages: CascadeStage[] = [
    {
      id: 'decisions',
      label: 'Decisions made',
      value: data.decisions,
      pct: 100,
      // "1 channels" read on every tenant driven by the storefront, which is one.
      note: `${data.channels.length} ${data.channels.length === 1 ? 'channel' : 'channels'}`,
      series: tail.map((d) => d.decisions),
    },
    {
      id: 'offered',
      label: 'Offered something',
      value: data.offered,
      pct: (data.offered / Math.max(1, data.decisions)) * 100,
      note: `${pct(data.offered, data.decisions, format)} of decisions`,
      series: tail.map((d) => d.offered),
      tone: 'accent',
      // Why the rest offered nothing, on the stage that dropped them. It was in
      // the evidence pane until that pane came off the Overview (2026-09-17).
      detail: offeredNothing ?? undefined,
    },
    {
      id: 'deliverable',
      label: 'Deliverable',
      value: deliverable,
      pct: (deliverable / Math.max(1, data.decisions)) * 100,
      note: `${pct(deliverable, data.offered, format)} of offered`,
      series: tail.map((d) => d.deliverable),
      // The colour a deliverable stage has when nothing breaks; a break overrides it.
      tone: 'accent',
      broken:
        undeliverable > 0
          ? `${format.number(undeliverable)} decisions won a slot on a channel nothing delivers — ${dead
              .map((c) => channelLabel(c.channel))
              .join(', ')}. They were decided correctly and reached nobody.`
          : undefined,
      passThrough,
    },
    {
      id: 'seen',
      label: 'Seen',
      value: data.measured,
      pct: (data.measured / Math.max(1, data.decisions)) * 100,
      note: `${pct(data.measured, deliverable, format)} of deliverable`,
      series: tail.map((d) => d.seen),
      tone: 'attention',
    },
    {
      id: 'acted',
      label: 'Acted on',
      value: data.acted,
      pct: (data.acted / Math.max(1, data.decisions)) * 100,
      note: `${pct(data.acted, data.measured, format)} of seen`,
      series: tail.map((d) => d.acted),
      tone: 'ok',
    },
  ];

  const inversions = stages.slice(1).flatMap((s, i) =>
    s.value > stages[i].value
      ? [{ stage: s.label, value: s.value, above: stages[i].label, aboveValue: stages[i].value }]
      : []
  );

  const realised = data.rows.some((r) => r.valueMinor !== null && r.valueMinor !== undefined)
    ? data.rows.reduce((sum, r) => sum + (r.valueMinor ?? 0), 0)
    : null;
  const delivers = (r: PerformanceRowDto) => delivering.some((c) => c.channel === r.channel);
  const ceiling = (rows: PerformanceRowDto[]) =>
    rows.reduce((sum, r) => sum + r.offered * (marginByKey.get(r.action) ?? 0), 0);

  return {
    stages,
    tail,
    delivering,
    dead,
    undeliverable,
    population,
    closure,
    realised,
    realisedLine: realisedLineOf(data, realised, format),
    realisedAccent: realised !== null && (data.valued ?? 0) >= REALISED_FLOOR,
    expectedDelivered: ceiling(data.rows.filter(delivers)),
    expectedUndelivered: ceiling(data.rows.filter((r) => !delivers(r))),
    inversions,
    losesMost: losesMostOf(data, deliverable, format),
    offeredNothing,
  };
}
