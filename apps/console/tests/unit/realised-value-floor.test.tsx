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
  it('names the valued decisions, not the acted-on ones, beside the acted-on count', () => {
    expect(buildLoop(report(REALISED_FLOOR), MARGINS, F).realisedLine).toBe('from 100 valued outcomes, of 278 acted on');
  });

  it('says the figure is thin below the floor, with a spread computed from the count', () => {
    const line = buildLoop(report(24), MARGINS, F).realisedLine;
    expect(line).toBe(
      'from 24 valued outcomes, of 278 acted on — too few to read as a return: a count this small moves by about 20% with no change in behaviour'
    );
    // 1/√n, not a figure written into a sentence: 25 gives 20%, 4 gives 50%.
    expect(buildLoop(report(4), MARGINS, F).realisedLine).toMatch(/about 50%/);
    expect(buildLoop(report(1), MARGINS, F).realisedLine).toMatch(/^from 1 valued outcome, of/);
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
  it('is held at the floor and above, and never below it', () => {
    expect(buildLoop(report(REALISED_FLOOR - 1), MARGINS, F).realisedAccent).toBe(false);
    expect(buildLoop(report(REALISED_FLOOR), MARGINS, F).realisedAccent).toBe(true);
  });

  it('is on no figure at all when nothing carried a value', () => {
    const none = report(0, {
      rows: [{ action: 'fios_gigabit', channel: 'web', flowId: 'next-best-action', offered: 600, measured: 400, valueMinor: null }],
    });
    expect(buildLoop(none, MARGINS, F).realisedAccent).toBe(false);
  });

  const paint = (valued: number) => {
    const data = report(valued);
    return render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFirstPaint data={data} loop={buildLoop(data, MARGINS, F)} />
      </StaticFormatProvider>
    );
  };

  it('draws the figure plain below the floor, and nothing else on the first paint takes the accent', () => {
    const { container } = paint(24);
    expect(screen.getByText('$2,279.09')).toBeTruthy();
    expect(container.querySelectorAll('.text-accent')).toHaveLength(0);
    expect(container.querySelectorAll('.bg-accent-subtle')).toHaveLength(0);
    expect(screen.getByText(/too few to read as a return/)).toBeTruthy();
  });

  it('draws the figure in the accent at the floor', () => {
    const { container } = paint(REALISED_FLOOR);
    const accented = container.querySelectorAll('.text-accent');
    expect(accented).toHaveLength(1);
    expect(accented[0].textContent).toBe('$2,279.09');
  });
});
