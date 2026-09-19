// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StaticFormatProvider } from '@/components/tenant-format';
import { LoopFirstPaint } from '@/components/loop-panes';
import { buildLoop, REALISED_FLOOR, LOSES_MOST_FLOOR, type LoopReport } from '@/lib/loop';
import { formatterFor } from '@/lib/format';

/**
 * Realised value says what it rests on, and is emphasised only when that is
 * enough. ADR-023, accepted 2026-09-17.
 *
 * Measured before this was built: re-rolling the outcome model 200 times over
 * the seeded 10,400 decisions moved realised value by 17.7% (coefficient of
 * variation), against 5.7% for acted on — and the spread followed the count of
 * valued decisions, not their values. The card said "from 278 acted on" while
 * the figure rested on 24.
 */

afterEach(cleanup);

const SETTINGS = { locale: 'en-US', currency: 'USD' } as const;
const F = formatterFor(SETTINGS);
const MARGINS = new Map([['fios_gigabit', 10000]]);

const report = (valued: number, over: Partial<Record<string, unknown>> = {}) =>
  ({
    decisions: 1000,
    offered: 600,
    deliverable: 600,
    measured: 400,
    acted: 278,
    valued,
    from: null,
    to: null,
    channels: [{ channel: 'web', decisions: 1000, offered: 600, deliverable: 600, seen: 400, acted: 278, delivers: true }],
    rows: [{ action: 'fios_gigabit', channel: 'web', flowId: 'next-best-action', offered: 600, measured: 400, valueMinor: 227909 }],
    series: [{ decisions: 1000, offered: 600, deliverable: 600, seen: 400, acted: 278 }],
    ...over,
  }) as unknown as LoopReport;

describe('the line under realised value', () => {
  it('names the count the figure rests on: the valued decisions, not the acted-on ones', () => {
    expect(buildLoop(report(REALISED_FLOOR), MARGINS, F).realisedLine).toBe('100 valued');
  });

  it('says the figure is too few to read below the floor, beside the count', () => {
    // ADR-023 §2, amended 2026-09-18: two facts, and no more. The acted-on
    // count and the computed spread took the line to five lines on the Overview.
    expect(buildLoop(report(24), MARGINS, F).realisedLine).toBe('24 valued — too few to read');
    expect(buildLoop(report(1), MARGINS, F).realisedLine).toBe('1 valued — too few to read');
    expect(buildLoop(report(REALISED_FLOOR - 1), MARGINS, F).realisedLine).toBe('99 valued — too few to read');
  });

  it('keeps the sentences for no value at all', () => {
    const clicksOnly = report(0, {
      rows: [{ action: 'fios_gigabit', channel: 'web', flowId: 'next-best-action', offered: 600, measured: 400, valueMinor: null }],
    });
    expect(buildLoop(clicksOnly, MARGINS, F).realisedLine).toBe('278 acted on, none carrying a value');
    expect(buildLoop(report(0, { ...clicksOnly, acted: 0 }), MARGINS, F).realisedLine).toBe('nothing acted on yet');
  });

  it('is not the "loses most" floor, which bounds a share rather than a sum', () => {
    expect(REALISED_FLOOR).toBe(100);
    expect(REALISED_FLOOR).not.toBe(LOSES_MOST_FLOOR);
  });
});

describe('the accent', () => {
  const paint = (valued: number) => {
    const data = report(valued);
    return render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFirstPaint data={data} loop={buildLoop(data, MARGINS, F)} />
      </StaticFormatProvider>
    );
  };

  it('never takes the page’s accent, at any count (ADR-023 §3, amended)', () => {
    // It held the accent for a few hours on 2026-09-17. The figure is a dash
    // whenever nothing carried a value and plain below the floor, so the page
    // had no visible accent at all; it is on the funnel's largest drop now.
    for (const valued of [24, REALISED_FLOOR, REALISED_FLOOR * 3]) {
      const { container, unmount } = paint(valued);
      expect(container.querySelectorAll('.text-accent')).toHaveLength(0);
      expect(container.querySelectorAll('.bg-accent-subtle')).toHaveLength(0);
      unmount();
    }
  });

  it('stands the per-day cards down until there is a trend to draw', () => {
    // One day is not a trend: the sparkline says "one day so far" and the
    // figures repeat the rail. Same rule as the pass-through stage — a card that
    // cannot say anything does not pretend to (product owner, 2026-09-17).
    const oneDay = report(2, { series: [{ decisions: 12, offered: 8, deliverable: 8, seen: 8, acted: 2 }] });
    const { unmount } = render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFirstPaint data={oneDay} loop={buildLoop(oneDay, MARGINS, F)} dense />
      </StaticFormatProvider>
    );
    expect(screen.queryByText('Decisions per day')).toBeNull();
    expect(screen.queryByText('Deliverable share')).toBeNull();
    expect(screen.queryByText(/one day so far/)).toBeNull();
    // The value cards stay: they are not trends.
    expect(screen.getByText('Realised value')).toBeTruthy();
    unmount();

    const twoDays = report(2, {
      series: [
        { decisions: 6, offered: 4, deliverable: 4, seen: 4, acted: 1 },
        { decisions: 6, offered: 4, deliverable: 4, seen: 4, acted: 1 },
      ],
    });
    render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFirstPaint data={twoDays} loop={buildLoop(twoDays, MARGINS, F)} dense />
      </StaticFormatProvider>
    );
    expect(screen.getByText('Decisions per day')).toBeTruthy();
  });

  it('puts no sentence under the two ceiling figures', () => {
    // It said "the same ceiling over the 0 nothing sent" once, and "every offer
    // had a channel that could send it" after that. Both explained a method;
    // the product owner removed them, and the sentence under the delivered
    // ceiling, on 2026-09-18.
    const whole = report(2, {
      offered: 600,
      deliverable: 600,
      channels: [{ channel: 'web', decisions: 1000, offered: 600, deliverable: 600, seen: 400, acted: 278, delivers: true }],
    });
    render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFirstPaint data={whole} loop={buildLoop(whole, MARGINS, F)} dense />
      </StaticFormatProvider>
    );
    expect(screen.getByText('Never had the chance')).toBeTruthy();
    expect(screen.queryByText(/every offer had a channel|ceiling over|a bound|not a forecast/)).toBeNull();
  });

  it('draws the figure plain below the floor, and says it is thin', () => {
    paint(24);
    expect(screen.getByText('$2,279.09')).toBeTruthy();
    expect(screen.getByText('24 valued — too few to read')).toBeTruthy();
  });

  it('says nothing about thinness at or above the floor', () => {
    paint(REALISED_FLOOR);
    expect(screen.getByText('100 valued')).toBeTruthy();
    expect(screen.queryByText(/too few to read/)).toBeNull();
  });
});
