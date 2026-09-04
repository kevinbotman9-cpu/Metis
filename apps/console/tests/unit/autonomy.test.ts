import { describe, it, expect } from 'vitest';
import {
  resolveAutonomy,
  formatMoney,
  AUTONOMY_LEVELS,
  type AutonomySetting,
  type AutonomyGuardrails,
} from '@metis/core/domain';

const guardrails: AutonomyGuardrails = {
  maxBlastRadiusPct: 5,
  allowedChangeTypes: ['lever_adjust'],
  maxLeverDelta: 0.1,
  maxBudgetDelta: { amount: 50000, currency: 'GBP' },
  protectedAttributes: [],
  requireSimulationPass: true,
  biasGateThreshold: 1.2,
};

const setting = (
  id: string,
  level: AutonomySetting['level'],
  scope: AutonomySetting['scope']
): AutonomySetting => ({
  id,
  scope,
  level,
  guardrails,
  rationale: 'test',
  updatedAt: '2026-09-01T00:00:00Z',
  updatedBy: 'test',
});

const ctx = {
  propositionId: 'prop_a',
  groupId: 'grp_a',
  issueId: 'iss_a',
};

describe('resolveAutonomy', () => {
  it('returns null when nothing matches', () => {
    expect(resolveAutonomy([], ctx)).toBeNull();
  });

  it('falls back to the tenant default', () => {
    const settings = [setting('s1', 'L2', { level: 'tenant', targetId: null })];
    expect(resolveAutonomy(settings, ctx)?.id).toBe('s1');
  });

  it('prefers issue over tenant', () => {
    const settings = [
      setting('tenant', 'L3', { level: 'tenant', targetId: null }),
      setting('issue', 'L1', { level: 'issue', targetId: 'iss_a' }),
    ];
    expect(resolveAutonomy(settings, ctx)?.id).toBe('issue');
  });

  it('prefers group over issue', () => {
    const settings = [
      setting('tenant', 'L3', { level: 'tenant', targetId: null }),
      setting('issue', 'L1', { level: 'issue', targetId: 'iss_a' }),
      setting('group', 'L2', { level: 'group', targetId: 'grp_a' }),
    ];
    expect(resolveAutonomy(settings, ctx)?.id).toBe('group');
  });

  it('prefers proposition over everything', () => {
    const settings = [
      setting('tenant', 'L3', { level: 'tenant', targetId: null }),
      setting('issue', 'L1', { level: 'issue', targetId: 'iss_a' }),
      setting('group', 'L2', { level: 'group', targetId: 'grp_a' }),
      setting('prop', 'L0', { level: 'proposition', targetId: 'prop_a' }),
    ];
    expect(resolveAutonomy(settings, ctx)?.id).toBe('prop');
  });

  it('ignores scopes belonging to a different target', () => {
    const settings = [
      setting('tenant', 'L2', { level: 'tenant', targetId: null }),
      setting('other-group', 'L4', { level: 'group', targetId: 'grp_other' }),
      setting('other-prop', 'L4', { level: 'proposition', targetId: 'prop_other' }),
    ];
    expect(resolveAutonomy(settings, ctx)?.id).toBe('tenant');
  });

  it('resolves a restrictive proposition rule under a permissive group', () => {
    // The case the product depends on: one regulated offer pinned low while the
    // rest of its group runs autonomously.
    const settings = [
      setting('group', 'L3', { level: 'group', targetId: 'grp_a' }),
      setting('regulated', 'L0', { level: 'proposition', targetId: 'prop_a' }),
    ];
    const resolved = resolveAutonomy(settings, ctx);
    expect(resolved?.level).toBe('L0');

    // A sibling proposition in the same group still gets the group's level.
    const sibling = resolveAutonomy(settings, { ...ctx, propositionId: 'prop_b' });
    expect(sibling?.level).toBe('L3');
  });
});

describe('AUTONOMY_LEVELS', () => {
  it('describes every level on the ladder', () => {
    expect(Object.keys(AUTONOMY_LEVELS)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
  });

  it('names a human gate for every level that can write', () => {
    for (const level of ['L2', 'L3', 'L4'] as const) {
      expect(AUTONOMY_LEVELS[level].humanGate).not.toBe('');
    }
  });
});

describe('formatMoney', () => {
  it('renders minor units as major with the right symbol', () => {
    expect(formatMoney({ amount: 3500, currency: 'GBP' })).toBe('£35.00');
    expect(formatMoney({ amount: 1999, currency: 'USD' })).toBe('$19.99');
    expect(formatMoney({ amount: 0, currency: 'EUR' })).toBe('€0.00');
  });

  it('handles negative margins', () => {
    expect(formatMoney({ amount: -4800, currency: 'GBP' })).toBe('£-48.00');
  });
});
