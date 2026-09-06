/**
 * Load harness: latency and throughput for the deterministic engine.
 *
 * This replaces a version that could not have worked. It measured each request
 * with `Date.now()` — millisecond resolution against a decision that takes
 * about 0.17ms, so every recorded latency was 0 or 1 and the p95 gate passed
 * on a histogram of zeroes. It also called `execute(artifact, request)`, a
 * signature the engine has not had since the deterministic rewrite, so it
 * would not have compiled against the code it claimed to measure.
 *
 * The gate here is absolute (p95 under 50ms) rather than a ratio, which is
 * defensible only because the margin is enormous: the engine runs roughly 300x
 * inside the budget. If CI noise ever moves this number, that is the news.
 * The scaling invariant — that per-decision cost does not grow with catalogue
 * size — is asserted separately in packages/runtime, where it belongs.
 */

import { execute } from '@metis/runtime';
import type { CatalogueSnapshot, ExecArtifact, DecisionRequest } from '@metis/runtime/deterministic/types';

export interface Percentiles {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  /**
   * 95% confidence interval on the mean, from the full sample.
   *
   * §10 requires confidence intervals with every published benchmark, and the
   * honest reason is that a bare mean invites comparison between two runs that
   * may not actually differ. Computed here because this is the only place the
   * individual latencies exist — deriving it later from the percentiles would
   * be arithmetic on six numbers dressed up as statistics.
   */
  meanConfidence95: { low: number; high: number };
}

export interface ScenarioResult {
  name: string;
  decisions: number;
  /** Per-decision latency in milliseconds. */
  latency: Percentiles;
  /** Decisions per second, single-threaded. */
  throughput: number;
  wallMs: number;
  /** How many decisions returned an offer, as a sanity check on the workload. */
  offered: number;
}

export interface Scenario {
  name: string;
  artifact: ExecArtifact;
  catalogue: CatalogueSnapshot;
  request: (index: number) => DecisionRequest;
  decisions: number;
  /** Untimed decisions first, so JIT warm-up lands outside the measurement. */
  warmup?: number;
}

/** Nearest-rank percentile. No interpolation; the sample is large enough. */
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, rank)];
}

export function runScenario(scenario: Scenario): ScenarioResult {
  const { artifact, catalogue, request } = scenario;
  const warmup = scenario.warmup ?? Math.min(500, scenario.decisions);

  for (let i = 0; i < warmup; i++) {
    execute(artifact, catalogue, request(i));
  }

  const latencies = new Float64Array(scenario.decisions);
  let offered = 0;

  const wallStart = performance.now();
  for (let i = 0; i < scenario.decisions; i++) {
    const req = request(i);
    // performance.now() is sub-microsecond here; Date.now() is not, which is
    // the whole reason the previous harness measured nothing.
    const started = performance.now();
    const trace = execute(artifact, catalogue, req);
    latencies[i] = performance.now() - started;
    if (trace.decision.winner) offered++;
  }
  const wallMs = performance.now() - wallStart;

  const sorted = Array.from(latencies).sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / (sorted.length || 1);

  const variance =
    sorted.length > 1
      ? sorted.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (sorted.length - 1)
      : 0;
  // Normal approximation. The sample is in the tens of thousands, so the gap
  // from a t-distribution is far under the measurement noise.
  const halfWidth = 1.96 * Math.sqrt(variance / (sorted.length || 1));

  return {
    name: scenario.name,
    decisions: scenario.decisions,
    latency: {
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      mean,
      meanConfidence95: { low: mean - halfWidth, high: mean + halfWidth },
    },
    throughput: (scenario.decisions / wallMs) * 1000,
    wallMs,
    offered,
  };
}

export interface Budget {
  /**
   * The platform's stated latency promise, and what the gate enforces.
   *
   * p99, not p95. The specification's executive summary states it as
   * "sub-50 ms p99 for a single-customer, multi-candidate arbitrated
   * decision", and the gate should hold the promise that was made rather than
   * an easier neighbour of it. The engine passes either with two orders of
   * magnitude to spare, so taking the stricter reading costs nothing today and
   * is the number a customer will quote back.
   */
  p99Ms: number;
  /**
   * Reported, and also gated, because it is free to hold and a p95 regression
   * is the early warning for a p99 one.
   */
  p95Ms: number;
  /**
   * Decisions per second a single core must sustain, or null to measure
   * without gating.
   *
   * The plan's "1000 req/s" is a service-level claim; this harness is
   * single-threaded, so it measures per-core capacity. Holding a stress
   * scenario to a service-level number would be comparing two different
   * things, and the honest response to that is to say so rather than to
   * quietly widen the threshold.
   */
  throughputPerSecond: number | null;
}

/** The Foundation MVP gate, for a realistic workload. */
export const BUDGET: Budget = {
  p99Ms: 50,
  p95Ms: 50,
  throughputPerSecond: 1000,
};

export interface GateVerdict {
  passed: boolean;
  failures: string[];
}

export function checkGate(result: ScenarioResult, budget: Budget = BUDGET): GateVerdict {
  const failures: string[] = [];

  // p99 first: it is the promise, and reporting the p95 failure ahead of it
  // would bury the number the specification actually states.
  if (result.latency.p99 > budget.p99Ms) {
    failures.push(
      `p99 ${result.latency.p99.toFixed(3)}ms exceeds the ${budget.p99Ms}ms budget`
    );
  }
  if (result.latency.p95 > budget.p95Ms) {
    failures.push(
      `p95 ${result.latency.p95.toFixed(3)}ms exceeds the ${budget.p95Ms}ms budget`
    );
  }
  if (
    budget.throughputPerSecond !== null &&
    result.throughput < budget.throughputPerSecond
  ) {
    failures.push(
      `throughput ${result.throughput.toFixed(0)}/s per core is under the ` +
        `${budget.throughputPerSecond}/s claimed`
    );
  }
  // A workload where nothing is ever offered would run fast and prove nothing:
  // the arbitration and scoring nodes would barely execute.
  if (result.offered === 0) {
    failures.push('no decision returned an offer — the workload is not exercising arbitration');
  }

  return { passed: failures.length === 0, failures };
}

export function formatResult(result: ScenarioResult, budget: Budget = BUDGET): string {
  const { latency: l } = result;
  const gate = checkGate(result, budget);
  const pct = ((l.p95 / budget.p95Ms) * 100).toFixed(1);

  return [
    `${result.name}`,
    `  decisions   ${result.decisions.toLocaleString('en-GB')} (${result.offered.toLocaleString('en-GB')} offered)`,
    `  latency ms  p50 ${l.p50.toFixed(3)}  p95 ${l.p95.toFixed(3)}  p99 ${l.p99.toFixed(3)}  max ${l.max.toFixed(3)}`,
    `  throughput  ${result.throughput.toFixed(0)}/s per core` +
      (budget.throughputPerSecond === null ? ' (measured, not gated)' : ''),
    `  budget      p95 is ${pct}% of ${budget.p95Ms}ms`,
    gate.passed
      ? `  PASS`
      : `  FAIL\n${gate.failures.map((f) => `    - ${f}`).join('\n')}`,
  ].join('\n');
}
