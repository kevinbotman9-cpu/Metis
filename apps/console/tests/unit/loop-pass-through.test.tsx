// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StaticFormatProvider } from '@/components/tenant-format';
import { CascadeRail } from '@/components/cascade-rail';
import { LoopFlow, LOOP_FLOW, denseHeight } from '@/components/loop-flow';
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
 * could have dropped and did not keeps its bar. Nothing collapses into a
 * sentence. The flow diagram drew a run of equal stages as one column from
 * then until 2026-09-18, when that was found to be the funnel disappearing at
 * exactly the volume it was added for; it draws five columns again.
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
  const flow = (data: LoopReport, dense = false) => {
    const loop = buildLoop(data, MARGINS, F);
    return render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFlow
          dense={dense}
          accentStage={loop.accentStage}
          stages={loop.stages.map((s) => ({
            ...s,
            broken: Boolean(s.broken),
            tone: s.tone ?? 'neutral',
          }))}
        />
      </StaticFormatProvider>
    );
  };

  /** A loop with enough volume, and reported outcomes, for a drop to be named. */
  const reported = (over: Partial<Record<string, unknown>> = {}) =>
    byHand({
      decisions: 100,
      offered: 60,
      deliverable: 60,
      measured: 50,
      acted: 15,
      channels: [{ channel: 'web', decisions: 100, offered: 60, deliverable: 60, seen: 50, acted: 15, delivers: true }],
      series: [{ decisions: 100, offered: 60, deliverable: 60, seen: 50, acted: 15 }],
      ...over,
    });

  it('draws the hand-made loop as five columns, with one transition where the volume left', () => {
    const { container } = flow(byHand());
    const columns = [...container.querySelectorAll('g[data-part="column"]')];
    expect(columns.map((g) => g.getAttribute('data-stage'))).toEqual(['decisions', 'offered', 'deliverable', 'seen', 'acted']);
    // One drop, where the volume actually left. Not the accent: nothing has
    // been acted on, so no channel has reported an action, and an unreported
    // stage has not lost anything.
    expect(container.querySelectorAll('path[data-part="leave"]')).toHaveLength(1);
    expect(container.querySelectorAll('path[data-part="leave-most"]')).toHaveLength(0);
    const [, , , h] = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    expect(h).toBe(LOOP_FLOW.height);
  });

  it('spends the page’s one accent on the largest drop that is not the break', () => {
    // ADR-023 §3, amended 2026-09-17: realised value is a dash or too thin to
    // emphasise most of the time, so the accent went to the loss a person can
    // act on. Here: 40 offered nothing, 10 were not seen, 35 were seen and not
    // acted on. The largest is at Offered.
    const data = reported();
    expect(buildLoop(data, MARGINS, F).accentStage).toBe('offered');
    const { container } = flow(data);
    const accented = [...container.querySelectorAll('path[data-part="leave-most"]')];
    expect(accented).toHaveLength(1);
    expect(accented[0].getAttribute('class')).toContain('fill-accent');
    expect(container.querySelectorAll('.fill-accent\\/40')).toHaveLength(1);
  });

  it('never gives the accent to the break, even when the break is the largest drop', () => {
    // 260 of 300 offers won a channel nothing sends: the biggest loss on the
    // page is structural, and structural losses are the block colour. The
    // accent goes to the largest one a person can act on — the 20 seen and not
    // acted on.
    const mostlyDead = byHand({
      decisions: 300,
      offered: 300,
      deliverable: 40,
      measured: 30,
      acted: 10,
      channels: [
        { channel: 'web', decisions: 40, offered: 40, deliverable: 40, seen: 30, acted: 10, delivers: true },
        { channel: 'email', decisions: 260, offered: 260, deliverable: 0, seen: 0, acted: 0, delivers: false },
      ],
    });
    expect(buildLoop(mostlyDead, MARGINS, F).accentStage).toBe('acted');
    const { container } = flow(mostlyDead);
    const accented = [...container.querySelectorAll('path[data-part="leave-most"]')];
    expect(accented).toHaveLength(1);
    expect(accented[0].getAttribute('class')).toContain('fill-accent');
    expect(accented[0].getAttribute('class')).not.toContain('fill-block');
    const blocked = [...container.querySelectorAll('path[data-part="leave"]')].filter((d) =>
      (d.getAttribute('class') ?? '').includes('fill-block')
    );
    expect(blocked).toHaveLength(1);
  });

  it('names no drop at two decisions with nothing acted on — the product owner’s screenshot, 2026-09-18', () => {
    // It accented "−2" at Acted on: all of the volume, on a stage no channel had
    // reported an action for, from two decisions. Both of the loop's guards say
    // that is not a loss yet — the floor of 20 and "unreported is not lost".
    const two = byHand({
      decisions: 2,
      offered: 2,
      deliverable: 2,
      measured: 2,
      acted: 0,
      channels: [{ channel: 'web', decisions: 2, offered: 2, deliverable: 2, seen: 2, acted: 0, delivers: true }],
      series: [{ decisions: 2, offered: 2, deliverable: 2, seen: 2, acted: 0 }],
    });
    expect(buildLoop(two, MARGINS, F).accentStage).toBeNull();
    const { container } = flow(two, true);
    expect(container.querySelectorAll('path[data-part="leave-most"]')).toHaveLength(0);
  });

  it('holds the accent to the floor: a drop from fewer than 20 is not named', () => {
    // 19 decisions, 10 offered nothing: a share over 19 is not compared, and
    // neither is a drop from it.
    const nineteen = reported({
      decisions: 19,
      offered: 9,
      deliverable: 9,
      measured: 9,
      acted: 3,
      channels: [{ channel: 'web', decisions: 19, offered: 9, deliverable: 9, seen: 9, acted: 3, delivers: true }],
    });
    expect(buildLoop(nineteen, MARGINS, F).accentStage).toBeNull();
  });

  it('takes the rail’s colour for each stage, and the break’s', () => {
    // The funnel was one pale blue beside a coloured rail until 2026-09-17, so
    // the two read as separate things. Same stages, same tones, different
    // tokens: `--rail-*` on the frame, the analytic ones on a white card.
    // Acted on is zero here, so it draws no bar at all.
    const { container } = flow(withEmail);
    const fills = [...container.querySelectorAll('rect[data-part="stage"]')].map((r) => r.getAttribute('class'));
    expect(fills).toHaveLength(4);
    expect(fills[0]).toContain('fill-content-subtle');
    expect(fills[1]).toContain('fill-accent');
    expect(fills[2]).toContain('fill-block');
    expect(fills[3]).toContain('fill-hold');

    const distinct = flow(byHand({ offered: 20, deliverable: 20, measured: 10, acted: 5 }));
    const more = [...distinct.container.querySelectorAll('rect[data-part="stage"]')].map((r) => r.getAttribute('class'));
    expect(more).toHaveLength(5);
    expect(more[1]).toContain('fill-accent');
    expect(more[3]).toContain('fill-hold');
    expect(more[4]).toContain('fill-pass');
  });

  it('draws the Overview’s funnel on its own canvas, filling the box inside its card', () => {
    const { container } = flow(byHand(), true);
    const box = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    expect(box[2]).toBe(LOOP_FLOW.denseWidth);
    const stages = buildLoop(byHand(), MARGINS, F).stages.map((s) => ({ ...s, broken: Boolean(s.broken) }));
    expect(box[3]).toBe(denseHeight(stages));
    expect(container.querySelector('svg')!.getAttribute('class')).toContain('absolute inset-0');
  });

  it('outlines all five columns of an empty loop: the shape about to be filled', () => {
    const empty = byHand({
      decisions: 0, offered: 0, deliverable: 0, measured: 0, acted: 0,
      channels: [], rows: [], series: [],
    });
    const { container } = flow(empty);
    expect(container.querySelectorAll('rect[data-part="stage-empty"]')).toHaveLength(5);
  });
});

/**
 * What the funnel shows, not only that it fits.
 *
 * Every version in the product owner's side-by-side of 2026-09-18 passed the
 * Overview's fit check — including the one where the funnel had become a band
 * with four names stacked over one bar. A fit check is satisfied by a drawing
 * of any shape. These pin the shape: five columns at every volume, a bar of
 * real height for every stage something reached, and nothing for a stage
 * nothing reached.
 */
describe('what the funnel shows', () => {
  const volumes: Record<string, LoopReport> = {
    'two decisions': byHand({
      decisions: 2, offered: 2, deliverable: 2, measured: 2, acted: 0,
      channels: [{ channel: 'web', decisions: 2, offered: 2, deliverable: 2, seen: 2, acted: 0, delivers: true }],
      series: [{ decisions: 2, offered: 2, deliverable: 2, seen: 2, acted: 0 }],
    }),
    'twelve decisions': byHand({
      decisions: 12, offered: 8, deliverable: 8, measured: 8, acted: 2,
      channels: [{ channel: 'web', decisions: 12, offered: 8, deliverable: 8, seen: 8, acted: 2, delivers: true }],
      series: [{ decisions: 12, offered: 8, deliverable: 8, seen: 8, acted: 2 }],
    }),
    'the seeded corpus': byHand({
      decisions: 10_400, offered: 4688, deliverable: 1686, measured: 1228, acted: 278,
      channels: [
        { channel: 'web', decisions: 1686, offered: 1686, deliverable: 1686, seen: 1228, acted: 278, delivers: true },
        { channel: 'email', decisions: 8714, offered: 3002, deliverable: 0, seen: 0, acted: 0, delivers: false },
      ],
      series: [{ decisions: 10_400, offered: 4688, deliverable: 1686, seen: 1228, acted: 278 }],
    }),
  };

  const draw = (data: LoopReport, dense: boolean) => {
    const loop = buildLoop(data, MARGINS, F);
    const { container } = render(
      <StaticFormatProvider settings={SETTINGS}>
        <LoopFlow
          dense={dense}
          accentStage={loop.accentStage}
          stages={loop.stages.map((s) => ({ ...s, broken: Boolean(s.broken), tone: s.tone ?? 'neutral' }))}
        />
      </StaticFormatProvider>
    );
    return { loop, svg: container.querySelector('svg')! };
  };

  for (const [name, data] of Object.entries(volumes)) {
    for (const dense of [false, true]) {
      const where = dense ? 'on the Overview' : 'on /performance';

      it(`draws five columns at ${name} ${where}, each naming one stage`, () => {
        const { loop, svg } = draw(data, dense);
        const columns = [...svg.querySelectorAll('g[data-part="column"]')];
        expect(columns.map((g) => g.getAttribute('data-stage'))).toEqual(loop.stages.map((s) => s.id));
        expect(columns).toHaveLength(5);
        columns.forEach((g, i) => {
          const texts = [...g.querySelectorAll('text')].map((t) => t.textContent);
          // A figure and one name: no column carries two stages' names.
          expect(texts).toEqual([F.number(loop.stages[i].value), loop.stages[i].label]);
        });
      });

      it(`draws a bar for every stage something reached at ${name} ${where}, and nothing for one nothing did`, () => {
        const { loop, svg } = draw(data, dense);
        const band = dense ? LOOP_FLOW.denseBand : LOOP_FLOW.band;
        const top = Math.max(...loop.stages.map((s) => s.value));
        for (const s of loop.stages) {
          const g = svg.querySelector(`g[data-stage="${s.id}"]`)!;
          const bar = g.querySelector('rect[data-part="stage"]');
          if (s.value === 0) {
            // Nothing: no bar, no outline, and no band carrying nothing into it.
            expect(g.querySelector('rect')).toBeNull();
            continue;
          }
          const h = Number(bar!.getAttribute('height'));
          // In proportion to the first stage, and never thinner than the
          // scale's floor: a trickle is still visible.
          expect(h).toBeCloseTo(Math.max(1.5, (s.value / top) * band), 5);
          expect(h).toBeGreaterThanOrEqual(1.5);
        }
        // The first stage is the full band.
        expect(Number(svg.querySelector('rect[data-part="stage"]')!.getAttribute('height'))).toBe(band);
        const carries = svg.querySelectorAll('path[data-part="carry"]').length;
        expect(carries).toBe(loop.stages.slice(1).filter((s) => s.value > 0).length);
      });
    }
  }

  it('keeps the Overview’s band in proportion to its width: a funnel, not a strip', () => {
    // 96 against 1000 was the strip of 2026-09-17. `/performance` is 120 against
    // 720; the Overview may be wider, not flatter than about two thirds of that.
    expect(LOOP_FLOW.denseBand / LOOP_FLOW.denseWidth).toBeGreaterThanOrEqual(0.13);
    expect(LOOP_FLOW.denseBand).toBeGreaterThanOrEqual(LOOP_FLOW.band);
  });

  it('reserves only the depth the deepest drop falls, and every drop fits in it', () => {
    for (const data of Object.values(volumes)) {
      const { svg } = draw(data, true);
      const [, , , h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      // Every drop's lowest point is inside the canvas.
      for (const path of svg.querySelectorAll('path[data-part^="leave"]')) {
        const ys = [...path.getAttribute('d')!.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number).filter((_, i) => i % 2 === 1);
        expect(Math.max(...ys)).toBeLessThanOrEqual(h);
      }
    }
    // Twelve decisions lose at most half of the band at once, so the canvas is
    // shorter than one reserved for losing all of it.
    const { svg } = draw(volumes['twelve decisions'], true);
    const [, , , h12] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const { top, denseBand, denseDropGap, densePad } = LOOP_FLOW;
    expect(h12).toBeLessThan(top + denseBand + denseDropGap + denseBand + densePad);
  });
});
