// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TraceEvidence } from '@/components/trace-evidence';
import type { DenialGroup, TraceStage } from '@/components/trace-cascade';
import type { TraceDto } from '@/lib/api-client';

/**
 * A candidate beaten on priority, in the evidence pane.
 *
 * `NOT_RANKED` is not a refusal: the candidate passed every gate and lost on
 * priority. The pane used to draw the same rule-shaped rows it draws for a
 * refusal — rule, tier, field evaluated, pack, source system, when computed,
 * what the customer was told — and every one of them came out as an absence.
 * On the compliance path that read as six missing pieces of evidence rather
 * than as none being due (the decision-trace audit, D13, 2026-09-15).
 */

afterEach(cleanup);

const TRACE = {
  id: 'dec_not_ranked_fixture',
  winner: 'fios_gigabit',
  candidateCount: 4,
  eliminations: [],
  timings: {},
  sourceBindings: [],
  sourceCalls: [],
} as unknown as TraceDto;

const STAGE: TraceStage = {
  nodeId: 'arbitrate_priority',
  nodeType: 'arbitrate',
  tier: null,
  label: 'Offered',
  reason: '',
  removed: 3,
  survived: 1,
  ms: 0,
  denials: [
    { key: 'gaming_plus_bundle', code: 'NOT_RANKED', ruleId: null } as never,
    { key: 'disney_plus', code: 'NOT_RANKED', ruleId: null } as never,
    { key: 'netflix', code: 'NOT_RANKED', ruleId: null } as never,
  ],
} as unknown as TraceStage;

const GROUP: DenialGroup = {
  ruleId: null,
  codes: ['NOT_RANKED'],
  keys: ['gaming_plus_bundle', 'disney_plus', 'netflix'],
};

const pane = () =>
  render(
    <TraceEvidence
      trace={TRACE}
      stage={STAGE}
      group={GROUP}
      policies={[]}
      packageVersions={{ '@metis/nodes-core': '1.4.0' }}
      policySources={{}}
    />
  );

describe('a candidate beaten on priority is not described as a refusal', () => {
  it('says what the code means and names the code', () => {
    pane();
    expect(screen.getByText(/beaten on priority/)).toBeTruthy();
    // Twice, on purpose: once as the pane's heading and once as the reason-code
    // badge under "Reason code", which is the one row that stays.
    expect(screen.getByRole('heading', { name: 'NOT_RANKED' })).toBeTruthy();
    expect(screen.getByText('Reason code', { exact: true })).toBeTruthy();
    expect(screen.getAllByText('NOT_RANKED', { exact: true })).toHaveLength(2);
  });

  it('draws none of the rows that describe a rule', () => {
    pane();
    for (const label of [
      'Rule',
      'Tier',
      'Field it evaluated',
      'Pack that supplied it',
      'Source system',
      'When the value was computed',
      'What the customer was told',
    ]) {
      expect(screen.queryByText(label, { exact: true }), `${label} is drawn for NOT_RANKED`).toBeNull();
    }
  });
});
