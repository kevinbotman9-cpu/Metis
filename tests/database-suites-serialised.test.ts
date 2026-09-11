import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Every package whose tests open a PostgreSQL connection runs its files one at
 * a time.
 *
 * G-078. The database files in a package share one server: one migrates the
 * shared test database, one truncates it between cases, one creates and drops
 * databases beside it. Vitest runs a package's files in parallel by default,
 * and in parallel they take each other's locks — a `40P01` in CI, on
 * `TRUNCATE` against a concurrent migration, reproduced as 4 deadlocks in 200
 * rounds. It failed in whichever package lost the race, so each time it looked
 * like a different package's fault.
 *
 * `fileParallelism: false` in the package's config removes the concurrency for
 * every file there, including ones added later. This check is for the case
 * that setting cannot cover: a package that starts talking to the database
 * without anybody remembering to set it.
 */

const root = path.resolve(__dirname, '..');
const packagesDir = path.join(root, 'packages');

/** Read as text with line endings normalised once, here (CLAUDE.md, Rule 10). */
const read = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function testFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return testFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Packages whose tests import the PostgreSQL driver, statically or not. */
function databasePackages(): string[] {
  return fs
    .readdirSync(packagesDir)
    .filter((p) =>
      testFiles(path.join(packagesDir, p, 'tests')).some((f) =>
        /from\s+['"]pg['"]|import\(\s*['"]pg['"]\s*\)/.test(read(f))
      )
    )
    .sort();
}

/** The config's statements, comments stripped, so a commented-out setting does not count. */
function serialises(pkg: string): boolean {
  const config = path.join(packagesDir, pkg, 'vitest.config.ts');
  if (!fs.existsSync(config)) return false;
  const code = read(config)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return /\bfileParallelism\s*:\s*false\b/.test(code);
}

describe('database test suites', () => {
  it('finds the packages that talk to the database', () => {
    // A floor, so a moved tests directory cannot make the check below pass
    // over nothing. Registry, ledger, catalogue and core, today.
    expect(databasePackages().length).toBeGreaterThanOrEqual(4);
  });

  it('run their files one at a time', () => {
    const parallel = databasePackages().filter((p) => !serialises(p));
    expect(
      parallel,
      'These packages open PostgreSQL connections from their tests and let Vitest run their files ' +
        'in parallel, where they take each other\'s locks (G-078). Add `fileParallelism: false` to ' +
        'the `test` block of each one\'s vitest.config.ts.'
    ).toEqual([]);
  });
});
