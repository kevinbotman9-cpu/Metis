#!/usr/bin/env node
/**
 * Run S1 and publish the result with everything §10 requires beside it.
 *
 *   npm run bench:s1
 *
 * Writes `bench/results/S1.json`. The file is the deliverable, not the console
 * output: §10 asks for "workload, data distribution, infrastructure, code
 * version, model latency, cache state and confidence intervals with every
 * benchmark", and the only way that survives contact with a slide deck is if
 * the number and its conditions live in the same artifact.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runS1 } from './s1';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../results');

const profiles = Number(process.env.S1_PROFILES ?? 1_000_000);
const decisions = Number(process.env.S1_DECISIONS ?? 20_000);

process.stdout.write(
  `S1: ${profiles.toLocaleString()} profiles, 100 actions, ${decisions.toLocaleString()} decisions per variant\n`
);

const report = runS1({ profiles, decisions });

mkdirSync(outDir, { recursive: true });
const path = resolve(outDir, 'S1.json');
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

for (const v of report.variants) {
  const l = v.result.latency;
  process.stdout.write(
    `  ${v.name.padEnd(10)} p50 ${l.p50.toFixed(3)}ms  p95 ${l.p95.toFixed(3)}ms  ` +
      `p99 ${l.p99.toFixed(3)}ms  of ${report.budget.p99Ms}ms  ` +
      `(${v.result.throughput.toFixed(0)}/s per core)\n`
  );
  for (const f of v.failures) process.stdout.write(`    FAIL ${f}\n`);
}

for (const n of report.notMeasured) {
  process.stdout.write(`  not measured: ${n.variant} — blocked on ${n.blockedOn}\n`);
}

process.stdout.write(`\nWrote ${path}\n`);
process.exit(report.passed ? 0 : 1);
