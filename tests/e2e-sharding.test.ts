import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

/**
 * The four shards run every test, each one exactly once.
 *
 * The end-to-end suite gates every push and took ~13 minutes serially, so it is
 * split across four runners with `--shard`. The failure mode that split
 * introduces is silence: a shard configuration that drops a spec file does not
 * error, it reports a green quarter of a suite. Nothing in Playwright or in the
 * workflow notices, because from each runner's point of view everything it was
 * asked to run passed.
 *
 * This asserts the split is a **partition** — the union of the shards is the
 * whole suite, and no test is in two of them. It reads the shard count out of
 * the workflow rather than repeating it, so changing the matrix without
 * changing this file fails here instead of quietly running three quarters of
 * the tests.
 *
 * `playwright test --list` starts no dev server and executes nothing; five
 * listings run in parallel in a few seconds.
 *
 * **The warmup project is expected in every shard.** It compiles the routes on
 * the runner before the specs need them, so it is a dependency rather than a
 * test, and a shard that skipped it would pay the compile inside a test's own
 * timeout. It is counted separately below for that reason — including it in the
 * partition arithmetic is what makes a naive `146 + 60 + 102 + 98 = 406`
 * disagree with a full list of 403, which looks like a bug and is not one.
 */

const root = resolve(__dirname, '..');
const consoleDir = resolve(root, 'apps/console');
const WORKFLOW = resolve(root, '.github/workflows/console.yml');

/**
 * How many shards CI actually runs.
 *
 * Read from **both** places the number appears, and asserted equal. The matrix
 * says how many runners start; the `--shard=i/n` denominator says how many
 * slices the suite is cut into. They are independent, and when they disagree
 * the result is silent: a matrix of 3 against a denominator of 4 starts three
 * runners that between them run three quarters of the tests and pass.
 *
 * The first version of this check read only the matrix, derived the denominator
 * from its length, and reported a perfect partition for exactly that
 * configuration.
 */
function shardCount(): number {
  const doc = load(readFileSync(WORKFLOW, 'utf8')) as {
    jobs: Record<string, { strategy?: { matrix?: { shard?: number[] } }; steps?: { run?: string }[] }>;
  };
  const e2e = doc.jobs.e2e;
  const shards = e2e?.strategy?.matrix?.shard;
  expect(Array.isArray(shards), 'the e2e job has no shard matrix').toBe(true);
  // 1..n, in order — `--shard=i/n` is positional and a gap would skip a slice.
  expect(shards).toEqual(Array.from({ length: shards!.length }, (_, i) => i + 1));

  const runs = (e2e!.steps ?? []).map((s) => s.run ?? '').join('\n');
  // `.` rather than `\S`: the numerator is `${{ matrix.shard }}`, which has
  // spaces in it, and the denominator is whatever follows the first slash.
  const denominators = [...runs.matchAll(/--shard=.*?\/(\d+)/g)].map((m) => Number(m[1]));
  expect(denominators, 'no --shard=i/n in the e2e job').not.toEqual([]);
  expect(
    [...new Set(denominators)],
    'the shard denominators disagree with each other'
  ).toEqual([shards!.length]);

  return shards!.length;
}

interface Listed {
  chromium: string[];
  warmup: string[];
}

/** Every test Playwright would run, as stable `project|file:line|title` ids. */
function list(shard?: string): Listed {
  const args = ['playwright', 'test', '--list', '--reporter=json'];
  if (shard) args.push(`--shard=${shard}`);
  const out = execFileSync('npx', args, {
    cwd: consoleDir,
    encoding: 'utf8',
    maxBuffer: 64e6,
    shell: process.platform === 'win32',
  });

  /** Only the shape this needs; Playwright's report carries a great deal more. */
  interface Suite {
    specs?: { file: string; line: number; title: string; tests?: { projectName: string }[] }[];
    suites?: Suite[];
  }

  const report = JSON.parse(out) as { suites?: Suite[] };
  const ids: { project: string; id: string }[] = [];
  const walk = (suite: Suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        ids.push({ project: t.projectName, id: `${spec.file}:${spec.line}|${spec.title}` });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const s of report.suites ?? []) walk(s);

  return {
    chromium: ids.filter((x) => x.project === 'chromium').map((x) => x.id),
    warmup: ids.filter((x) => x.project === 'warmup').map((x) => x.id),
  };
}

describe('the sharded end-to-end suite', () => {
  const n = shardCount();
  const full = list();
  const shards = Array.from({ length: n }, (_, i) => list(`${i + 1}/${n}`));

  it('lists a suite worth sharding', () => {
    // A guard on the guard. If `--list` ever returns nothing — a config change,
    // a rename, a Playwright upgrade — every assertion below passes over two
    // empty sets and says the split is perfect.
    expect(full.chromium.length, 'nothing to shard').toBeGreaterThan(100);
    expect(full.warmup.length, 'the warmup project is gone').toBe(1);
  });

  it('runs every test, in exactly one shard', () => {
    // The whole point. Set equality in both directions, so a dropped file and
    // an invented one are different failures with different messages.
    const union = shards.flatMap((s) => s.chromium);
    const inFull = new Set(full.chromium);
    const inShards = new Set(union);

    const dropped = full.chromium.filter((t) => !inShards.has(t));
    expect(dropped, `${dropped.length} tests are in no shard and would never run`).toEqual([]);

    const stray = union.filter((t) => !inFull.has(t));
    expect(stray, 'a shard lists a test the full suite does not').toEqual([]);
  });

  it('reaches every spec file on disk', () => {
    // Checked against the filesystem, not against `--list`. Comparing the
    // shards to the full listing only catches the sharding mechanism; a
    // `testIgnore` or `testMatch` that drops a whole file removes it from both
    // sides, so the two agree and are wrong together. The files are the only
    // source of truth that a config change cannot move.
    const dir = resolve(consoleDir, 'tests/e2e');
    const onDisk = readdirSync(dir)
      .filter((f) => f.endsWith('.spec.ts'))
      .map((f) => `tests/e2e/${f}`.replace(/\\/g, '/'));
    expect(onDisk.length, 'no spec files found').toBeGreaterThan(10);

    const covered = new Set(
      shards.flatMap((s) => s.chromium).map((id) => id.split(':')[0].replace(/\\/g, '/'))
    );
    const unreached = onDisk.filter((f) => ![...covered].some((c) => f.endsWith(c) || c.endsWith(f)));
    expect(unreached, 'these spec files exist and no shard would run them').toEqual([]);
  });

  it('runs no test twice', () => {
    // Duplication is cheaper than a drop and still wrong: it inflates the
    // counts the flaky summary is computed over, and a test that writes to the
    // shared dev store would run twice against it.
    const seen = new Map<string, number[]>();
    shards.forEach((s, i) =>
      s.chromium.forEach((t) => seen.set(t, [...(seen.get(t) ?? []), i + 1]))
    );
    const twice = [...seen.entries()]
      .filter(([, where]) => where.length > 1)
      .map(([t, where]) => `${t} in shards ${where.join(', ')}`);
    expect(twice).toEqual([]);
  });

  it('compiles the routes on every runner', () => {
    // The warmup is a dependency, not a test: without it the first spec to
    // reach a route pays `next dev`'s compile inside its own expect timeout.
    // Each shard is a separate machine and needs its own.
    const missing = shards
      .map((s, i) => (s.warmup.length === 1 ? null : `shard ${i + 1}: ${s.warmup.length}`))
      .filter(Boolean);
    expect(missing, 'a shard would compile routes inside a test timeout').toEqual([]);
  });

  it('splits the work rather than piling it on one runner', () => {
    // Not a balance requirement — Playwright shards whole files when
    // `fullyParallel` is off, and file sizes differ. This catches the
    // degenerate case where the split stops working and one shard inherits
    // nearly everything, which would leave the wall-clock time unchanged while
    // three runners bill for nothing.
    const sizes = shards.map((s) => s.chromium.length);
    expect(Math.min(...sizes), `empty shard: ${sizes.join(', ')}`).toBeGreaterThan(0);
    expect(
      Math.max(...sizes),
      `one shard holds most of the suite: ${sizes.join(', ')}`
    ).toBeLessThan(full.chromium.length * 0.6);
  });
});
