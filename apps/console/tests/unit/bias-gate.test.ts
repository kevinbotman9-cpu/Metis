import { describe, it, expect } from 'vitest';
import { biasGateFor } from '@/lib/bias-gate';
import type { AutonomySettingDto, ChangeSetDto, TaxonomyDto } from '@/lib/api-client';

/**
 * The bias gate a change set is read against, on the architect's Overview.
 *
 * Every seeded setting carries the same 1.20, so the seed cannot tell the most
 * specific scope from the tenant default. These do: each level has its own
 * threshold, and a test that took the wrong one would read the wrong number.
 */

const setting = (id: string, level: 'tenant' | 'objective' | 'category' | 'offer', targetId: string | null, threshold: number) =>
  ({ id, scope: { level, targetId }, guardrails: { biasGateThreshold: threshold } }) as unknown as AutonomySettingDto;

const SETTINGS = [
  setting('t', 'tenant', null, 1.2),
  setting('obj', 'objective', 'iss_retention', 1.15),
  setting('cat', 'category', 'grp_broadband', 1.1),
  setting('off', 'offer', 'off_fios', 1.05),
];

const TAXONOMY = {
  categories: [
    { id: 'grp_broadband', objectiveId: 'iss_retention' },
    { id: 'grp_tv', objectiveId: 'iss_retention' },
    { id: 'grp_mobile', objectiveId: 'iss_acquisition' },
  ],
  offers: [
    { id: 'off_fios', categoryId: 'grp_broadband', objectiveId: 'iss_retention' },
    { id: 'off_5g', categoryId: 'grp_broadband', objectiveId: 'iss_retention' },
    { id: 'off_disney', categoryId: 'grp_tv', objectiveId: 'iss_retention' },
    { id: 'off_line', categoryId: 'grp_mobile', objectiveId: 'iss_acquisition' },
  ],
} as unknown as Pick<TaxonomyDto, 'categories' | 'offers'>;

const scope = (level: ChangeSetDto['targetScope']['level'], targetId: string | null) =>
  ({ level, targetId }) as ChangeSetDto['targetScope'];

describe('the bias gate that applies to a change set', () => {
  it('takes the offer’s own setting over every broader one', () => {
    expect(biasGateFor(scope('offer', 'off_fios'), SETTINGS, TAXONOMY)).toBe(1.05);
  });

  it('walks an offer with no setting up to its category', () => {
    expect(biasGateFor(scope('offer', 'off_5g'), SETTINGS, TAXONOMY)).toBe(1.1);
  });

  it('walks a category with no setting up to its objective', () => {
    expect(biasGateFor(scope('category', 'grp_tv'), SETTINGS, TAXONOMY)).toBe(1.15);
    expect(biasGateFor(scope('offer', 'off_disney'), SETTINGS, TAXONOMY)).toBe(1.15);
    expect(biasGateFor(scope('objective', 'iss_retention'), SETTINGS, TAXONOMY)).toBe(1.15);
  });

  it('falls to the tenant when nothing narrower has a setting', () => {
    expect(biasGateFor(scope('category', 'grp_mobile'), SETTINGS, TAXONOMY)).toBe(1.2);
    expect(biasGateFor(scope('offer', 'off_line'), SETTINGS, TAXONOMY)).toBe(1.2);
    expect(biasGateFor(scope('objective', 'iss_acquisition'), SETTINGS, TAXONOMY)).toBe(1.2);
  });

  it('reads a tenant-wide change against the tenant setting', () => {
    expect(biasGateFor(scope('tenant', null), SETTINGS, TAXONOMY)).toBe(1.2);
  });

  it('shows no threshold for a scope the catalogue cannot place, rather than the tenant default', () => {
    expect(biasGateFor(scope('offer', 'off_unknown'), SETTINGS, TAXONOMY)).toBeNull();
    expect(biasGateFor(scope('category', 'grp_unknown'), SETTINGS, TAXONOMY)).toBeNull();
  });

  it('shows no threshold when no setting resolves at all', () => {
    expect(biasGateFor(scope('offer', 'off_fios'), [], TAXONOMY)).toBeNull();
  });
});
