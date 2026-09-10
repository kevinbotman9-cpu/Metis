#!/usr/bin/env node
/**
 * Every gate, in one place, run by one command.
 *
 * `npm run gates` runs exactly what CI runs. That sentence was not true of any
 * command in this repository before 2026-09-10, and the gap was not small:
 *
 * - **The root lint ran nowhere in CI.** `verify` sets
 *   `working-directory: apps/console` as a job default, so its `Lint` step —
 *   written to be the root lint — executed `npm run lint` inside the console
 *   and linted the console. The step after it, `Lint (console)`, linted the
 *   console again. `eslint packages bench tests scripts` had never run on a
 *   pull request.
 * - **Three workspaces ran nowhere in CI.** `test:core`, `test:catalogue` and
 *   `test:portability` are in the root `npm test` chain and in none of the
 *   workflow's steps.
 * - **`npm run conformance` did not exist.** CLAUDE.md instructs every session
 *   to start and end by running it. The script was never added, so the
 *   documented command fails, and every session has been invoking
 *   `node --import tsx scripts/conformance.mjs` by hand instead.
 *
 * None of that was visible from a terminal. Running the obvious commands and
 * seeing green meant having checked a proper subset of CI, and the only way to
 * learn which subset was to read the workflow line by line. This slice exists
 * because a two-character unused import reached a pull request behind three
 * confident reports that lint was clean.
 *
 * **`GATES` is the single list.** `tests/gates-parity.test.ts` reads it and
 * reads `.github/workflows/console.yml`, and fails when either grows or loses
 * a gate the other does not have. A step added to the workflow is a failing
 * test until it is either declared a gate here or classified as
 * infrastructure there — which is the point: drift becomes a red check rather
 * than a discovery six weeks later.
 *
 * Gates run in CI's order and stop at the first failure, because CI's steps
 * are sequential and do the same. A gate that fails locally fails a pull
 * request; there is no longer a version of "green" that means something
 * different in the two places.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * One gate.
 *
 * `command` is what runs locally. `ci` is the exact string the workflow uses,
 * which is usually identical — the exceptions are declared rather than
 * inferred, so the parity check can hold the two to each other without being
 * defeated by a legitimate difference.
 */
export const GATES = [
  {
    id: 'typecheck-packages',
    label: 'Typecheck (packages, tests, bench, scripts)',
    cwd: '.',
    command: 'npx tsc --noEmit -p tsconfig.typecheck.json',
  },
  {
    id: 'typecheck-console',
    label: 'Typecheck (console and the packages it uses)',
    cwd: 'apps/console',
    command: 'npx tsc --noEmit',
  },
  {
    // Covers `packages bench tests scripts`. Distinct from the console's lint
    // and, until this slice, run by nobody on a pull request.
    id: 'lint-root',
    label: 'Lint (packages, bench, tests, scripts)',
    cwd: '.',
    command: 'npm run lint',
  },
  {
    id: 'lint-console',
    label: 'Lint (console)',
    cwd: '.',
    command: 'npm run lint -w @metis/console',
  },
  { id: 'test-runtime', label: 'Determinism (execution engine)', cwd: '.', command: 'npm run test:runtime' },
  { id: 'test-compiler', label: 'Compiler', cwd: '.', command: 'npm run test:compiler' },
  { id: 'test-core', label: 'Core', cwd: '.', command: 'npm run test:core' },
  { id: 'test-catalogue', label: 'Catalogue', cwd: '.', command: 'npm run test:catalogue' },
  { id: 'test-portability', label: 'Portability', cwd: '.', command: 'npm run test:portability' },
  { id: 'test-ledger', label: 'Ledger', cwd: '.', command: 'npm run test:ledger' },
  { id: 'test-registry', label: 'Registry', cwd: '.', command: 'npm run test:registry' },
  { id: 'test-bench', label: 'Performance budget', cwd: '.', command: 'npm run test:bench' },
  {
    id: 'test-ui-metadata',
    label: 'Form descriptors match the spec',
    cwd: '.',
    command: 'npm run test:ui-metadata',
  },
  { id: 'test-integration', label: 'Integration', cwd: '.', command: 'npm run test:integration' },
  { id: 'test-console', label: 'Unit tests (console)', cwd: 'apps/console', command: 'npm test' },
  {
    // CI shards this four ways across four runners; one machine runs it whole.
    // The difference is declared so the parity check can accept it and reject
    // anything else.
    id: 'e2e',
    label: 'End-to-end and accessibility',
    cwd: 'apps/console',
    command: 'npx playwright test',
    ci: 'npx playwright test --shard=${{ matrix.shard }}/4 --reporter=blob',
  },
  { id: 'bundle', label: 'Route bundle budgets', cwd: 'apps/console', command: 'npm run test:bundle' },
  { id: 'spec', label: 'Validate the OpenAPI spec', cwd: '.', command: 'node scripts/validate-spec.mjs' },
  {
    id: 'corpus',
    label: 'The conformance corpus matches the reference',
    cwd: '.',
    command: 'node scripts/check-regenerated.mjs corpus docs/conformance/',
  },
  {
    id: 'client',
    label: 'The generated client matches the spec',
    cwd: '.',
    command: 'node scripts/check-regenerated.mjs generate packages/client/src/generated.ts',
  },
  {
    // The UX contract, as a ratchet rather than a pass/fail. The repo has 26
    // standing failures — mostly `layout-manifests`, a rule with no
    // implementation behind it (W-041) — so `npm run conformance` exits 1 on a
    // healthy tree and wiring it in raw would redden every pull request.
    // CLAUDE.md's rule is that the count may not *rise*; this enforces that
    // against a committed baseline, and fails just as loudly when it falls
    // without being recorded.
    id: 'conformance',
    label: 'UX conformance holds at the baseline',
    cwd: '.',
    command: 'node scripts/check-conformance.mjs',
  },
];

/** What the workflow runs that is not a gate. Each needs a reason. */
export const NOT_A_GATE = {
  'npm ci': 'installing dependencies is setup, not a check',
  'npx playwright install --with-deps chromium': 'installing a browser is setup, not a check',
  'npx playwright merge-reports --reporter=json all-blob-reports > playwright-results.json':
    'recombining shard reports so the flaky summary can read one report',
  'node ../../scripts/report-flaky.mjs playwright-results.json':
    'reports flaky tests into the run summary and deliberately does not fail the job',
};

// --- runner ----------------------------------------------------------------

function run(gate) {
  const started = Date.now();
  const result = spawnSync(gate.command, {
    cwd: path.join(root, gate.cwd),
    shell: true,
    stdio: 'inherit',
  });
  return { ok: result.status === 0, seconds: (Date.now() - started) / 1000 };
}

const isMain =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());

if (isMain) {
  const only = process.argv.slice(2);
  const selected = only.length ? GATES.filter((g) => only.includes(g.id)) : GATES;

  if (selected.length === 0) {
    console.error(`No gate matched ${only.join(', ')}. Known: ${GATES.map((g) => g.id).join(', ')}`);
    process.exit(2);
  }

  const done = [];
  for (const [i, gate] of selected.entries()) {
    console.log(`\n\u001b[1m── ${i + 1}/${selected.length}  ${gate.label}\u001b[0m  (${gate.command})`);
    const { ok, seconds } = run(gate);
    done.push({ gate, ok, seconds });
    if (!ok) {
      // Stop where CI stops. A run that carries on past a failure reports a
      // shape of the codebase that no pull request will ever see.
      console.error(`\n\u001b[31m✗ ${gate.label} failed after ${seconds.toFixed(1)}s\u001b[0m`);
      console.error(`  Re-run this gate alone with:  npm run gates -- ${gate.id}`);
      break;
    }
  }

  const failed = done.filter((d) => !d.ok);
  console.log('\n' + '─'.repeat(60));
  for (const d of done) {
    console.log(`  ${d.ok ? '\u001b[32m✓\u001b[0m' : '\u001b[31m✗\u001b[0m'} ${d.gate.label.padEnd(44)} ${d.seconds.toFixed(1)}s`);
  }
  const skipped = selected.length - done.length;
  if (skipped > 0) console.log(`  ${skipped} gate(s) not reached`);
  console.log('─'.repeat(60));

  process.exit(failed.length > 0 ? 1 : 0);
}
