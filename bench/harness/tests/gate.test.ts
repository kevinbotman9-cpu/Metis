import { describe, it, expect } from 'vitest';
import { buildWorkload } from '@metis/datasets';
import { runScenario, checkGate, BUDGET } from '../src/index';

/**
 * The Phase 0 performance gate, actually enforced.
 *
 * The plan states it as a CI gate on every commit. Until now the harness had
 * no npm script, no test and no workflow step, so the claim rested on nothing —
 * and the harness itself measured with millisecond resolution against a
 * sub-millisecond operation, so it would have passed on a histogram of zeroes.
 *
 * Scenario sizes here are kept small so the suite stays fast. `npm run bench`
 * runs the larger set.
 */

describe('performance budget', () => {
  const workload = buildWorkload({ propositions: 40 });
  const result = runScenario({
    name: 'CI gate',
    artifact: workload.artifact,
    catalogue: workload.catalogue,
    request: workload.request,
    decisions: 5_000,
  });

  it('meets the latency and throughput budget', () => {
    const verdict = checkGate(result);
    expect(verdict.failures, `p95 ${result.latency.p95.toFixed(3)}ms, ` +
      `${result.throughput.toFixed(0)} decisions/s`).toEqual([]);
    expect(verdict.passed).toBe(true);
  });

  it('leaves real headroom, not a hair', () => {
    // A gate that only just passes is a gate that will flake on a shared
    // runner. If this ever fires, the engine got materially slower and the
    // absolute threshold above stops being safe to trust.
    expect(result.latency.p95).toBeLessThan(BUDGET.p95Ms / 10);
  });

  it('exercises arbitration rather than eliminating everything early', () => {
    // A workload where every candidate is filtered out runs fast and measures
    // nothing. This is what stops the gate passing vacuously.
    expect(result.offered).toBeGreaterThan(result.decisions * 0.1);
  });

  it('is reproducible: the same seed gives the same decisions', () => {
    // The original dataset generator used Math.random(), so a regression and a
    // reroll looked identical. This is the property that makes the benchmark
    // mean anything between runs.
    const a = buildWorkload({ propositions: 8 });
    const b = buildWorkload({ propositions: 8 });

    expect(a.request(42)).toEqual(b.request(42));
    expect(a.catalogue).toEqual(b.catalogue);
  });

  it('cost grows no worse than linearly in the candidate set', () => {
    // Note what this is *not* asserting. packages/runtime already covers the
    // flat-cost invariant — that growing the catalogue without growing the
    // candidate set costs nothing extra, which is what the hashing memo buys.
    //
    // Here the candidate set grows with the catalogue, so more work is correct
    // and expected: every candidate is filtered, scored and arbitrated. The
    // invariant worth holding is that the work stays proportional. Arbitration
    // that compared every candidate to every other would be quadratic, and 20x
    // the candidates would cost far more than 20x.
    const measure = (propositions: number) => {
      const w = buildWorkload({ propositions });
      return runScenario({
        name: `${propositions}`,
        artifact: w.artifact,
        catalogue: w.catalogue,
        request: w.request,
        decisions: 1_500,
      }).latency.p50;
    };

    const small = measure(10);
    const large = measure(200);
    const growth = large / Math.max(small, 1e-6);

    // 20x the candidates. Linear is 20x; measured is around 14x, because the
    // per-decision fixed costs do not scale.
    expect(growth, `${growth.toFixed(1)}x cost for 20x the candidates`).toBeLessThan(20);
  });
});
