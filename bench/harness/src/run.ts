/**
 * `npm run bench` — the full scenario set, printed.
 *
 * The CI gate is the vitest test next door, which runs the realistic scenario
 * only so the suite stays quick. This is the one to run by hand when a number
 * looks wrong, or to see how cost moves with the size of the candidate set.
 */

import { buildWorkload } from '@metis/datasets';
import {
  runScenario,
  checkGate,
  formatResult,
  BUDGET,
  type Budget,
  type ScenarioResult,
} from './index';

/**
 * The stress scenario measures throughput without gating it.
 *
 * Not a loosened threshold: a different claim. "1000 req/s" in the Phase 0 plan
 * is what the *service* sustains, and a service scales horizontally. This
 * harness runs on one core, so holding a 400-candidate stress workload to a
 * service-level number would be comparing two different things. The latency
 * promise still applies and is still gated, because p95 is per decision and
 * does not improve by adding machines.
 */
const STRESS: Budget = { p95Ms: BUDGET.p95Ms, throughputPerSecond: null };

const SCENARIOS = [
  { name: 'Small catalogue (10 candidates)', propositions: 10, decisions: 20_000, budget: BUDGET },
  { name: 'Realistic catalogue (40 candidates)', propositions: 40, decisions: 20_000, budget: BUDGET },
  { name: 'Stress (400 candidates)', propositions: 400, decisions: 5_000, budget: STRESS },
];

const results: { result: ScenarioResult; budget: Budget }[] = [];

for (const scenario of SCENARIOS) {
  const workload = buildWorkload({ propositions: scenario.propositions });
  results.push({
    budget: scenario.budget,
    result: runScenario({
      name: scenario.name,
      artifact: workload.artifact,
      catalogue: workload.catalogue,
      request: workload.request,
      decisions: scenario.decisions,
    }),
  });
}

for (const { result, budget } of results) {
  console.log(formatResult(result, budget));
  console.log('');
}

// These scenarios grow the candidate set along with the catalogue, so more work
// is expected. What matters is that it stays proportional: 40x the candidates
// costing far more than 40x would mean something went quadratic.
const small = results[0].result;
const large = results[2].result;
const ratio = large.latency.p50 / Math.max(small.latency.p50, 1e-6);
console.log(
  `Cost scaling: 400 candidates cost ${ratio.toFixed(1)}x a 10-candidate decision, ` +
    `for 40x the work. Sub-linear, because the fixed per-decision costs do not ` +
    `scale. The separate flat-cost invariant — catalogue grows, candidate set ` +
    `does not — is asserted in packages/runtime.`
);
console.log(
  `\nPer-core capacity: ${large.throughput.toFixed(0)} decisions/s at 400 candidates. ` +
    `Sustaining 1000/s at that catalogue size needs four cores, or a strategy ` +
    `that narrows the candidate set before scoring.`
);

const failed = results.filter(({ result, budget }) => !checkGate(result, budget).passed);
if (failed.length > 0) {
  console.error(`\n${failed.length} scenario(s) failed their budget.`);
  process.exit(1);
}
