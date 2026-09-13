import { describe, it, expect } from 'vitest';
import { buildFunnelView, reaching, stageOf, ENTERED, STAGE_LABEL } from '@/lib/policy-funnel';
import { formatterFor } from '@/lib/format';
import type { PolicyFunnelReportDto } from '@/lib/api-client';

/**
 * The policy funnel's rail. The arithmetic is the ledger's and is tested there;
 * these cover what the screen adds — the entry stage, the notes, and a stage no
 * flow asks being said rather than drawn as a full bar.
 */

const format = formatterFor({ locale: 'en-US', currency: 'USD' });

const stage = (
  id: PolicyFunnelReportDto['stages'][number]['id'],
  removed: number,
  survived: number,
  asked: boolean | null = true
) => ({ id, codes: [] as string[], asked, removed, survived, rules: [] });

// Typed, not cast: `asked` is `boolean | null` in the DTO, which is the case the
// rail has to handle — the spec says so with the 3.1 spelling the generator reads.
const report: PolicyFunnelReportDto = {
  decisions: 100,
  entered: 500,
  offered: 40,
  unaccounted: 0,
  from: '2026-06-01T00:00:00.000Z',
  to: '2026-06-30T00:00:00.000Z',
  stages: [
    stage('not_live', 0, 500),
    stage('eligibility', 200, 300),
    stage('relevance', 220, 80),
    stage('suitability', 0, 80, false),
    stage('consent', 10, 70),
    stage('frequency', 0, 70),
    stage('not_ranked', 30, 40),
  ],
};

describe('the policy funnel rail', () => {
  const view = buildFunnelView(report, format);

  it('opens on the candidates that entered, then one stage per reason-code group', () => {
    expect(view.stages.map((s) => s.id)).toEqual([ENTERED, ...report.stages.map((s) => s.id)]);
    expect(view.stages[0]).toMatchObject({ label: 'Candidates entered', value: 500, pct: 100 });
    expect(view.stages.slice(1).map((s) => s.label)).toEqual(report.stages.map((s) => STAGE_LABEL[s.id]));
  });

  it('shows survivors, and what each stage removed', () => {
    expect(view.stages.slice(1).map((s) => [s.value, s.removed])).toEqual(
      report.stages.map((s) => [s.survived, s.removed])
    );
    expect(view.stages.find((s) => s.id === 'eligibility')!.pct).toBe(60);
  });

  it('says a stage no flow asks, rather than showing it as a stage that kept everyone', () => {
    expect(view.stages.find((s) => s.id === 'suitability')!.note).toBe('not asked by these flows');
    expect(view.stages.find((s) => s.id === 'frequency')!.note).toBe('100.0% of the stage above');
  });

  it('draws no stage as a break: a policy removing a candidate is not a fault', () => {
    expect(view.stages.every((s) => s.broken === undefined)).toBe(true);
  });

  it('names the stage that removed the most', () => {
    expect(view.largest?.id).toBe('relevance');
    expect(buildFunnelView({ ...report, stages: report.stages.map((s) => ({ ...s, removed: 0 })) }, format).largest).toBeNull();
  });

  it('knows what reached each stage', () => {
    expect(reaching(report, 'not_live')).toBe(500);
    expect(reaching(report, 'relevance')).toBe(300);
    expect(stageOf(report, 'consent')?.removed).toBe(10);
    expect(stageOf(report, ENTERED)).toBeUndefined();
  });
});
