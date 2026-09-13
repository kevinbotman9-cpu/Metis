import { describe, it, expect } from 'vitest';
import { buildLoop, pct, type LoopReport } from '@/lib/loop';
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

describe('a share', () => {
  it('reads in the tenant’s locale, and is a dash with nothing to divide by', () => {
    expect(pct(45, 100, F)).toBe('45.0%');
    expect(pct(45, 100, formatterFor({ locale: 'de-DE', currency: 'EUR' })).replace(/ /g, ' ')).toBe('45,0 %');
    expect(pct(4500, 10000, F)).toBe('45%');
    expect(pct(3, 0, F)).toBe('—');
  });
});
