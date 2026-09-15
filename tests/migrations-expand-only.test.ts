import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A migration may add, and never remove or tighten. ADR-016 §3.3.
 *
 * A rolling deploy runs release N−1 against schema N for minutes, and a code
 * rollback runs it for as long as the rollback lasts, so every migration has to
 * be safe for the code before it. A file that drops or renames something N−1
 * reads, or tightens a constraint N−1 writes against, breaks the one rollback
 * ADR-016 allows: the previous image against the expanded schema. Removal is a
 * later migration, one release after nothing reads the column.
 *
 * Checked on the files this branch adds — the frozen-file check already stops
 * an applied one changing — against where the branch left main, the same base
 * `migrations-frozen.test.ts` uses. It reads SQL rather than running it, so it
 * catches the statement, not the effect; a migration that needs to do one of
 * these things is a conversation, not an exemption in this file.
 */

const root = path.resolve(__dirname, '..');
const MIGRATION = /^packages\/[^/]+\/migrations\/[^/]+\.sql$/;

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function baseCommit(): string {
  const named = process.env.METIS_MIGRATIONS_BASE;
  try {
    return git('rev-parse', '--verify', `${named ?? git('merge-base', 'HEAD', 'origin/main').trim()}^{commit}`).trim();
  } catch (e) {
    throw new Error(
      `Cannot find the commit to compare migrations against. Fetch origin/main; in CI the checkout needs fetch-depth: 0. ${(e as Error).message}`
    );
  }
}

/** Statements that remove something, or tighten what the release before relies on. */
export const NOT_EXPAND_ONLY: { name: string; pattern: RegExp }[] = [
  { name: 'DROP (a table, column, index, constraint, function, trigger or type)', pattern: /\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT|FUNCTION|TRIGGER|TYPE|VIEW|SCHEMA)\b/i },
  { name: 'RENAME', pattern: /\bRENAME\b/i },
  { name: 'SET NOT NULL on an existing column', pattern: /\bALTER\s+COLUMN\s+\w+\s+SET\s+NOT\s+NULL\b/i },
  { name: 'a column type change', pattern: /\bALTER\s+COLUMN\s+\w+\s+(SET\s+DATA\s+)?TYPE\b/i },
  { name: 'a constraint added to an existing table', pattern: /\bALTER\s+TABLE\b[^;]*\bADD\s+(CONSTRAINT|CHECK|UNIQUE|FOREIGN\s+KEY|PRIMARY\s+KEY)\b/i },
  { name: 'a column added NOT NULL without a default', pattern: /\bADD\s+COLUMN\s+\w+\s+[\w() ,]+?\bNOT\s+NULL\b(?![^;,]*\bDEFAULT\b)/i },
  { name: 'DELETE, UPDATE or TRUNCATE of existing rows', pattern: /^\s*(DELETE\s+FROM|UPDATE\s+\w+\s+SET|TRUNCATE)\b/im },
];

/** What a migration's SQL does that §3.3 forbids, comments removed first. */
export function expandOnlyProblems(sql: string): string[] {
  const code = sql.replace(/\r\n/g, '\n').replace(/--.*$/gm, '');
  return NOT_EXPAND_ONLY.filter((rule) => rule.pattern.test(code)).map((rule) => rule.name);
}

function addedMigrations(base: string): string[] {
  const packages = path.join(root, 'packages');
  const files = fs
    .readdirSync(packages)
    .flatMap((pkg) => {
      const dir = path.join(packages, pkg, 'migrations');
      return fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => `packages/${pkg}/migrations/${f}`) : [];
    })
    .filter((f) => MIGRATION.test(f));
  return files.filter((f) => {
    try {
      git('cat-file', '-e', `${base}:${f}`);
      return false;
    } catch {
      return true;
    }
  });
}

describe('every migration is expand-only against the release before it', () => {
  it('recognises what it is looking for', () => {
    // Without this, a pattern that matched nothing would pass every new file.
    expect(expandOnlyProblems('ALTER TABLE a DROP COLUMN b;')).toContain(NOT_EXPAND_ONLY[0].name);
    expect(expandOnlyProblems('ALTER TABLE a RENAME COLUMN b TO c;')).toContain('RENAME');
    expect(expandOnlyProblems('ALTER TABLE a ALTER COLUMN b SET NOT NULL;')).toContain('SET NOT NULL on an existing column');
    expect(expandOnlyProblems('ALTER TABLE a ADD CONSTRAINT c CHECK (b > 0);')).toContain('a constraint added to an existing table');
    expect(expandOnlyProblems('ALTER TABLE a ADD COLUMN b text NOT NULL;')).toContain('a column added NOT NULL without a default');
  });

  it('allows what expanding looks like', () => {
    expect(
      expandOnlyProblems(
        [
          'CREATE TABLE t (id text PRIMARY KEY, n int NOT NULL, CONSTRAINT t_n CHECK (n > 0));',
          "ALTER TABLE a ADD COLUMN b text NOT NULL DEFAULT 'none';",
          'ALTER TABLE a ADD COLUMN c text;',
          'CREATE INDEX a_by_b ON a (b);',
          '-- a comment that says DROP COLUMN is not a statement',
          'CREATE TRIGGER x BEFORE UPDATE OR DELETE ON t FOR EACH ROW EXECUTE FUNCTION f();',
        ].join('\n')
      )
    ).toEqual([]);
  });

  it('holds for every migration this branch adds', () => {
    const base = baseCommit();
    const problems = addedMigrations(base).flatMap((f) =>
      expandOnlyProblems(fs.readFileSync(path.join(root, f), 'utf8')).map((p) => `${f}: ${p}`)
    );
    expect(
      problems,
      'A migration may add and never remove or tighten (ADR-016 §3.3). Split the removal into a later migration, one release after nothing reads it.'
    ).toEqual([]);
  });
});
