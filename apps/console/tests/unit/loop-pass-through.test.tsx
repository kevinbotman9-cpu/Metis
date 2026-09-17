// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StaticFormatProvider } from '@/components/tenant-format';
import { CascadeRail } from '@/components/cascade-rail';
import { LoopFlow, mergeEqualRuns, LOOP_FLOW } from '@/components/loop-flow';
import { LoopStageEvidence } from '@/components/loop-panes';
import { buildLoop, type LoopReport } from '@/lib/loop';
import { formatterFor } from '@/lib/format';

/**
 * A loop at the volume a person makes by hand.
 *
 * Twenty-six decisions from the storefront read 26 · 26 · 26 · 26 · 0: web is
 * the only channel, and web delivers, so Deliverable cannot be anything but
 * Offered. Drawn as three full bars and four full bands, that is the shape a
 * broken outcome join draws. The product owner's answer on 2026-09-17: a stage
 * that *cannot* drop is drawn as a pass-through that says why; a stage that
 * could have dropped and did not keeps its bar; and the flow diagram draws a
 * run of equal stages as one column. Nothing collapses into a sentence.
 */

afterEach(cleanup);

const SETTINGS = { locale: 'en-US', currency: 'USD' } as const;
const F = formatterFor(SETTINGS);

/** The hand-made loop: one channel, and it delivers. */
const byHand = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    decisions: 26,
    offered: 26,
    deliverable: 26,
    measured: 26,
    acted: 0,
    from: null,
    to: null,
    channels: [{ channel: 'web', decisions: 26, offered: 26, deliverable: 26, seen: 26, acted: 0, delivers: true }],
    rows: [{ action: 'fios_gigabit', channel: 'web', flowId: 'next-best-action', offered: 26, measured: 26, valueMinor: null }],
    series: [{ decisions: 26, offered: 26, deliverable: 26, seen: 26, acted: 0 }],
    ...over,
  }) as unknown as LoopReport;

/** The same, after someone asked for an email nothing sends. */
const withEmail = byHand({
  decisions: 27,
  offered: 27,
  channels: [
    { channel: 'web', decisions: 26, offered: 26, deliverable: 26, seen: 26, acted: 0, delivers: true },
    { channel: 'email', decisions: 1, offered: 1, deliverable: 0, seen: 0, acted: 0, delivers: false },
  ],
});

const MARGINS = new Map([['fios_gigabit', 10000]]);
const stage = (data: LoopReport, id: string) => buildLoop(data, MARGINS, F).stages.find((s) => s.id === id)!;

describe('a stage that cannot drop', () => {
  it('is Deliverable when every channel that offered something delivers it, and says so by name', () => {
    const deliverable = stage(byHand(), 'deliverable');
    expect(deliverable.passThrough).toMatch(/every channel that offered something delivers it \(Web\)/);
    expect(deliverable.broken).toBeUndefined();
  });

  it('is not a pass-through once an offer wins a channel with no sender — that is the break', () => {
    const deliverable = stage(withEmail, 'deliverable');
    expect(deliverable.passThrough).toBeUndefined();
    expect(deliverable.broken).toMatch(/Email/);
  });

  it('is not a pass-through when the report cannot say what delivers, or nothing was offered', () => {
    expect(stage(byHand({ deliverable: null }), 'deliverable').passThrough).toBeUndefined();
    expect(
      stage(byHand({ offered: 0, deliverable: 0, measured: 0, channels: [{ channel: 'web', decisions: 26, offered: 0, deliverable: 0, seen: 0, acted: 0, delivers: true }] }), 'deliverable').passThrough
    ).toBeUndefined();
  });

  it('leaves every stage that could have dropped as it was, whole or not', () => {
    const loop = buildLoop(byHand(), MARGINS, F);
    // Offered and Seen are 100% here, and either could have been less.
    expect(loop.stages.filter((s) => s.passThrough).map((s) => s.id)).toEqual(['deliverable']);
  });
});

describe('the rail', () => {
  const rail = (data: LoopReport) =>
    render(
      <StaticFormatProvider settings={SETTINGS}>
        <CascadeRail label="The loop" stages={buildLoop(data, MARGINS, F).stages} selected={null} onSelect={() => {}} />
      </StaticFormatProvider>
    );

  it('draws the pass-through with no bar and no sparkline, and says why beneath the figure', () => {
    const { container } = rail(byHand());
    const button = screen.getByRole('button', { name: /^Deliverable: / });
    expect(button.querySelector('[data-part="pass-through"]')).not.toBeNull();
    expect(button.querySelector('[data-part="bar"]')).toBeNull();
    expect(button.querySelector('svg')).toBeNull();
    expect(button.textContent).toMatch(/Nothing offered can drop here/);
    // Its accessible name carries the reason too: a screen reader hears why.
    expect(button.getAttribute('aria-label')).toMatch(/Nothing offered can drop here/);
    // Every other stage keeps its bar.
    expect(container.querySelectorAll('[data-part="bar"]')).toHaveLength(4);
  });

  it('draws a bar for Deliverable again when it could drop', () => {
    const { container } = rail(withEmail);
    expect(container.querySelectorAll('[data-part="pass-through"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-part="bar"]')).toHaveLength(5);
  });
});

describe('the evidence pane', () => {
  it('quotes the reason when the pass-through is selected', () => {
    const data = byHand();
    render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopStageEvidence data={data} loop={buildLoop(data, MARGINS, F)} stage="deliverable" />
      </StaticFormatProvider>
    );
    expect(screen.getByText('Why nothing can drop here')).toBeTruthy();
  });
});

describe('the flow diagram', () => {
  const flow = (data: LoopReport) =>
    render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFlow stages={buildLoop(data, MARGINS, F).stages.map((s) => ({ ...s, broken: Boolean(s.broken) }))} />
      </StaticFormatProvider>
    );

  it('merges consecutive equal stages, and only consecutive ones', () => {
    const columns = mergeEqualRuns([
      { id: 'a', label: 'A', value: 5 },
      { id: 'b', label: 'B', value: 5 },
      { id: 'c', label: 'C', value: 2 },
      { id: 'd', label: 'D', value: 5 },
    ]);
    expect(columns.map((c) => [c.labels, c.value])).toEqual([
      [['A', 'B'], 5],
      [['C'], 2],
      [['D'], 5],
    ]);
  });

  it('draws the hand-made loop as two columns, naming every stage in the first', () => {
    const { container } = flow(byHand());
    const columns = [...container.querySelectorAll('g[data-part="column"]')];
    expect(columns.map((g) => g.getAttribute('data-stages'))).toEqual(['4', '1']);
    expect(columns[0].textContent).toContain('Decisions made');
    expect(columns[0].textContent).toContain('Seen');
    // One transition, where the volume actually left.
    expect(container.querySelectorAll('path[data-part="leave"]')).toHaveLength(1);
    // The names stack above the columns, so the columns start below them.
    const [, , , h] = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    expect(h).toBe(LOOP_FLOW.height + 3 * LOOP_FLOW.line);
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toMatch(/drawn as one column/);
  });

  it('keeps a stage its own column once its figure differs', () => {
    const { container } = flow(withEmail);
    expect(
      [...container.querySelectorAll('g[data-part="column"]')].map((g) => g.getAttribute('data-stages'))
    ).toEqual(['2', '2', '1']);
  });

  it('does not merge an empty loop: its outlined columns are the shape about to be filled', () => {
    const empty = byHand({
      decisions: 0, offered: 0, deliverable: 0, measured: 0, acted: 0,
      channels: [], rows: [], series: [],
    });
    const { container } = flow(empty);
    expect(container.querySelectorAll('rect[data-part="stage-empty"]')).toHaveLength(5);
  });
});
