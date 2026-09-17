import type { CascadeStage } from '@/components/cascade-rail';
import type { apiClient, ChannelStagesDto, PerformanceRowDto } from '@/lib/api-client';
import type { Formatter } from '@/lib/format';

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
    realised: data.rows.some((r) => r.valueMinor !== null && r.valueMinor !== undefined)
      ? data.rows.reduce((sum, r) => sum + (r.valueMinor ?? 0), 0)
      : null,
    expectedDelivered: ceiling(data.rows.filter(delivers)),
    expectedUndelivered: ceiling(data.rows.filter((r) => !delivers(r))),
    inversions,
  };
}
