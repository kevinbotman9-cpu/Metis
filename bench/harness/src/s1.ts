import { execSync } from 'node:child_process';
import { cpus, totalmem, arch, platform, release } from 'node:os';
import { buildWorkload } from '@metis/datasets';
import { runScenario, checkGate, BUDGET, type ScenarioResult, type Budget } from './index';

/**
 * S1: the reference workload the specification names.
 *
 * 1 million profiles, 100 active actions, 1k sustained and 2k burst decisions
 * per second. §10 also requires that a result never travels without its
 * context — "workload, data distribution, infrastructure, code version, model
 * latency, cache state and confidence intervals with every benchmark" — which
 * is why the report type below makes those fields mandatory rather than
 * optional. A number that can be quoted without its conditions will be.
 *
 * **What is measured, and what is not.**
 *
 * Two of the variants §10 lists cannot be measured honestly yet, and inventing
 * them would be worse than recording their absence:
 *
 *   - *Feature-store miss rates (1%, 5%, 20%)* need an online feature service.
 *     There is none — W-009. A "miss" against a store that does not exist is a
 *     number about nothing.
 *   - *Degraded provider* needs the integration gateway inside the measured
 *     path. Connector resolution deliberately runs before the deterministic
 *     core, so the harness would be timing a stub.
 *
 * Both are declared in `notMeasured` and travel in the published result, so a
 * reader sees the shape of the claim rather than only its strongest part.
 *
 * *Cold* and *warm* are real here and worth separating: cold is the first
 * decisions a process makes, before the JIT has settled, which is what a
 * freshly deployed instance actually serves.
 */

export interface RunContext {
  /** §10: infrastructure. */
  infrastructure: {
    platform: string;
    release: string;
    arch: string;
    cores: number;
    memoryGb: number;
    nodeVersion: string;
  };
  /** §10: code version. Exact, so a number can be traced to a commit. */
  codeVersion: string;
  /** §10: data distribution. */
  workload: {
    profiles: number;
    activeActions: number;
    policiesPerOffer: number;
    channels: number;
    seeded: true;
  };
  /**
   * §10: model latency.
   *
   * Zero, and stated rather than omitted: propensity is a seeded deterministic
   * function, not a served model. An empty field would read as "not recorded";
   * this reads as "there is no model call in this path", which is the fact.
   */
  modelLatencyMs: number;
}

export interface S1Variant {
  name: string;
  cacheState: 'cold' | 'warm';
  result: ScenarioResult;
  /** 95% confidence interval on the mean, in milliseconds. */
  meanConfidence95: { low: number; high: number };
  passed: boolean;
  failures: string[];
}

export interface S1Report {
  scenario: 'S1';
  generatedAt: string;
  context: RunContext;
  budget: Budget;
  variants: S1Variant[];
  /** Named, with the reason each is absent. */
  notMeasured: { variant: string; reason: string; blockedOn: string }[];
  passed: boolean;
}

function codeVersion(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // Better than a fabricated value: a result whose provenance is unknown
    // should say so, not carry a plausible-looking hash.
    return 'unknown (not a git checkout)';
  }
}

export interface S1Options {
  /** Overridable so a CI run can be smaller than a reported one. */
  profiles?: number;
  activeActions?: number;
  decisions?: number;
  budget?: Budget;
}

export function runS1(options: S1Options = {}): S1Report {
  const profiles = options.profiles ?? 1_000_000;
  const activeActions = options.activeActions ?? 100;
  const decisions = options.decisions ?? 20_000;
  // Latency gated, throughput measured — the decision already recorded in
  // `gate.test.ts`, applied here rather than quietly re-litigated. That suite
  // saw 883/s inside a full run on a loaded machine and 2,845/s on the same
  // commit when quiet; a gate with a 3x swing from machine load is one that
  // gets ignored, and an ignored gate is worse than none. p99 has two orders
  // of magnitude of headroom and does not move like that.
  const budget = options.budget ?? { ...BUDGET, throughputPerSecond: null };

  const workload = buildWorkload({
    offers: activeActions,
    customers: profiles,
    policies: 3,
  });

  const variants: S1Variant[] = [];

  for (const cacheState of ['cold', 'warm'] as const) {
    const result = runScenario({
      name: `S1-${cacheState}`,
      artifact: workload.artifact,
      catalogue: workload.catalogue,
      request: workload.request,
      decisions,
      // Cold means cold: no warm-up, so the measurement includes the JIT
      // settling, which is what a freshly deployed instance serves.
      warmup: cacheState === 'cold' ? 0 : Math.min(2_000, decisions),
    });

    const verdict = checkGate(result, budget);
    variants.push({
      name: result.name,
      cacheState,
      result,
      meanConfidence95: result.latency.meanConfidence95,
      passed: verdict.passed,
      failures: verdict.failures,
    });
  }

  return {
    scenario: 'S1',
    generatedAt: new Date().toISOString(),
    context: {
      infrastructure: {
        platform: platform(),
        release: release(),
        arch: arch(),
        cores: cpus().length,
        memoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
        nodeVersion: process.version,
      },
      codeVersion: codeVersion(),
      workload: {
        profiles,
        activeActions,
        policiesPerOffer: 3,
        channels: 5,
        seeded: true,
      },
      modelLatencyMs: 0,
    },
    budget,
    variants,
    notMeasured: [
      {
        variant: 'feature-store miss (1% / 5% / 20%)',
        reason:
          'There is no online feature service, so a miss rate would be a ' +
          'number about nothing.',
        blockedOn: 'W-009',
      },
      {
        variant: 'degraded provider',
        reason:
          'Connector resolution runs before the deterministic core by design, ' +
          'so the harness would be timing a stub rather than a degraded ' +
          'dependency.',
        blockedOn: 'W-010, and the gateway entering the measured path',
      },
      {
        variant: 'throughput as a gate',
        reason:
          'Measured and published on every variant, never gated. It swings 3x ' +
          'with machine load, and a gate that flaps is one people learn to ' +
          'ignore. The number is in the result so a regression is still visible.',
        blockedOn: 'nothing — this is a decision, not a gap',
      },
      {
        variant: 'sustained 1k/s and 2k burst',
        reason:
          'This harness is single-threaded and measures per-core capacity. A ' +
          'service-level throughput claim needs the service, not the engine, ' +
          'and holding one to the other would compare two different things.',
        blockedOn: 'a deployed service under load, not this harness',
      },
    ],
    passed: variants.every((v) => v.passed),
  };
}
