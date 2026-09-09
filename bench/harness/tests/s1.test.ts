import { describe, it, expect } from 'vitest';
import { runS1 } from '../src/s1';
import { BUDGET } from '../src/index';

/**
 * S1, at a size a test suite can afford.
 *
 * The published run is 1M profiles and 20k decisions per variant; this uses
 * the same code path at a fraction of it. The point here is not the number —
 * `npm run bench:s1` produces that — but that the shape of the report holds:
 * the gate is p99, the context §10 demands is present, and what is *not*
 * measured is stated rather than left to be assumed from silence.
 */

const report = runS1({ profiles: 50_000, decisions: 3_000 });

describe('S1', () => {
  it('meets the p99 budget', () => {
    // The specification states the promise as p99, not p95. Both are checked
    // by the gate; this asserts the one that is actually claimed.
    for (const v of report.variants) {
      expect(
        v.failures,
        `${v.name}: p99 ${v.result.latency.p99.toFixed(3)}ms of ${BUDGET.p99Ms}ms`
      ).toEqual([]);
      expect(v.result.latency.p99).toBeLessThan(BUDGET.p99Ms);
    }
    expect(report.passed).toBe(true);
  });

  it('measures a cold start separately from a warm one', () => {
    // A freshly deployed instance serves the cold numbers, so publishing only
    // the warm ones would describe a system nobody runs on its first minute.
    expect(report.variants.map((v) => v.cacheState).sort()).toEqual(['cold', 'warm']);
  });

  it('exercises a million-scale population, not a fixture', () => {
    // Distinct subjects are what vary the seeded propensity and the input
    // hash. A benchmark over ten customers measures a cache.
    const big = runS1({ profiles: 1_000_000, decisions: 200 });
    expect(big.context.workload.profiles).toBe(1_000_000);
    expect(big.context.workload.activeActions).toBe(100);
  });

  it('publishes every piece of context §10 requires', () => {
    // The list is written out rather than looped, so adding a field to the
    // type does not quietly satisfy this by making the loop longer.
    const c = report.context;
    expect(c.workload.profiles).toBeGreaterThan(0);
    expect(c.workload.seeded).toBe(true);
    expect(c.infrastructure.cores).toBeGreaterThan(0);
    expect(c.infrastructure.nodeVersion).toMatch(/^v\d+/);
    expect(c.codeVersion).toMatch(/^[0-9a-f]{40}$|^unknown/);
    expect(c.modelLatencyMs).toBe(0);

    for (const v of report.variants) {
      expect(v.cacheState).toMatch(/^(cold|warm)$/);
      // A confidence interval that does not contain its own mean would be a
      // sign the statistic was assembled rather than computed.
      expect(v.meanConfidence95.low).toBeLessThanOrEqual(v.result.latency.mean);
      expect(v.meanConfidence95.high).toBeGreaterThanOrEqual(v.result.latency.mean);
    }
  });

  it('says what it does not measure, and why', () => {
    // The half of a benchmark that gets dropped in the retelling. Carrying it
    // in the artifact is the only version of this that survives.
    const names = report.notMeasured.map((n) => n.variant).join(' ');
    expect(names).toMatch(/feature-store miss/);
    expect(names).toMatch(/degraded provider/);
    expect(names).toMatch(/1k\/s/);
    for (const n of report.notMeasured) {
      expect(n.reason.length, `${n.variant} has no reason`).toBeGreaterThan(30);
      expect(n.blockedOn.length).toBeGreaterThan(0);
    }
  });

  it('reports throughput without gating on it', () => {
    // Deliberate, and recorded: it swings 3x with machine load. The number is
    // still published so a real collapse is visible.
    for (const v of report.variants) {
      expect(v.result.throughput).toBeGreaterThan(50);
    }
    expect(report.notMeasured.map((n) => n.variant)).toContain('throughput as a gate');
  });
});
