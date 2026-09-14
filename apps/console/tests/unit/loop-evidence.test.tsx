// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StaticFormatProvider } from '@/components/tenant-format';
import { LoopStageEvidence } from '@/components/loop-panes';
import { buildLoop, type LoopReport } from '@/lib/loop';
import { formatterFor } from '@/lib/format';

/**
 * The loop's evidence pane. Its quote is a sentence the loop already derives —
 * the break's own statement, and the population the rates below it describe —
 * and a stage with nothing to add has none. A quote written here instead would
 * be a claim nothing computed.
 *
 * The report is the one `loop.test.ts` builds: a hundred decisions over three
 * channels, only web delivering, so the break is real.
 */

afterEach(cleanup);

const SETTINGS = { locale: 'en-US', currency: 'USD' } as const;
const F = formatterFor(SETTINGS);

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
    ],
    series: [{ decisions: 100, offered: 45, deliverable: 30, seen: 20, acted: 4 }],
    ...over,
  }) as unknown as LoopReport;

const MARGINS = new Map([['fios_gigabit', 10000]]);

const pane = (data: LoopReport, stage: string | null) =>
  render(
    <StaticFormatProvider settings={SETTINGS}>
      <LoopStageEvidence data={data} loop={buildLoop(data, MARGINS, F)} stage={stage} />
    </StaticFormatProvider>
  );

describe('the loop evidence quote', () => {
  it('quotes the break’s own sentence for the loop whole', () => {
    const data = report();
    const broken = buildLoop(data, MARGINS, F).stages.find((s) => s.broken)!.broken!;
    pane(data, null);
    expect(screen.getByText('Where the loop breaks')).toBeTruthy();
    expect(screen.getByText(broken)).toBeTruthy();
  });

  it('quotes nothing for the whole when every channel delivers', () => {
    const whole = report({
      deliverable: 45,
      channels: [
        { channel: 'web', decisions: 70, offered: 30, deliverable: 30, seen: 20, acted: 4, delivers: true },
        { channel: 'email', decisions: 30, offered: 15, deliverable: 15, seen: 0, acted: 0, delivers: true },
      ],
    });
    pane(whole, null);
    expect(screen.queryByText('Where the loop breaks')).toBeNull();
  });

  it('says why it breaks at the break, and offers the coverage matrix', () => {
    const data = report();
    const broken = buildLoop(data, MARGINS, F).stages.find((s) => s.id === 'deliverable')!.broken!;
    pane(data, 'deliverable');
    expect(screen.getByText('Why it breaks here')).toBeTruthy();
    expect(screen.getByText(broken)).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Open the coverage matrix/ }).getAttribute('href')).toBe(
      '/creatives?view=coverage'
    );
  });

  it('names the population the rates below the break describe', () => {
    pane(report(), 'seen');
    expect(screen.getByText('What these rates describe')).toBeTruthy();
    expect(screen.getByText(/measured on Web only, not decisions made/)).toBeTruthy();
  });

  it('quotes nothing for a stage with nothing to add', () => {
    pane(report(), 'decisions');
    expect(screen.queryByText('Why it breaks here')).toBeNull();
    expect(screen.queryByText('What these rates describe')).toBeNull();
    expect(screen.queryByText('Where the loop breaks')).toBeNull();
  });
});
