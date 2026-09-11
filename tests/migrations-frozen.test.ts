import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { checksumOf } from '@metis/core/migrate';

/**
 * A migration file already on `main` cannot change.
 *
 * The runner refuses a database whose recorded checksum for a file no longer
 * matches it (`packages/core/src/migrate.ts`). That protects every database
 * that has run the file — and none in CI, where every job starts empty and runs
 * whatever the branch contains. So an edit to `001_*.sql` in a pull request
 * would pass every check here and then refuse to start on every real database
 * it met. This is the same refusal, made where the edit is made.
 *
 * Measured against where this branch left `main` — the merge-base with
 * `origin/main` — so a file `main` gained after the branch point is not
 * counted against it. `METIS_MIGRATIONS_BASE` names another commit, which is
 * how the check was proved to bite before `main` had a runner. The same
 * checksum the runner records, so the two cannot disagree about what changed,
 * and line endings are normalised by it (CLAUDE.md, Rule 10).
 *
 * Fails rather than skips when the base cannot be found: a frozen-file check
 * that quietly passed without a base would be protecting nothing. CI checks
 * out with `fetch-depth: 0` so `origin/main` is there.
 */

const root = path.resolve(__dirname, '..');
const RUNNER = 'packages/core/src/migrate.ts';
const MIGRATION = /^packages\/[^/]+\/migrations\/[^/]+\.sql$/;

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function baseCommit(): string {
  const named = process.env.METIS_MIGRATIONS_BASE;
  try {
    return git('rev-parse', '--verify', `${named ?? git('merge-base', 'HEAD', 'origin/main').trim()}^{commit}`).trim();
  } catch (e) {
    throw new Error(
      `Cannot find the commit to compare migrations against (${named ? `METIS_MIGRATIONS_BASE=${named}` : 'merge-base of HEAD and origin/main'}). ` +
        'Fetch origin/main; in CI the checkout needs fetch-depth: 0. ' +
        (e as Error).message
    );
  }
}

const existsAt = (commit: string, file: string) => {
  try {
    git('cat-file', '-e', `${commit}:${file}`);
    return true;
  } catch {
    return false;
  }
};

function workingTreeMigrations(): string[] {
  const packages = path.join(root, 'packages');
  return fs
    .readdirSync(packages)
    .filter((p) => fs.existsSync(path.join(packages, p, 'migrations')))
    .flatMap((p) =>
      fs
        .readdirSync(path.join(packages, p, 'migrations'))
        .filter((f) => f.endsWith('.sql'))
        .map((f) => `packages/${p}/migrations/${f}`)
    )
    .sort();
}

describe('migrations already on main', () => {
  const base = baseCommit();

  it('finds the migrations it is checking, and the commit it checks them against', () => {
    // Without these the comparison below could pass over nothing.
    const files = workingTreeMigrations();
    expect(files.length, 'no migrations found; has packages/*/migrations moved?').toBeGreaterThanOrEqual(3);
    expect(new Set(files.map((f) => f.split('/')[1])).size).toBeGreaterThanOrEqual(3);
    expect(base).toMatch(/^[0-9a-f]{40}$/);
  });

  it('cannot change or disappear', () => {
    // The one exemption, and it can only ever apply once. Before the runner a
    // migration file was re-applied whole at every start and nothing recorded
    // it, so the commit that introduced the runner rewrote each 001 as a clean
    // baseline (G-077). Every base from then on has the runner, and every file
    // it holds is frozen.
    if (!existsAt(base, RUNNER)) {
      expect(fs.existsSync(path.join(root, RUNNER)), 'no runner at the base and none here either').toBe(true);
      return;
    }

    const onMain = git('ls-tree', '-r', '--name-only', base, '--', 'packages')
      .split('\n')
      .filter((f) => MIGRATION.test(f));
    expect(onMain.length, `no migrations at ${base.slice(0, 7)}, which has a runner`).toBeGreaterThan(0);

    const broken = onMain.flatMap((file) => {
      const here = path.join(root, file);
      if (!fs.existsSync(here)) return [`${file} was deleted`];
      const was = checksumOf(git('show', `${base}:${file}`));
      const now = checksumOf(fs.readFileSync(here, 'utf8'));
      return was === now ? [] : [`${file} changed (sha256 ${was.slice(0, 12)}… → ${now.slice(0, 12)}…)`];
    });

    expect(
      broken,
      `An applied migration never changes: databases that ran the text on main (${base.slice(0, 7)}) ` +
        'will refuse to start against the new text. Restore it, and write the change as the next numbered file.'
    ).toEqual([]);
  });
});
