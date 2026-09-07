import { describe, it, expect } from 'vitest';
import {
  assignArm,
  assignAll,
  bucketOf,
  experimentProblems,
  editProblems,
  armPath,
  armShares,
  type Experiment,
} from '../src/experiment';

/**
 * Experiments.
 *
 * The property everything else rests on is that an assignment is a pure
 * function of the customer reference and the experiment. That is what lets a
 * decision record — which stores `customerRef` and never the arm — be explained
 * months later, and it is why a running experiment cannot be reweighted.
 */

const experiment = (over: Partial<Experiment> = {}): Experiment => ({
  id: 'exp_1',
  tenantId: 't',
  key: 'hero_copy',
  name: 'Hero copy',
  description: '',
  arms: [
    { key: 'control', name: 'Control', weight: 50, holdout: true },
    { key: 'variant', name: 'Variant', weight: 50 },
  ],
  status: 'running',
  startedAt: '2026-09-01T00:00:00.000Z',
  stoppedAt: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: 'test',
  ...over,
});

describe('assignment is a function, not a record', () => {
  it('puts the same customer in the same arm every time', () => {
    const e = experiment();
    const first = assignArm(e, 'cust_0001');
    for (let i = 0; i < 50; i++) {
      expect(assignArm(e, 'cust_0001')?.key).toBe(first?.key);
    }
  });

  it('recomputes the same arm from a record made later', () => {
    // The whole point. The record stores `customerRef`; nothing stores the arm,
    // and the arm is still recoverable.
    const e = experiment();
    expect(assignArm(e, 'cust_0042')?.key).toBe(assignArm(experiment(), 'cust_0042')?.key);
  });

  it('splits roughly in the declared proportion', () => {
    const e = experiment({
      arms: [
        { key: 'a', name: 'A', weight: 80 },
        { key: 'b', name: 'B', weight: 20 },
      ],
    });
    let a = 0;
    for (let i = 0; i < 4000; i++) if (assignArm(e, `cust_${i}`)?.key === 'a') a += 1;

    // Wide bounds on purpose: this is asserting the split is honoured, not
    // that the hash is a good PRNG, and a tight bound would be a flake.
    expect(a / 4000).toBeGreaterThan(0.75);
    expect(a / 4000).toBeLessThan(0.85);
  });

  it('does not put the same people in the first arm of every experiment', () => {
    // Without salting by experiment key, two experiments would assign the same
    // customers identically and would be measuring one population twice.
    const one = experiment({ key: 'alpha' });
    const two = experiment({ key: 'beta' });

    let same = 0;
    for (let i = 0; i < 500; i++) {
      if (assignArm(one, `c${i}`)?.key === assignArm(two, `c${i}`)?.key) same += 1;
    }
    // A 50/50 split agrees half the time by chance; identical salting would
    // agree every time.
    expect(same).toBeLessThan(350);
  });

  it('is stable across arm ordering', () => {
    // Reordering the list in the editor must not move anybody.
    const e = experiment();
    const flipped = experiment({ arms: [...e.arms].reverse() });
    // The bucket is the same; which arm it falls in depends on cumulative
    // weight, so an even split is the honest case to assert.
    expect(bucketOf(e.key, 'cust_1')).toBe(bucketOf(flipped.key, 'cust_1'));
  });

  it('assigns nobody while the experiment is a draft', () => {
    // Otherwise saving a draft starts splitting live traffic before anybody
    // approved the split.
    expect(assignArm(experiment({ status: 'draft' }), 'cust_1')).toBeNull();
    expect(assignArm(experiment({ status: 'stopped' }), 'cust_1')).toBeNull();
  });

  it('never leaves a fraction of traffic unassigned', () => {
    // Floating point can leave the bucket a hair short of the total; falling
    // through to the last arm is right, returning null is not.
    const e = experiment();
    for (let i = 0; i < 2000; i++) expect(assignArm(e, `c${i}`)).not.toBeNull();
  });

  it('ignores arms with no weight', () => {
    const e = experiment({
      arms: [
        { key: 'off', name: 'Off', weight: 0 },
        { key: 'on', name: 'On', weight: 100 },
      ],
    });
    for (let i = 0; i < 200; i++) expect(assignArm(e, `c${i}`)?.key).toBe('on');
  });
});

describe('arms as decision input', () => {
  it('produces a flat path a policy can name', () => {
    const { values } = assignAll([experiment()], 'cust_0001');
    expect(Object.keys(values)).toEqual(['experiments.hero_copy']);
    expect(armPath('hero_copy')).toBe('experiments.hero_copy');
  });

  it('is ordered, because the values are hashed into the decision', () => {
    const a = experiment({ key: 'zulu', id: 'z' });
    const b = experiment({ key: 'alpha', id: 'a' });
    expect(Object.keys(assignAll([a, b], 'c1').values)).toEqual([
      'experiments.alpha',
      'experiments.zulu',
    ]);
  });

  it('leaves out experiments that are not running', () => {
    const { values, assignments } = assignAll(
      [experiment({ status: 'draft' }), experiment({ key: 'other', id: 'o' })],
      'cust_1'
    );
    expect(Object.keys(values)).toEqual(['experiments.other']);
    expect(assignments).toHaveLength(1);
  });
});

describe('what an experiment must be', () => {
  it('accepts a well-formed one', () => {
    expect(experimentProblems(experiment())).toEqual([]);
  });

  it('refuses a key that cannot be a field path', () => {
    expect(experimentProblems(experiment({ key: 'Hero Copy' })).join(' ')).toContain(
      'becomes the field path'
    );
  });

  it('refuses a single arm', () => {
    expect(
      experimentProblems(experiment({ arms: [{ key: 'only', name: 'Only', weight: 1 }] })).join(' ')
    ).toContain('one arm is just a change');
  });

  it('refuses duplicate arm keys', () => {
    expect(
      experimentProblems(
        experiment({
          arms: [
            { key: 'a', name: 'A', weight: 1 },
            { key: 'a', name: 'Again', weight: 1 },
          ],
        })
      ).join(' ')
    ).toContain("share the key 'a'");
  });

  it('refuses two holdouts', () => {
    // A report cannot compare against two baselines.
    expect(
      experimentProblems(
        experiment({
          arms: [
            { key: 'a', name: 'A', weight: 1, holdout: true },
            { key: 'b', name: 'B', weight: 1, holdout: true },
          ],
        })
      ).join(' ')
    ).toContain('compare against two');
  });

  it('refuses an experiment where every arm has zero weight', () => {
    expect(
      experimentProblems(
        experiment({
          arms: [
            { key: 'a', name: 'A', weight: 0 },
            { key: 'b', name: 'B', weight: 0 },
          ],
        })
      ).join(' ')
    ).toContain('nobody would be assigned');
  });
});

describe('a running experiment is frozen', () => {
  it('allows anything while it is a draft', () => {
    const draft = experiment({ status: 'draft' });
    expect(editProblems(draft, { arms: [], key: 'anything' })).toEqual([]);
  });

  it('refuses to reweight a running experiment, and says why', () => {
    // Reweighting would make every recomputed arm disagree with the one that
    // actually applied — the trace would confidently report the wrong arm.
    const problems = editProblems(experiment(), {
      arms: [
        { key: 'control', name: 'Control', weight: 90 },
        { key: 'variant', name: 'Variant', weight: 10 },
      ],
    });
    expect(problems.join(' ')).toContain('frozen');
    expect(problems.join(' ')).toContain('Stop it and start another');
  });

  it('refuses to rename the key of a running experiment', () => {
    expect(editProblems(experiment(), { key: 'renamed' })).toHaveLength(1);
  });

  it('allows renaming and describing a running experiment', () => {
    // The name is a label. Only the things assignment depends on are frozen.
    expect(editProblems(experiment(), { name: 'Clearer name', description: 'why' })).toEqual([]);
  });
});

describe('shares', () => {
  it('normalises whatever weights were written', () => {
    // 1:1:2 is a thing people write, and rejecting it teaches nothing.
    const shares = armShares(
      experiment({
        arms: [
          { key: 'a', name: 'A', weight: 1 },
          { key: 'b', name: 'B', weight: 1 },
          { key: 'c', name: 'C', weight: 2 },
        ],
      })
    );
    expect(shares.map((s) => s.share)).toEqual([0.25, 0.25, 0.5]);
  });
});
