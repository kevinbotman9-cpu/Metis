import { describe, it, expect } from 'vitest';
import { REASON_CODES } from '@metis/runtime';
import {
  buildPolicyFunnel,
  funnelDecisionOf,
  FUNNEL_STAGES,
  type FunnelDecision,
  type FunnelStageId,
} from '../src/policy-funnel';
import type { LedgerEntry } from '../src/types';

/**
 * The policy funnel's arithmetic.
 *
 * Its claim is that the stages are a decomposition: every candidate a flow
 * considered is removed once or wins, so the survivors after each stage are a
 * subset of the ones before. These cover that claim, and the ways a naive sum
 * would break it — ordering stages by the order nodes ran, calling an unasked
 * stage empty, and counting a rule's decisions once per candidate.
 */

const decision = (
  id: string,
  candidates: number,
  winner: string | null,
  removals: [string, string | null][],
  occurredAt = '2026-06-01T12:00:00.000Z',
  shown = winner ? 1 : 0
): FunnelDecision => ({
  decisionId: id,
  occurredAt,
  candidates,
  winner,
  shown,
  removals: removals.map(([code, ruleId]) => ({ code, ruleId })),
});

const stage = (report: ReturnType<typeof buildPolicyFunnel>, id: FunnelStageId) =>
  report.stages.find((s) => s.id === id)!;

describe('the stages', () => {
  it('give every reason code in the closed set exactly one stage', () => {
    const staged = FUNNEL_STAGES.flatMap((s) => [...s.codes]);
    expect([...staged].sort()).toEqual([...REASON_CODES].sort());
    expect(new Set(staged).size).toBe(staged.length);
  });

  it('are always all seven, in the order a decision meets them', () => {
    expect(buildPolicyFunnel([]).stages.map((s) => s.id)).toEqual([
      'not_live',
      'eligibility',
      'relevance',
      'suitability',
      'consent',
      'frequency',
      'not_ranked',
    ]);
  });
});

describe('the decomposition', () => {
  const report = buildPolicyFunnel([
    decision('d1', 5, 'fios_gigabit', [
      ['ELIGIBILITY_FAILED', 'pol_5g_coverage'],
      ['RELEVANCE_FAILED', 'pol_entertainment_affinity'],
      ['RELEVANCE_FAILED', 'pol_entertainment_affinity'],
      ['NOT_RANKED', null],
    ]),
    decision('d2', 5, null, [
      ['ELIGIBILITY_FAILED', 'pol_5g_coverage'],
      ['ELIGIBILITY_FAILED', 'pol_fios_serviceable'],
      ['RELEVANCE_FAILED', 'pol_entertainment_affinity'],
      ['CONSENT_WITHHELD', null],
      ['FREQUENCY_CAP_BREACHED', 'cpol_email_weekly'],
    ]),
  ]);

  it('sums candidates, removals and winners', () => {
    expect(report.decisions).toBe(2);
    expect(report.entered).toBe(10);
    expect(report.offered).toBe(1);
    expect(stage(report, 'eligibility').removed).toBe(3);
    expect(stage(report, 'relevance').removed).toBe(3);
    expect(stage(report, 'consent').removed).toBe(1);
    expect(stage(report, 'frequency').removed).toBe(1);
    expect(stage(report, 'not_ranked').removed).toBe(1);
    expect(report.unaccounted).toBe(0);
  });

  it('nests: each stage survives from the one above, and the last is what was offered', () => {
    let above = report.entered;
    for (const s of report.stages) {
      expect(s.survived, s.id).toBe(above - s.removed);
      expect(s.survived, s.id).toBeLessThanOrEqual(above);
      above = s.survived;
    }
    expect(report.stages.at(-1)!.survived).toBe(report.offered);
  });

  it('stages by reason code, not by the order the removals were recorded', () => {
    // Consent recorded first, as a constraint node placed before the filters
    // would. The funnel's order is the codes', so the figures do not move.
    const reordered = buildPolicyFunnel([
      decision('d1', 3, null, [
        ['CONSENT_WITHHELD', null],
        ['RELEVANCE_FAILED', 'pol_a'],
        ['ELIGIBILITY_FAILED', 'pol_b'],
      ]),
    ]);
    expect(reordered.stages.map((s) => [s.id, s.removed, s.survived])).toEqual([
      ['not_live', 0, 3],
      ['eligibility', 1, 2],
      ['relevance', 1, 1],
      ['suitability', 0, 1],
      ['consent', 1, 0],
      ['frequency', 0, 0],
      ['not_ranked', 0, 0],
    ]);
  });

  it('counts a decision that does not add up, rather than hiding it', () => {
    const broken = buildPolicyFunnel([
      // Five candidates, three accounted for.
      decision('short', 5, 'x', [['ELIGIBILITY_FAILED', 'pol_a'], ['NOT_RANKED', null]]),
      // A code outside the closed set has no stage to go to.
      decision('unknown', 2, 'x', [['SOMETHING_NEW', null]]),
      decision('fine', 2, 'x', [['RELEVANCE_FAILED', 'pol_b']]),
    ]);
    expect(broken.unaccounted).toBe(2);
  });

  it('spans the window from the decisions themselves', () => {
    const windowed = buildPolicyFunnel([
      decision('b', 1, 'x', [], '2026-06-02T00:00:00.000Z'),
      decision('a', 1, 'x', [], '2026-06-01T00:00:00.000Z'),
    ]);
    expect([windowed.from, windowed.to]).toEqual(['2026-06-01T00:00:00.000Z', '2026-06-02T00:00:00.000Z']);
  });

  it('reports nothing over nothing, with no window', () => {
    const empty = buildPolicyFunnel([]);
    expect([empty.decisions, empty.entered, empty.offered, empty.unaccounted]).toEqual([0, 0, 0, 0]);
    expect(empty.stages.every((s) => s.removed === 0 && s.survived === 0 && s.rules.length === 0)).toBe(true);
    expect([empty.from, empty.to]).toEqual([null, null]);
  });
});

describe('whether a stage was asked', () => {
  const decisions = [decision('d1', 3, null, [['ELIGIBILITY_FAILED', 'pol_a'], ['CONSENT_WITHHELD', null], ['RELEVANCE_FAILED', 'pol_b']])];

  it('is null for every stage when the caller does not say — not false', () => {
    expect(buildPolicyFunnel(decisions).stages.map((s) => s.asked)).toEqual(Array(7).fill(null));
  });

  it('distinguishes a stage no flow asks from one that asked and removed nothing', () => {
    const report = buildPolicyFunnel(decisions, new Set<FunnelStageId>(['eligibility', 'relevance', 'frequency', 'not_ranked']));
    expect(stage(report, 'suitability')).toMatchObject({ asked: false, removed: 0 });
    expect(stage(report, 'frequency')).toMatchObject({ asked: true, removed: 0 });
  });

  it('is true for a stage that removed something, whatever the caller said', () => {
    // Consent is enforced at every constraint node, so it can remove a
    // candidate in a flow whose declared tiers do not name it.
    const report = buildPolicyFunnel(decisions, new Set<FunnelStageId>(['eligibility', 'relevance']));
    expect(stage(report, 'consent')).toMatchObject({ asked: true, removed: 1 });
  });
});

describe('the rules within a stage', () => {
  const report = buildPolicyFunnel([
    decision('newest', 4, null, [
      ['RELEVANCE_FAILED', 'pol_small'],
      ['RELEVANCE_FAILED', 'pol_big'],
      ['RELEVANCE_FAILED', 'pol_big'],
      ['NOT_RANKED', null],
    ]),
    decision('older', 3, 'x', [['RELEVANCE_FAILED', 'pol_big'], ['NOT_RANKED', null]]),
  ]);
  const rules = stage(report, 'relevance').rules;

  it('groups by rule, largest first', () => {
    expect(rules.map((r) => [r.ruleId, r.removed])).toEqual([
      ['pol_big', 3],
      ['pol_small', 1],
    ]);
  });

  it('counts the decisions a rule touched once each, however many candidates it removed there', () => {
    expect(rules[0].decisions).toBe(2);
  });

  it('names the first decision in input order, so the figure links to a trace', () => {
    expect(rules[0].sampleDecisionId).toBe('newest');
    expect(rules[1].sampleDecisionId).toBe('newest');
  });

  it('groups a removal with no rule under its code', () => {
    expect(stage(report, 'not_ranked').rules).toEqual([
      { ruleId: null, code: 'NOT_RANKED', removed: 2, decisions: 2, sampleDecisionId: 'newest' },
    ]);
  });
});

describe('a ledger entry as the funnel reads it', () => {
  it('takes candidates from the set, and every denial from every step', () => {
    const entry = {
      decisionId: 'dec_1',
      occurredAt: '2026-06-01T12:00:00.000Z',
      record: {
        decision: {
          candidateKeys: ['a', 'b', 'c'],
          winner: 'c',
          slate: [{ rank: 1, action: 'c', offerId: 'p_c', priority: 1 }],
          eliminations: [
            { nodeId: 'filter', denials: [{ key: 'a', code: 'ELIGIBILITY_FAILED', ruleId: 'pol_a' }] },
            { nodeId: 'arbitrate', denials: [{ key: 'b', code: 'NOT_RANKED', ruleId: null }] },
          ],
        },
      },
    } as unknown as LedgerEntry;

    expect(funnelDecisionOf(entry)).toEqual({
      decisionId: 'dec_1',
      occurredAt: '2026-06-01T12:00:00.000Z',
      candidates: 3,
      winner: 'c',
      shown: 1,
      removals: [
        { code: 'ELIGIBILITY_FAILED', ruleId: 'pol_a' },
        { code: 'NOT_RANKED', ruleId: null },
      ],
    });
    expect(buildPolicyFunnel([funnelDecisionOf(entry)]).unaccounted).toBe(0);
  });

  it('accounts for an offer shown in slot 2 as shown, not removed (ADR-020 §3)', () => {
    // Three candidates, two slots: two shown, one ranked below the last slot.
    // Counting only the winner beside the removals would call this decision
    // unaccounted — and counting slot 2 as NOT_RANKED is the 742 the reseed
    // took out of the ranking stage.
    const report = buildPolicyFunnel([decision('dec_2slot', 3, 'a', [['NOT_RANKED', null]], undefined, 2)]);
    expect(report.unaccounted).toBe(0);
    expect(stage(report, 'not_ranked').removed).toBe(1);
    // The same decision recorded before slates, with slot 2 as a denial, does
    // not add up once it says it showed two.
    expect(
      buildPolicyFunnel([decision('dec_old', 3, 'a', [['NOT_RANKED', null], ['NOT_RANKED', null]], undefined, 2)]).unaccounted
    ).toBe(1);
  });
});
