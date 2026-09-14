// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StaticFormatProvider } from '@/components/tenant-format';
import { FunnelStageEvidence } from '@/components/policy-funnel-panes';
import { CODE_MEANING } from '@/components/trace-cascade';
import type { PolicyFunnelReportDto } from '@/lib/api-client';

/**
 * The policy funnel's evidence pane. Its quote is the meaning of the stage's own
 * reason codes, from the closed set the trace reads, so the funnel and one
 * decision's trace explain a removal in the same words; a stage no flow asks
 * says so rather than quoting a meaning for a question nobody put.
 */

afterEach(cleanup);

const SETTINGS = { locale: 'en-US', currency: 'USD' } as const;

const stage = (
  id: PolicyFunnelReportDto['stages'][number]['id'],
  codes: string[],
  removed: number,
  survived: number,
  asked: boolean | null = true,
  rules: PolicyFunnelReportDto['stages'][number]['rules'] = []
) => ({ id, codes, asked, removed, survived, rules });

const report: PolicyFunnelReportDto = {
  decisions: 100,
  entered: 500,
  offered: 40,
  unaccounted: 0,
  from: '2026-06-01T00:00:00.000Z',
  to: '2026-06-30T00:00:00.000Z',
  stages: [
    stage('not_live', ['NOT_ACTIVE', 'OUT_OF_VALIDITY_WINDOW'], 0, 500),
    stage('eligibility', ['ELIGIBILITY_FAILED'], 200, 300, true, [
      { ruleId: 'pol_fios_serviceable', code: 'ELIGIBILITY_FAILED', removed: 200, decisions: 90, sampleDecisionId: 'dec_sample' },
    ]),
    stage('relevance', ['RELEVANCE_FAILED'], 220, 80),
    stage('suitability', ['SUITABILITY_FAILED'], 0, 80, false),
    stage('consent', ['CONSENT_WITHHELD'], 10, 70),
    stage('frequency', ['FREQUENCY_CAP_BREACHED', 'COOLDOWN_ACTIVE'], 0, 70),
    stage('not_ranked', ['NOT_RANKED'], 30, 40),
  ],
};

const pane = (stageId: string | null) =>
  render(
    <StaticFormatProvider settings={SETTINGS}>
      <FunnelStageEvidence report={report} stageId={stageId} />
    </StaticFormatProvider>
  );

describe('the funnel evidence quote', () => {
  it('quotes the meaning of the stage’s own reason codes', () => {
    pane('eligibility');
    expect(screen.getByText('What this stage removes')).toBeTruthy();
    expect(screen.getByText(CODE_MEANING.ELIGIBILITY_FAILED)).toBeTruthy();
  });

  it('quotes every code of a stage that has more than one, in the stage’s order', () => {
    pane('frequency');
    expect(screen.getByText(`${CODE_MEANING.FREQUENCY_CAP_BREACHED} ${CODE_MEANING.COOLDOWN_ACTIVE}`)).toBeTruthy();
  });

  it('says a stage no flow asks is not asked, and quotes no meaning for it', () => {
    pane('suitability');
    expect(screen.getByText('Not asked by these flows')).toBeTruthy();
    expect(screen.queryByText('What this stage removes')).toBeNull();
    expect(screen.queryByText(CODE_MEANING.SUITABILITY_FAILED)).toBeNull();
  });

  it('opens a decision the stage removed a candidate from', () => {
    pane('eligibility');
    const link = screen.getByRole('link', { name: /^Open a decision this stage removed a candidate from/ });
    expect(link.getAttribute('href')).toBe('/decisions/dec_sample');
  });

  it('quotes nothing for the funnel whole', () => {
    pane(null);
    expect(screen.getByText('The funnel')).toBeTruthy();
    expect(screen.queryByText('What this stage removes')).toBeNull();
  });
});
