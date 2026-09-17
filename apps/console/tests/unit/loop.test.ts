import { describe, it, expect } from 'vitest';
import { buildLoop, pct, LOSES_MOST_FLOOR, type LoopReport } from '@/lib/loop';
import { formatterFor } from '@/lib/format';

/**
 * The loop's arithmetic, on a report built here.
 *
 * `/performance` and the Overview both draw from `buildLoop`, so these are the
 * rules both screens keep: stages in order, each a subset of the one above; a
 * break drawn where volume leaves for a structural reason; rates below it
 * naming their population; and the expected figure stated as a ceiling over
 * the offers that could have been taken.
 *
 * Small on purpose. The tenant is five offers and three channels, and a model
 * that only behaved at ten thousand decisions would not be describing it.
 */

const F = formatterFor({ locale: 'en-US', currency: 'USD' });

const report = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    decisions: 100,
    offered: 45,
    deliverable: 30,
    measured: 20,
    acted: 4,
    from: null,
    to: null,
    channels: [
      { channel: 'web', decisions: 70, offered: 30, deliverable: 30, seen: 20, acted: 4, delivers: true },
      { channel: 'email', decisions: 20, offered: 10, deliverable: 0, seen: 0, acted: 0, delivers: false },
      { channel: 'sms', decisions: 10, offered: 5, deliverable: 0, seen: 0, acted: 0, delivers: false },
    ],
    rows: [
      { action: 'fios_gigabit', channel: 'web', flowId: 'next-best-action', offered: 30, measured: 20, valueMinor: 25000 },
      { action: 'disney_plus', channel: 'email', flowId: 'next-best-action', offered: 10, measured: 0, valueMinor: null },
      { action: 'netflix', channel: 'sms', flowId: 'next-best-action', offered: 5, measured: 0, valueMinor: null },
    ],
    series: [{ decisions: 100, offered: 45, deliverable: 30, seen: 20, acted: 4 }],
    ...over,
  }) as unknown as LoopReport;

const MARGINS = new Map([
  ['fios_gigabit', 10000],
  ['disney_plus', 8000],
  ['netflix', 7000],
]);

describe('the loop', () => {
  it('runs decisions → offered → deliverable → seen → acted, each within the one above', () => {
    const { stages, inversions } = buildLoop(report(), MARGINS, F);
    expect(stages.map((s) => s.id)).toEqual(['decisions', 'offered', 'deliverable', 'seen', 'acted']);
    expect(stages.map((s) => s.value)).toEqual([100, 45, 30, 20, 4]);
    expect(inversions).toEqual([]);
  });

  it('draws the break where offers won a channel nothing sends, and says how many and where', () => {
    const { stages, undeliverable, dead } = buildLoop(report(), MARGINS, F);
    const deliverable = stages.find((s) => s.id === 'deliverable')!;
    expect(undeliverable).toBe(15);
    expect(dead.map((c) => c.channel)).toEqual(['email', 'sms']);
    expect(deliverable.broken).toBe(
      '15 decisions won a slot on a channel nothing delivers — Email, SMS. They were decided correctly and reached nobody.'
    );
    // The stages either side are simply smaller, which is not a break.
    expect(stages.filter((s) => s.broken).map((s) => s.id)).toEqual(['deliverable']);
  });

  it('draws no break when everything offered could be sent', () => {
    const whole = report({ deliverable: 45 });
    expect(buildLoop(whole, MARGINS, F).stages.some((s) => s.broken)).toBe(false);
  });

  it('names the population every rate below the break describes', () => {
    expect(buildLoop(report(), MARGINS, F).population).toBe('Web only');
  });

  it('refuses a stage larger than the one above, which means two populations', () => {
    // §4.7: /performance once showed 887 seen against 738 deliverable, and that
    // inversion was how the defect was found.
    const { inversions } = buildLoop(report({ measured: 31 }), MARGINS, F);
    expect(inversions).toEqual([{ stage: 'Seen', value: 31, above: 'Deliverable', aboveValue: 30 }]);
  });

  it('states expected value as a ceiling over what was offered, split by whether anything sent it', () => {
    const loop = buildLoop(report(), MARGINS, F);
    expect(loop.realised).toBe(25000);
    expect(loop.expectedDelivered).toBe(30 * 10000);
    expect(loop.expectedUndelivered).toBe(10 * 8000 + 5 * 7000);
  });
});

/**
 * "Where it loses most", beside the break. Decided by the product owner on
 * 2026-09-17: the red break stays for what cannot happen, and a neutral
 * statement names ordinary drop-off — with a volume floor, and with a stage no
 * channel has reported for never counted as a loss.
 */
describe('where the loop loses most', () => {
  const loses = (over: Partial<Record<string, unknown>>) => buildLoop(report(over), MARGINS, F).losesMost;

  it('names the stage with the lowest share of the stage above', () => {
    // 45% offered, 20 of 30 deliverable seen, 4 of 20 seen acted on.
    expect(loses({})).toEqual({
      kind: 'stage',
      stage: 'acted',
      sentence: 'It loses most at Acted on: 20.0% of seen decisions were acted on, and 16 were not.',
      unreported: null,
    });
    expect(
      loses({ decisions: 1000, offered: 100, deliverable: 100, measured: 60, acted: 30 })
    ).toMatchObject({ kind: 'stage', stage: 'offered', sentence: 'It loses most at Offered something: 10.0% of decisions offered anything.' });
  });

  it('never names Deliverable, which is whole or the break', () => {
    // 15 of 45 offers undeliverable is a lower share than any stage — and it is
    // the red break's to say, not this.
    expect(loses({ offered: 90, deliverable: 20, measured: 19, acted: 18 })).not.toMatchObject({ stage: 'deliverable' });
  });

  it('does not compare a share over fewer than the floor at the stage above', () => {
    // 1 of 10 seen acted on is the lowest share here, over ten decisions.
    expect(LOSES_MOST_FLOOR).toBe(20);
    expect(loses({ measured: 10, acted: 1 })).toMatchObject({ kind: 'stage', stage: 'seen' });
  });

  it('says there are too few when no stage reaches the floor', () => {
    const twoDecisions = loses({ decisions: 2, offered: 2, deliverable: 2, measured: 2, acted: 0 });
    expect(twoDecisions).toEqual({
      kind: 'too_few',
      sentence: 'Too few decisions to say where the loop loses most: it names a stage once 20 have reached the stage above it.',
    });
  });

  it('does not count a stage nobody reported as a loss', () => {
    // 25 seen and no action reported: Acted on at 0% would be named, on every
    // history made by hand in the storefront.
    const noAction = loses({ measured: 25, acted: 0 });
    expect(noAction).toMatchObject({ kind: 'stage', stage: 'offered' });
    expect(noAction).toMatchObject({
      unreported: 'No channel has reported an action yet, so Acted on is not counted as a loss.',
    });

    // And with nothing else losing, the unreported stage is what it says.
    expect(loses({ decisions: 30, offered: 30, deliverable: 30, measured: 30, acted: 0 })).toEqual({
      kind: 'unreported',
      sentence: 'No channel has reported an action yet, so Acted on is not counted as a loss.',
    });
    expect(loses({ decisions: 30, offered: 30, deliverable: 30, measured: 0, acted: 0 })).toEqual({
      kind: 'unreported',
      sentence: 'No channel has reported an outcome yet, so nothing below Deliverable is counted as a loss.',
    });
  });

  it('names no stage when every stage it can measure kept everything', () => {
    expect(loses({ decisions: 30, offered: 30, deliverable: 30, measured: 30, acted: 30 })).toEqual({
      kind: 'whole',
      sentence: 'Every stage it can measure kept everything that reached it.',
    });
  });

  it('says nothing when nothing has been decided, which the closure already says', () => {
    expect(loses({ decisions: 0, offered: 0, deliverable: 0, measured: 0, acted: 0, channels: [], rows: [], series: [] })).toEqual({
      kind: 'nothing',
    });
  });
});

describe('why decisions offered nothing', () => {
  it('names the stage that emptied them, largest first, in the funnel’s words', () => {
    const loop = buildLoop(
      report({
        suppressed: 55,
        suppressedBy: [
          { stage: 'eligibility', decisions: 40, sampleDecisionId: 'dec_a' },
          { stage: 'consent', decisions: 14, sampleDecisionId: 'dec_b' },
          { stage: 'frequency', decisions: 1, sampleDecisionId: 'dec_c' },
        ],
      }),
      MARGINS,
      F
    );
    expect(loop.offeredNothing).toBe(
      '55 decisions offered nothing: 40 at Eligibility, 14 at Consent, 1 at Frequency & suppression.'
    );
  });

  it('is absent when every decision offered something, and singular for one', () => {
    expect(buildLoop(report({ suppressed: 0, suppressedBy: [] }), MARGINS, F).offeredNothing).toBeNull();
    expect(
      buildLoop(
        report({ suppressed: 1, suppressedBy: [{ stage: 'no_candidates', decisions: 1, sampleDecisionId: 'dec_a' }] }),
        MARGINS,
        F
      ).offeredNothing
    ).toBe('1 decision offered nothing: 1 at nothing to consider.');
  });
});

describe('a share', () => {
  it('reads in the tenant’s locale, and is a dash with nothing to divide by', () => {
    expect(pct(45, 100, F)).toBe('45.0%');
    expect(pct(45, 100, formatterFor({ locale: 'de-DE', currency: 'EUR' })).replace(/ /g, ' ')).toBe('45,0 %');
    expect(pct(4500, 10000, F)).toBe('45%');
    expect(pct(3, 0, F)).toBe('—');
  });

  describe('at low volume, and at none', () => {
    const web = (acted: number) => ({
      channel: 'web', decisions: 2, offered: 2, deliverable: 2, seen: 2, acted, delivers: true,
    });

    it('does not call a value realised when no outcome carried one', () => {
      // "$0.00 from 1 acted on" was a measured zero where nothing was measured:
      // the one click was acted on and carried no value. The ledger's rule is
      // null, not zero, and the pane draws a dash for null.
      const clicksOnly = buildLoop(
        report({
          decisions: 2, offered: 2, deliverable: 2, measured: 2, acted: 1,
          channels: [web(1)],
          rows: [{ action: 'fios_gigabit', channel: 'web', flowId: 'next-best-action', offered: 2, measured: 2, valueMinor: null }],
        }),
        MARGINS,
        F
      );
      expect(clicksOnly.realised).toBeNull();

      // And a real zero stays a zero: an outcome that carried 0 was measured.
      const measuredZero = buildLoop(
        report({
          channels: [web(1)],
          rows: [{ action: 'fios_gigabit', channel: 'web', flowId: 'next-best-action', offered: 2, measured: 2, valueMinor: 0 }],
        }),
        MARGINS,
        F
      );
      expect(measuredZero.realised).toBe(0);
    });

    it('says what the loop is closed on in a sentence, in each of its three cases', () => {
      // It printed "Closed on Web only, open on 0" — a count where a sentence was
      // expected — and on an empty tenant "Closed on 0 delivered channels, open on 0".
      const empty = buildLoop(
        report({ decisions: 0, offered: 0, deliverable: 0, measured: 0, acted: 0, channels: [], rows: [], series: [] }),
        MARGINS,
        F
      );
      expect(empty.closure).toBe('Nothing has been decided, so no channel has been asked to deliver anything yet.');
      expect(empty.population).toBe('no channel yet');
      expect(empty.realised).toBeNull();

      const closed = buildLoop(report({ channels: [web(0)] }), MARGINS, F);
      expect(closed.closure).toBe('Closed on Web only: every channel that offered something delivers it.');

      const open = buildLoop(report(), MARGINS, F);
      expect(open.closure).toBe('Open on Email, SMS: they offer and nothing delivers. Closed on Web only.');

      for (const loop of [empty, closed, open]) expect(loop.closure).not.toMatch(/open on \d/);
    });

    it('still has five stages when nothing has been decided', () => {
      // The structure a new tenant sees at zero: data can be zero, structure
      // cannot vanish.
      const empty = buildLoop(
        report({ decisions: 0, offered: 0, deliverable: 0, measured: 0, acted: 0, channels: [], rows: [], series: [] }),
        MARGINS,
        F
      );
      expect(empty.stages.map((s) => s.id)).toEqual(['decisions', 'offered', 'deliverable', 'seen', 'acted']);
      expect(empty.stages.every((s) => s.value === 0)).toBe(true);
      expect(empty.inversions).toEqual([]);
    });
  });
});
