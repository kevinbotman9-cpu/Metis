#!/usr/bin/env node
/**
 * Regenerate something, and fail if the result differs from what is committed.
 *
 * The determinism claim in one command: `npm run corpus` twice must produce the
 * same bytes, and a corpus that changed without anybody meaning it to is a
 * chain hash that moved. Same for the generated client against the spec.
 *
 * This was inline shell in the workflow, which meant the check existed only on
 * a CI runner and the local equivalent was three commands somebody had to
 * remember in the right order. A gate that cannot be run where the code is
 * written is a gate that is discovered rather than used.
 *
 *   node scripts/check-regenerated.mjs <npm-script> <path> [path...]
 *
 * Leaves the working tree as it found it on success; on failure it leaves the
 * regenerated output in place, because the diff is the evidence.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const [script, ...paths] = process.argv.slice(2);
if (!script || paths.length === 0) {
  console.error('usage: check-regenerated.mjs <npm-script> <path> [path...]');
  process.exit(2);
}

const sh = (command, options = {}) =>
  spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', ...options });

// A dirty path before regenerating makes the check meaningless: the diff would
// be the author's own edit rather than the generator disagreeing with it. Say
// so rather than reporting a failure the author cannot act on.
const before = sh(`git diff --name-only -- ${paths.join(' ')}`);
if (before.stdout.trim()) {
  console.error(
    `Uncommitted changes under ${paths.join(', ')} before regenerating:\n${before.stdout}` +
      'Commit or stash them — this check compares the generator against what is committed.'
  );
  process.exit(2);
}

const generated = sh(`npm run ${script}`, { stdio: 'inherit' });
if (generated.status !== 0) {
  console.error(`\`npm run ${script}\` failed, so there is nothing to compare.`);
  process.exit(1);
}

const diff = sh(`git diff --exit-code --stat -- ${paths.join(' ')}`, { stdio: 'inherit' });
if (diff.status !== 0) {
  console.error(
    `\n\`npm run ${script}\` changed ${paths.join(', ')}.\n` +
      'Either the generator and the committed output have drifted, or the change is ' +
      'intended and belongs in this commit. Both are answers; neither is silence.'
  );
  process.exit(1);
}

console.log(`${paths.join(', ')} is byte-identical after \`npm run ${script}\`.`);
