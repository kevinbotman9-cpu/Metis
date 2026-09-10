#!/usr/bin/env node
/**
 * UX conformance as a gate: the failure count may not rise.
 *
 * `scripts/conformance.mjs` exits non-zero whenever anything fails, and this
 * repository has 26 standing failures — most of them `layout-manifests`, a rule
 * that fires once per route and has no implementation behind it (W-041). That
 * is the documented state, not a regression, so wiring the script straight into
 * CI would paint every pull request red and teach everyone to ignore it.
 *
 * CLAUDE.md states the actual rule: *"The count may not rise, with one
 * exception: a rule that fires once per route and has no implementation behind
 * it. Adding a screen adds exactly one such failure."* That is a ratchet, and a
 * ratchet needs a number written down. `docs/ux-conformance-baseline.json` is
 * that number.
 *
 * Three outcomes:
 *
 * - **Above the baseline** — fail, and name the rules, because a new
 *   conformance failure is a UI contract broken by this change.
 * - **At the baseline** — pass quietly.
 * - **Below the baseline** — pass, and say so loudly. A count that has fallen
 *   and not been recorded means the next regression has room to hide inside the
 *   slack.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join(root, 'docs/ux-conformance-baseline.json');

const result = spawnSync('node', ['--import', 'tsx', 'scripts/conformance.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);

const failures = Number(/(\d+) failure\(s\)/.exec(output)?.[1] ?? NaN);
const warnings = Number(/(\d+) warning\(s\)/.exec(output)?.[1] ?? NaN);

if (!Number.isFinite(failures)) {
  console.error(
    '\nCould not read a failure count out of the conformance report. ' +
      'That is a broken gate, not a passing one.'
  );
  process.exit(2);
}

if (!existsSync(BASELINE_FILE)) {
  console.error(`\nNo baseline at ${path.relative(root, BASELINE_FILE)}.`);
  process.exit(2);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));

if (failures > baseline.failures) {
  const rules = [...output.matchAll(/^\s*\[([a-z-]+)\]/gm)].map((m) => m[1]);
  const counts = rules.reduce((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});
  console.error(
    `\nUX conformance failures rose: ${baseline.failures} → ${failures}.\n` +
      `By rule: ${Object.entries(counts).map(([r, n]) => `${r} ${n}`).join(', ')}\n` +
      'If this is a new screen adding one `layout-manifests` failure, say which rule and why, ' +
      `then raise the baseline in ${path.relative(root, BASELINE_FILE)}. Otherwise it is a ` +
      'contract this change broke.'
  );
  process.exit(1);
}

if (failures < baseline.failures) {
  console.log(
    `\nUX conformance failures fell: ${baseline.failures} → ${failures}. ` +
      `Lower the baseline in ${path.relative(root, BASELINE_FILE)} in this commit, ` +
      'or the slack becomes somewhere the next regression can hide.'
  );
  process.exit(1);
}

console.log(
  `\nUX conformance holds at the baseline: ${failures} failure(s), ${warnings} warning(s).`
);
