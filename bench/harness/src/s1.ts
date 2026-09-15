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

/**
 * What this result is, and is not, stated inside the artifact.
 *
 * First in the file, generated with the numbers, because a latency figure is
 * quoted without its conditions the moment the conditions live anywhere else.
 * The scope and the M1/M2 statement are constants of the harness, not of a run:
 * nothing a run does can make this an HTTP or ledger measurement.
 */
export interface S1Header {
  scope: string;
  excludedFromTiming: string[];
  notM1OrM2: string;
  machine: string;
  machineLoad: string;
  tenant: string;
  dataset: string;
  requestMix: string[];
  cacheStates: string[];
  sampleSize: string;
  generalisesTo: string;
  reproduce: string;
}

export interface S1Report {
  scenario: 'S1';
  header: S1Header;
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

  const infrastructure = {
    platform: platform(),
    release: release(),
    arch: arch(),
    cores: cpus().length,
    memoryGb: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    nodeVersion: process.version,
  };
  const cold = variants.find((v) => v.cacheState === 'cold');
  const warm = variants.find((v) => v.cacheState === 'warm');
  const warmSlower = cold && warm && warm.result.latency.p99 > cold.result.latency.p99;
  const warmupCount = Math.min(2_000, decisions);

  const header: S1Header = {
    scope:
      'In-process engine execution only: the deterministic engine called as a function in one Node process, ' +
      'on one thread.',
    excludedFromTiming: [
      'HTTP transport and serialisation',
      'the ledger write (no decision record is stored)',
      'connector calls (inputs are generated in-process; the connector is declared, never called)',
      'network',
      'request generation (built before the timer starts)',
      'warm-up decisions (the warm variant runs ' + warmupCount.toLocaleString('en-GB') + ' untimed first)',
    ],
    notM1OrM2:
      'This is NOT M1 or M2. ADR-016 §7 defines M1 as the built decision service over HTTP with open-loop load ' +
      'for at least 30 minutes, and M2 as that with the synchronous ledger write at 10M and 100M decision records. ' +
      'Neither has been measured, and no script exists for either.',
    machine:
      `${infrastructure.cores} logical cores, ${infrastructure.memoryGb} GB, ${infrastructure.platform} ${infrastructure.release} ${infrastructure.arch}, Node ${infrastructure.nodeVersion}`,
    machineLoad:
      'Not controlled: a developer machine with other processes running.' +
      (warmSlower
        ? ' In this run the warm variant\'s p99 exceeded the cold variant\'s, which a quiet machine would not produce; treat the spread between runs as noise of that size.'
        : ''),
    tenant: "'bench' — a synthetic tenant generated by bench/datasets. Not the demo tenant (telco-us) and not its catalogue.",
    dataset:
      `Synthetic, seeded: ${activeActions} active offers, 3 targeting policies with each offer scoped by 2, ` +
      `1 frequency policy, 1 boost, 1 declared connector. Requests are drawn from ${profiles.toLocaleString('en-GB')} ` +
      'distinct generated customer ids; there is no profile store, so no decision reads a profile from storage.',
    requestMix: [
      'One flow: source, eligibility filter, relevance filter, frequency constraint, score node, arbitrate.',
      'Channel cycles deterministically over web, email, sms, push and outbound_call; one placement.',
      'Customer attributes (segment, tenure, credit score, spend, active) are seeded per customer id.',
      'The score node pins a model id, and its propensity is a seeded hash of customer, offer and model — no model runs.',
    ],
    cacheStates: variants.map((v) => `${v.name}: ${v.cacheState === 'cold' ? 'no warm-up, first decisions of the process' : 'after untimed warm-up'}`),
    sampleSize: `${decisions.toLocaleString('en-GB')} timed decisions per variant`,
    generalisesTo:
      `Only this: in-process engine cost for one tenant with ${activeActions} active offers, on the machine above. ` +
      'Not a service latency, not throughput under concurrent load, not a figure for any other catalogue size or tenant.',
    reproduce: 'npm run bench:s1',
  };

  return {
    scenario: 'S1',
    header,
    generatedAt: new Date().toISOString(),
    context: {
      infrastructure,
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
