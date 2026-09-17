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

  it('says where it loses most beside the break, neutrally', () => {
    const data = report({
      suppressed: 55,
      suppressedBy: [{ stage: 'consent', decisions: 55, sampleDecisionId: 'dec_a' }],
    });
    pane(data, null);
    expect(screen.getByText('Where the loop breaks')).toBeTruthy();
    expect(screen.getByText('Where it loses most')).toBeTruthy();
    expect(screen.getByText('It loses most at Acted on: 20.0% of seen decisions were acted on, and 16 were not.')).toBeTruthy();
  });

  it('leaves why the rest offered nothing to the rail, and keeps the way into the funnel', () => {
    // Moved onto the Offered stage on 2026-09-17: the cause belongs on the stage
    // that dropped, and the Overview has no pane to put it in any more.
    const data = report({ suppressed: 55, suppressedBy: [{ stage: 'consent', decisions: 55, sampleDecisionId: 'dec_a' }] });
    const sentence = '55 decisions offered nothing: 55 at Consent.';
    expect(buildLoop(data, MARGINS, F).stages.find((s) => s.id === 'offered')?.detail).toBe(sentence);

    pane(data, 'offered');
    expect(screen.queryByText(sentence)).toBeNull();
    expect(screen.queryByText('Why the rest offered nothing')).toBeNull();
    expect(screen.getByRole('link', { name: /^Open the policy funnel/ }).getAttribute('href')).toBe('/targeting-policies');

    pane(data, null);
    expect(screen.queryByText(sentence)).toBeNull();
  });

  it('says there are too few rather than naming a stage at two decisions', () => {
    pane(
      report({
        decisions: 2, offered: 2, deliverable: 2, measured: 2, acted: 0,
        channels: [{ channel: 'web', decisions: 2, offered: 2, deliverable: 2, seen: 2, acted: 0, delivers: true }],
      }),
      null
    );
    expect(screen.getByText(/^Too few decisions to say where the loop loses most/)).toBeTruthy();
    expect(screen.queryByText(/^It loses most at/)).toBeNull();
  });

  it('quotes nothing for a stage with nothing to add', () => {
    pane(report(), 'decisions');
    expect(screen.queryByText('Why it breaks here')).toBeNull();
    expect(screen.queryByText('What these rates describe')).toBeNull();
    expect(screen.queryByText('Where the loop breaks')).toBeNull();
  });
});
