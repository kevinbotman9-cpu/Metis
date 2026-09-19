// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import { ageInWords } from '@/lib/age';
import { buildLoop, type LoopReport } from '@/lib/loop';
import { formatterFor } from '@/lib/format';
import { Sparkline } from '@/components/ui/health-summary';
import { LoopFlow, LOOP_FLOW } from '@/components/loop-flow';
import { FunnelFirstPaint } from '@/components/policy-funnel-panes';
import { StaticFormatProvider } from '@/components/tenant-format';
import type { FunnelView } from '@/lib/policy-funnel';
import type { PolicyFunnelReportDto } from '@/lib/api-client';

/**
 * Five things that read wrong at low volume, found by driving an empty console
 * through its screens on 2026-09-17 rather than by a locator. Each passed every
 * check that existed, because every check asserted a sentence existed — none of
 * them read it.
 */

afterEach(cleanup);
const inTenant = (ui: ReactElement) =>
  render(<StaticFormatProvider settings={{ locale: 'en-US', currency: 'USD' }}>{ui}</StaticFormatProvider>);

describe('a cached value says its age in a unit a person reads', () => {
  it('uses seconds, minutes, hours and days', () => {
    // "77023s older than this decision" was on the trace, for a value about 21
    // hours old.
    expect(ageInWords(16)).toBe('16s');
    expect(ageInWords(89)).toBe('89s');
    expect(ageInWords(246)).toBe('4 min');
    expect(ageInWords(4969)).toBe('83 min');
    expect(ageInWords(77_023)).toBe('21 h');
    expect(ageInWords(3 * 86_400)).toBe('3 days');
    expect(ageInWords(129_600)).toBe('2 days');
  });
});

describe('the loop names its channels in the singular', () => {
  it('says "1 channel"', () => {
    // A storefront-driven tenant has one channel, so "1 channels" was on every
    // stage rail it drew.
    const report = {
      decisions: 2, offered: 2, deliverable: 2, measured: 2, acted: 0, from: null, to: null,
      channels: [{ channel: 'web', decisions: 2, offered: 2, deliverable: 2, seen: 2, acted: 0, delivers: true }],
      rows: [], series: [],
    } as unknown as LoopReport;
    const loop = buildLoop(report, new Map(), formatterFor({ locale: 'en-US', currency: 'USD' }));
    expect(loop.stages[0].note).toBe('1 channel');
  });
});

describe('a sparkline with one day of data draws no bar', () => {
  it('says there is no trend yet, in the slot a trend would take', () => {
    // One value drew one bar — a lone tick under every stage and trend card on a
    // day-old tenant, which read as a rendering fault.
    const { container, getByText } = render(<Sparkline values={[2]} label="Decisions per day" />);
    expect(getByText('one day so far')).toBeTruthy();
    expect(container.querySelectorAll('span[aria-hidden]')).toHaveLength(0);
  });

  it('still draws bars from two days on', () => {
    const { container } = render(<Sparkline values={[2, 5]} label="Decisions per day" />);
    expect(container.querySelectorAll('span[aria-hidden]')).toHaveLength(2);
  });
});

describe('the loop flow at zero draws its shape and no empty canvas', () => {
  const stages = ['Decisions made', 'Offered something', 'Deliverable', 'Seen', 'Acted on'].map((label, i) => ({
    id: String(i),
    label,
    value: 0,
  }));

  it('outlines every column, and stops the drawing at the band', () => {
    // At zero it drew nothing inside the full canvas: about 300px of card under
    // five zeros, which read as a chart that failed to load.
    const { container } = inTenant(<LoopFlow stages={stages} />);
    expect(container.querySelectorAll('rect[data-part="stage-empty"]')).toHaveLength(stages.length);
    const [, , , h] = container.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    expect(h).toBeLessThan(LOOP_FLOW.height);
    expect(h).toBeGreaterThan(LOOP_FLOW.top + LOOP_FLOW.band);
  });

  it('draws filled columns at full height as soon as anything has entered', () => {
    const { container } = inTenant(<LoopFlow stages={stages.map((s, i) => ({ ...s, value: 5 - i }))} />);
    expect(container.querySelectorAll('rect[data-part="stage-empty"]')).toHaveLength(0);
    expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe(`0 0 ${LOOP_FLOW.width} ${LOOP_FLOW.height}`);
  });
});

describe('the funnel headline ends in a sentence', () => {
  const report = { entered: 10, decisions: 2, offered: 2, stages: [] } as unknown as PolicyFunnelReportDto;
  const view = (rule: Record<string, unknown>): FunnelView =>
    ({
      stages: [],
      largest: { id: 'not_ranked', removed: 8, survived: 2, asked: true, rules: [rule] },
    }) as unknown as FunnelView;

  it('does not attach "alone removes" to a code with no rule', () => {
    // It read: "…beaten on priority by something else. alone removes 8."
    const { container } = inTenant(
      <FunnelFirstPaint
        report={report}
        view={view({ ruleId: null, code: 'NOT_RANKED', removed: 8, decisions: 2, sampleDecisionId: 'dec_a' })}
      />
    );
    expect(container.textContent).not.toMatch(/alone removes/);
    expect(container.textContent).toMatch(/ranked below every slot the placement had\./);
  });

  it('still names a rule that did the removing', () => {
    const { container } = inTenant(
      <FunnelFirstPaint
        report={report}
        view={view({ ruleId: 'tp_fiber_serviceable', code: 'ELIGIBILITY_FAILED', removed: 8, decisions: 2, sampleDecisionId: 'dec_a' })}
      />
    );
    expect(container.textContent).toMatch(/tp_fiber_serviceable alone removes 8\./);
  });
});
