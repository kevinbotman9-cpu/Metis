#!/usr/bin/env node
/**
 * Put every flaky test in the run summary.
 *
 * Playwright's `retries: 1` means a test that fails once and passes on the
 * second attempt is reported as **passing** — by the list reporter, by the
 * GitHub reporter, and in the job's status. Combined with CI running the suite
 * exactly once per push, a suite failing one run in three passed two pushes in
 * three and nothing anywhere said so. That is how three order-dependent
 * failures sat in the tree for weeks: not because a check was missing, but
 * because the check could not see its own unreliability.
 *
 * This reads the JSON reporter's output and writes a section into
 * `$GITHUB_STEP_SUMMARY`. It exits 0 either way: a flake is a defect to
 * investigate, not a reason to fail a push that is otherwise green. The
 * scheduled job is the one that fails on them.
 *
 * Usage: node scripts/report-flaky.mjs <results.json>
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: report-flaky.mjs <playwright-results.json>');
  process.exit(0);
}

let report;
try {
  report = JSON.parse(readFileSync(resolve(file), 'utf8'));
} catch (e) {
  // A missing file means the suite never produced one — it crashed, or the
  // step before this did not run. Say so rather than reporting "no flakes",
  // which is the same silence this script exists to break.
  write(`### Flaky tests\n\nNo results file at \`${file}\` — ${e.message}\n`);
  process.exit(0);
}

/** Every test, flattened out of the suite tree. */
function* tests(suite) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      yield { title: spec.title, file: spec.file, line: spec.line, test };
    }
  }
  for (const child of suite.suites ?? []) yield* tests(child);
}

const all = [...(report.suites ?? [])].flatMap((s) => [...tests(s)]);

// Playwright marks a test `flaky` when it failed at least once and then passed.
const flaky = all.filter((t) => t.test.status === 'flaky');
const failed = all.filter((t) => t.test.status === 'unexpected');

const lines = ['### Flaky tests', ''];

if (flaky.length === 0) {
  lines.push(
    all.length === 0
      ? 'No tests in the report.'
      : `None. ${all.length} tests, no retries needed.`
  );
} else {
  lines.push(
    `**${flaky.length} of ${all.length} tests passed only on retry.** ` +
      'They are reported as passing everywhere else, which is what this section exists to correct.',
    '',
    '| Test | File | Attempts |',
    '|---|---|---|'
  );
  for (const t of flaky) {
    const attempts = t.test.results?.length ?? 2;
    const where = `${t.file}:${t.line}`;
    lines.push(`| ${t.title.replace(/\|/g, '\\|')} | \`${where}\` | ${attempts} |`);
  }
  lines.push(
    '',
    'A test that passes only on retry is a defect to investigate, not a result ' +
      'to accept. See G-003 and G-035 in `docs/gaps.md` for what the last three cost.'
  );
}

if (failed.length > 0) {
  lines.push('', `${failed.length} test(s) failed outright; the job status covers those.`);
}

write(lines.join('\n') + '\n');

// Also on stdout, so it is in the log for anyone reading that instead.
console.log(lines.join('\n'));

function write(text) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, text);
}
