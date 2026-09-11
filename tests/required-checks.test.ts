import { describe, it, expect } from 'vitest';
import {
  checkNames,
  compare,
  workflowJobs,
  NOT_REQUIRED,
  // @ts-expect-error — plain ESM with no types; the shapes are asserted below.
} from '../scripts/check-required-checks.mjs';

/**
 * The comparison behind `scripts/check-required-checks.mjs`, offline.
 *
 * The script itself reads the ruleset from the GitHub API and runs as a gate.
 * This holds the part that does not need a network: that the workflow is read
 * into the names GitHub will report, and that every direction of disagreement
 * is caught. Each case below is one way the ruleset and the workflow drift.
 */

type Job = { id: string; names: string[] };

const REQUIRED_TODAY = ['e2e-report', 'kotlin-conformance', 'spec', 'verify'];

describe('the checks main requires are the jobs the workflow runs', () => {
  const jobs = workflowJobs() as Job[];

  it('reads the workflow into the names GitHub reports', () => {
    const names = jobs.flatMap((j) => j.names);
    // A guard on the guard: an empty or misparsed list would make every
    // comparison below pass over nothing.
    expect(names).toEqual(
      expect.arrayContaining(['verify', 'spec', 'kotlin-conformance', 'e2e-report', 'flake-hunt'])
    );
    // The matrix reports once per shard, which is why `e2e` cannot itself be
    // required under its own name.
    expect(jobs.find((j) => j.id === 'e2e')?.names).toEqual([
      'e2e (1)',
      'e2e (2)',
      'e2e (3)',
      'e2e (4)',
    ]);
  });

  it('agrees with the ruleset as it was read back on 2026-09-11', () => {
    expect(compare({ jobs, required: REQUIRED_TODAY })).toEqual({
      unrequired: [],
      orphaned: [],
      staleDeclarations: [],
      unknownDeclarations: [],
    });
  });

  it('fails a job that runs and is not required', () => {
    const added = [...jobs, { id: 'lint-docs', names: ['lint-docs'] }];
    expect(compare({ jobs: added, required: REQUIRED_TODAY }).unrequired).toEqual(['lint-docs']);
  });

  it('fails a required check that no job reports', () => {
    const renamed = jobs.map((j) =>
      j.id === 'kotlin-conformance' ? { id: 'kotlin', names: ['kotlin'] } : j
    );
    const result = compare({ jobs: renamed, required: REQUIRED_TODAY });
    expect(result.orphaned).toEqual(['kotlin-conformance']);
    expect(result.unrequired).toEqual(['kotlin']);
  });

  it('fails a shard required by name, because e2e is declared not required', () => {
    const result = compare({ jobs, required: [...REQUIRED_TODAY, 'e2e (2)'] });
    expect(result.staleDeclarations).toEqual(['e2e']);
  });

  it('fails a declaration for a job that no longer exists', () => {
    const result = compare({
      jobs,
      required: REQUIRED_TODAY,
      notRequired: { ...NOT_REQUIRED, 'deleted-job': 'a reason that outlived its job entirely' },
    });
    expect(result.unknownDeclarations).toEqual(['deleted-job']);
  });

  it('gives every declaration a reason', () => {
    for (const [id, reason] of Object.entries(NOT_REQUIRED as Record<string, string>)) {
      expect(String(reason).length, `${id} is exempted with no real reason`).toBeGreaterThan(40);
    }
  });

  it('refuses a matrix it cannot name rather than guessing', () => {
    expect(() =>
      checkNames('odd', { strategy: { matrix: { os: ['a'], include: [{ os: 'b' }] } } })
    ).toThrow(/not modelled/);
    expect(checkNames('pair', { name: 'P', strategy: { matrix: { a: [1, 2], b: ['x'] } } })).toEqual([
      'P (1, x)',
      'P (2, x)',
    ]);
  });
});
