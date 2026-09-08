import { describe, it, expect } from 'vitest';
import {
  periodStart,
  resolveVolume,
  volumePaths,
  volumeProblems,
  type VolumeConstraint,
  type VolumeUsage,
} from '../src/volume';

/**
 * Volume and budget caps.
 *
 * Two properties carry everything else. The window comes from `occurredAt` and
 * never the clock, so a replay lands in the window the decision was made in.
 * And an uncountable usage publishes nothing rather than something optimistic,
 * so a cap nobody could read suppresses instead of permitting.
 */

const cap = (over: Partial<VolumeConstraint> = {}): VolumeConstraint => ({
  id: 'vol_1',
  tenantId: 't',
  name: 'Fibre monthly cap',
  offerKey: 'acq_fibre_900',
  maxOffers: 1000,
  maxSpendMinor: null,
  period: 'month',
  active: true,
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: 'test',
  ...over,
});

const usage = (over: Partial<VolumeUsage> = {}): Map<string, VolumeUsage> =>
  new Map([
    [
      over.offerKey ?? 'acq_fibre_900',
      { offerKey: 'acq_fibre_900', used: 0, spentMinor: 0, ...over },
    ],
  ]);

describe('the window comes from the decision, not the clock', () => {
  it('starts a month on the first', () => {
    expect(periodStart('2026-09-17T13:45:00.000Z', 'month')).toBe('2026-09-01T00:00:00.000Z');
  });

  it('starts a day at midnight UTC', () => {
    expect(periodStart('2026-09-17T13:45:00.000Z', 'day')).toBe('2026-09-17T00:00:00.000Z');
  });

  it('starts a week on Monday', () => {
    // 2026-09-17 is a Thursday.
    expect(periodStart('2026-09-17T13:45:00.000Z', 'week')).toBe('2026-09-14T00:00:00.000Z');
  });

  it('puts Sunday at the end of its week, not the start', () => {
    // The off-by-one that would give Sunday its own window. 2026-09-20 is a
    // Sunday and belongs to the week beginning the 14th.
    expect(periodStart('2026-09-20T23:59:00.000Z', 'week')).toBe('2026-09-14T00:00:00.000Z');
    expect(periodStart('2026-09-21T00:00:00.000Z', 'week')).toBe('2026-09-21T00:00:00.000Z');
  });

  it('crosses a month boundary within a week', () => {
    // 2026-10-01 is a Thursday; its week began in September.
    expect(periodStart('2026-10-01T12:00:00.000Z', 'week')).toBe('2026-09-28T00:00:00.000Z');
  });

  it('is stable, so a replay lands in the window the decision was made in', () => {
    const at = '2026-03-11T08:00:00.000Z';
    expect(periodStart(at, 'month')).toBe(periodStart(at, 'month'));
  });

  it('refuses a time it cannot read rather than guessing at one', () => {
    expect(() => periodStart('not a time', 'day')).toThrow('is not a time');
  });
});

describe('usage becomes decision input', () => {
  it('publishes what is left against the cap', () => {
    const { values } = resolveVolume([cap()], usage({ used: 940 }));
    const paths = volumePaths('acq_fibre_900');

    expect(values[paths.used]).toBe(940);
    expect(values[paths.remaining]).toBe(60);
  });

  it('never publishes a negative remainder', () => {
    // Over the cap is over the cap; a negative number invites a rule that
    // compares against it and reads oddly in a trace.
    const { values } = resolveVolume([cap()], usage({ used: 1200 }));
    expect(values[volumePaths('acq_fibre_900').remaining]).toBe(0);
  });

  it('publishes a budget remainder only when there is a budget', () => {
    // A remainder for an uncapped dimension is a number with no meaning, and
    // somebody would eventually write a rule against it.
    const { values } = resolveVolume([cap()], usage({ used: 1 }));
    expect(values).not.toHaveProperty(volumePaths('acq_fibre_900').budgetRemaining);

    const withBudget = resolveVolume(
      [cap({ maxOffers: null, maxSpendMinor: 500_000 })],
      usage({ spentMinor: 120_000 })
    );
    expect(withBudget.values[volumePaths('acq_fibre_900').budgetRemaining]).toBe(380_000);
    expect(withBudget.values).not.toHaveProperty(volumePaths('acq_fibre_900').remaining);
  });

  it('leaves an inactive cap out entirely', () => {
    expect(resolveVolume([cap({ active: false })], usage({ used: 5 })).values).toEqual({});
  });

  it('is ordered, because the values are hashed into the decision', () => {
    const a = cap({ offerKey: 'zulu', id: 'z' });
    const b = cap({ offerKey: 'alpha', id: 'a' });
    const both = new Map<string, VolumeUsage>([
      ['zulu', { offerKey: 'zulu', used: 1, spentMinor: 0 }],
      ['alpha', { offerKey: 'alpha', used: 1, spentMinor: 0 }],
    ]);
    expect(Object.keys(resolveVolume([a, b], both).values)[0]).toContain('alpha');
  });
});

describe('unknown must not permit', () => {
  it('publishes nothing when usage could not be counted', () => {
    // The rule that inverts the rest of the codebase. A `remaining` guessed
    // optimistically is how a cap turns out to have been decorative.
    const { values, unresolved } = resolveVolume([cap()], new Map());

    expect(values).toEqual({});
    expect(unresolved).toEqual([
      { offerKey: 'acq_fibre_900', reason: 'usage could not be counted' },
    ]);
  });

  it('leaves a policy on the absent path unable to pass', () => {
    // The consequence, stated as a property: with no `remaining`, a condition
    // `remaining > 0` compares against undefined and is false, so the offer is
    // suppressed rather than sent.
    const { values } = resolveVolume([cap()], new Map());
    expect(values[volumePaths('acq_fibre_900').remaining]).toBeUndefined();
  });
});

describe('what a cap must be', () => {
  it('accepts a well-formed one', () => {
    expect(volumeProblems(cap())).toEqual([]);
  });

  it('refuses one that caps neither count nor spend', () => {
    expect(volumeProblems(cap({ maxOffers: null, maxSpendMinor: null })).join(' ')).toContain(
      'limits nothing'
    );
  });

  it('refuses a cap of zero, and says what to do instead', () => {
    // A zero cap suppresses the offer while leaving it looking active in the
    // catalogue, which is where somebody will go to find out why.
    expect(volumeProblems(cap({ maxOffers: 0 })).join(' ')).toContain('Deactivate the offer');
  });

  it('refuses negative limits', () => {
    expect(volumeProblems(cap({ maxOffers: -1 })).join(' ')).toContain('not a cap');
    expect(volumeProblems(cap({ maxSpendMinor: -1 })).join(' ')).toContain('not a budget');
  });

  it('refuses an offer key that cannot be a field path', () => {
    expect(volumeProblems(cap({ offerKey: 'Acq Fibre' })).join(' ')).toContain(
      'becomes the field path'
    );
  });
});
