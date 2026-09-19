import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUILD_ENV, checkBudgets, readRouteChunks, type Budgets } from './route-chunks';

/**
 * Route bundle budgets: `npm run test:bundle`.
 *
 * Builds the console, then reads what every route loads from the build's
 * manifests (`route-chunks.ts`, which says what that cannot see) and holds it
 * to `bundle-budgets.json`. `--no-build` reads the build already there, which
 * is only for trying a budget: a stale build measures whatever was there last
 * time and calls it today's number.
 */
const CONSOLE = resolve(__dirname, '../..');

if (!process.argv.includes('--no-build')) {
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: CONSOLE,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...BUILD_ENV },
  });
  if (build.status !== 0) {
    console.error(`the build failed (exit ${build.status}); nothing was measured`);
    process.exit(1);
  }
}

const budgets = JSON.parse(readFileSync(resolve(CONSOLE, 'bundle-budgets.json'), 'utf8')) as Budgets;
const { lines, failures } = checkBudgets(readRouteChunks(resolve(CONSOLE, '.next')), budgets);
for (const line of lines) console.log(line);
if (failures.length > 0) {
  console.error(`\n${failures.length} route budget failure(s):`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`\n${lines.length} routes within budget`);
