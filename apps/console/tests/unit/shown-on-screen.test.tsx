// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TraceEvidence } from '@/components/trace-evidence';
import { StaticFormatProvider } from '@/components/tenant-format';
import { LoopFirstPaint } from '@/components/loop-panes';
import { buildLoop, type LoopReport } from '@/lib/loop';
import { formatterFor } from '@/lib/format';
import { shownBy, offeredPhrase, offeredClause, slotOf } from '@/lib/shown';
import type { TraceDto } from '@/lib/api-client';

/**
 * A screen says what a decision showed, not only its winner — ADR-020 §1.
 *
 * Found by driving the storefront on 2026-09-18: the record held a slate of
 * three, and the trace headed it "5 candidates, one offered" over a funnel that
 * said three, named only the winner in "The decision", and marked only slot 1 in
 * the score table. And the ceiling on /performance quoted "41 delivered offers"
 * — a count of decisions — over a figure summed across 67 shown offers.
 */

afterEach(cleanup);

const SLATE = [
  { rank: 1, action: 'fios_gigabit', offerId: 'off_fios', priority: 0.18 },
  { rank: 2, action: '5g_home_ultimate', offerId: 'off_5g', priority: 0.17 },
  { rank: 3, action: 'gaming_plus_bundle', offerId: 'off_gaming', priority: 0.16 },
];

describe('what a decision showed', () => {
  it('is its slate, in slot order, and a record with none showed its winner', () => {
    expect(shownBy({ winner: 'fios_gigabit', slate: SLATE }).map((e) => e.action)).toEqual([
      'fios_gigabit',
      '5g_home_ultimate',
      'gaming_plus_bundle',
    ]);
    expect(shownBy({ winner: 'fios_gigabit', slate: [] })).toEqual([{ rank: 1, action: 'fios_gigabit' }]);
    expect(shownBy({ winner: null })).toEqual([]);
    expect(slotOf(shownBy({ winner: 'fios_gigabit', slate: SLATE }), 'gaming_plus_bundle')).toBe(3);
    expect(slotOf(shownBy({ winner: 'fios_gigabit', slate: SLATE }), 'netflix')).toBeNull();
  });

  it('is said in words that count it', () => {
    expect([0, 1, 3].map(offeredPhrase)).toEqual(['none offered', 'one offered', '3 offered']);
    expect([0, 1, 3].map(offeredClause)).toEqual(['none was offered', '1 was offered', '3 were offered']);
  });
});

describe('the trace’s evidence pane, before a stage is chosen', () => {
  const pane = (trace: Partial<TraceDto>) =>
    render(
      <TraceEvidence
        trace={{ id: 'dec_x', candidateCount: 5, eliminations: [], timings: {}, fieldOrigins: [], sourceCalls: [], ...trace } as unknown as TraceDto}
        stage={null}
        group={null}
        policies={[]}
        packageVersions={{}}
        policySources={{} as never}
      />
    );

  it('lists every offer a multi-slot decision showed, by slot', () => {
    pane({ winner: 'fios_gigabit', slate: SLATE } as never);
    expect(screen.getByText('What it showed')).toBeTruthy();
    expect(screen.getByText('1. fios_gigabit')).toBeTruthy();
    expect(screen.getByText('2. 5g_home_ultimate')).toBeTruthy();
    expect(screen.getByText('3. gaming_plus_bundle')).toBeTruthy();
  });

  it('names the one offer of a single-slot decision as it always did', () => {
    pane({ winner: 'fios_gigabit', slate: [SLATE[0]] } as never);
    expect(screen.getByText('The decision')).toBeTruthy();
    expect(screen.getByText('fios_gigabit')).toBeTruthy();
  });
});

describe('the ceiling says how many offers it is over', () => {
  it('counts the offers shown on channels that deliver, not the decisions', () => {
    // One grid decision that showed three offers on web, which delivers.
    const data = {
      decisions: 1,
      offered: 1,
      deliverable: 1,
      measured: 1,
      acted: 0,
      from: null,
      to: null,
      channels: [{ channel: 'web', decisions: 1, offered: 1, deliverable: 1, seen: 1, acted: 0, delivers: true }],
      rows: SLATE.map((e) => ({ action: e.action, channel: 'web', flowId: 'f', offered: 1, measured: 1, valueMinor: null })),
      series: [{ decisions: 1, offered: 1, deliverable: 1, seen: 1, acted: 0 }],
    } as unknown as LoopReport;
    const settings = { locale: 'en-US', currency: 'USD' } as const;
    const loop = buildLoop(data, new Map(SLATE.map((e) => [e.action, 10_000])), formatterFor(settings));
    expect(loop.deliveredOffers).toBe(3);
    expect(loop.expectedDelivered).toBe(30_000);
    // The figure is the claim; the sentence that restated its count under the
    // card was removed on 2026-09-18. The ceiling is still over three offers.
    const { container } = render(
      <StaticFormatProvider settings={settings}>
        <LoopFirstPaint data={data} loop={loop} />
      </StaticFormatProvider>
    );
    expect(container.textContent).toContain('$300.00');
  });
});
