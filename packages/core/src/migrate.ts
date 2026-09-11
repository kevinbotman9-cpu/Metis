/**
 * Schema migrations: numbered files, each applied once, recorded with a checksum.
 *
 * Until 2026-09-11 each store had one file of `CREATE … IF NOT EXISTS`, re-run
 * whole at every start. That statement does nothing to a table that already
 * exists, so an edit inside it changed new databases and never existing ones,
 * and the only way a change reached an existing database was a hand-written
 * conditional block in the same file. The registry needed four of those in a
 * week, one was placed where it could not work (G-076), and nothing recorded
 * which of them a given database had run (G-077).
 *
 * So: `migrations/001_…sql`, `002_…sql` and so on. Each file is applied once,
 * in its own transaction together with the row that records it, under the
 * store's advisory lock. A database says exactly which files it has run and
 * what each contained, and the runner refuses to go on when that record and
 * the files on disk disagree:
 *
 * - **an applied file that has changed** — a change is a new file, never an
 *   edit to history, because history is what existing databases have run;
 * - **an applied file that is missing**, or a gap in the numbering;
 * - **a file with its own `BEGIN` or `COMMIT`**, which would commit half a
 *   migration without the row that records it;
 * - **a database that already has the first migration's objects and no
 *   record** — one built by the pre-G-077 schema. Adopting it would carry its
 *   drift forward (its registry foreign keys still carry their pre-rename
 *   names), and no database of that kind holds data that has to survive.
 *
 * Every refusal happens before anything is applied, and says what to do.
 *
 * The version table is the runner's own and is created with `IF NOT EXISTS` —
 * the one place that is right, because its shape never changes. One per store
 * rather than one shared: the stores can live in one database, and each takes
 * its own lock, so a shared table would be created by two unserialised callers
 * at once.
 *
 * Not tenant data, so the export in `packages/portability` neither carries nor
 * needs it: an import builds a new database through the same runner.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** A pool that can hand out one dedicated connection, which the lock needs. */
export interface Connectable {
  connect(): Promise<{
    query(text: string, values?: unknown[]): Promise<unknown>;
    release(): void;
  }>;
}

export interface Migration {
  version: number;
  /** The file name, e.g. `001_registry.sql`. Recorded with the version. */
  name: string;
  sql: string;
  checksum: string;
}

export type MigrationErrorCode =
  | 'NOT_A_MIGRATION'
  | 'DUPLICATE'
  | 'GAP'
  | 'OWN_TRANSACTION'
  | 'CHANGED'
  | 'MISSING'
  | 'UNVERSIONED'
  | 'FAILED';

export class MigrationError extends Error {
  constructor(
    readonly code: MigrationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

const FILE_NAME = /^(\d{3})_[a-z0-9][a-z0-9_]*\.sql$/;

/**
 * A statement-level transaction command, which a migration must not contain.
 *
 * Anchored to a whole statement — `BEGIN;` — so the `BEGIN` that opens a
 * PL/pgSQL function or `DO` body, which ends its line without a semicolon, is
 * not mistaken for one. `END;` is deliberately absent: it is a synonym for
 * COMMIT at the top level and also how every PL/pgSQL block closes, and a rule
 * that refused every trigger function would be switched off within a week.
 */
const OWN_TRANSACTION = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\s*;/im;

/**
 * The checksum a file is recorded and compared by.
 *
 * Line endings are normalised first. A Windows checkout under
 * `core.autocrlf=true` reads CRLF and CI reads LF, and a checksum that differed
 * between the two would refuse to start a database migrated on one machine from
 * the other. CLAUDE.md, Rule 10.
 */
export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * Every migration in a directory, in order, or a refusal saying what is wrong.
 *
 * Reads the directory and touches no database, so a malformed sequence is
 * refused before a connection is opened.
 */
export function readMigrations(dir: string): Migration[] {
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.toLowerCase().endsWith('.sql'))
    .sort();

  const migrations: Migration[] = [];
  for (const name of names) {
    const match = FILE_NAME.exec(name);
    if (!match) {
      throw new MigrationError(
        'NOT_A_MIGRATION',
        `${path.join(dir, name)} is not named like a migration. Name it NNN_description.sql, ` +
          'three digits and lower-case, so its place in the sequence is unambiguous.'
      );
    }
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    if (OWN_TRANSACTION.test(sql)) {
      throw new MigrationError(
        'OWN_TRANSACTION',
        `${name} contains its own BEGIN, COMMIT or ROLLBACK. The runner applies each file in a ` +
          'transaction together with the row that records it; a file that commits itself would ' +
          'leave a migration applied and unrecorded if anything after it failed.'
      );
    }
    migrations.push({ version: Number(match[1]), name, sql, checksum: checksumOf(sql) });
  }

  for (let i = 0; i < migrations.length; i++) {
    const expected = i + 1;
    const found = migrations[i];
    if (found.version === migrations[i - 1]?.version) {
      throw new MigrationError(
        'DUPLICATE',
        `${migrations[i - 1].name} and ${found.name} both claim version ${found.version}.`
      );
    }
    if (found.version !== expected) {
      throw new MigrationError(
        'GAP',
        `The migrations in ${dir} skip from ${expected - 1} to ${found.version}: ` +
          `${String(expected).padStart(3, '0')}_*.sql is missing. A version that never ran ` +
          'on one database and ran on another would leave them different forever.'
      );
    }
  }

  return migrations;
}

export interface MigrateOptions {
  /** Lower-case store name; the version table is `<component>_schema_migrations`. */
  component: string;
  /** The directory holding `NNN_*.sql`. */
  dir: string;
  /** This store's advisory lock key, distinct from every other store's. */
  lockKey: number;
  /**
   * Stop after this version.
   *
   * For building a database as an earlier release left it, which is how the
   * checks prove that an older database reaches the same schema as a new one.
   */
  to?: number;
}

export interface MigrateResult {
  /** Versions applied by this call, in order. Empty when there was nothing to do. */
  applied: number[];
  /** The highest version this database has run. */
  version: number;
}

interface AppliedRow {
  version: number;
  name: string;
  checksum: string;
  applied_at: Date | string;
}

const isDuplicateObject = (e: unknown) => {
  const code = (e as { code?: string }).code;
  // duplicate_table, duplicate_object (triggers, constraints), duplicate_function.
  return code === '42P07' || code === '42710' || code === '42723';
};

/**
 * Bring a database up to the migrations in `dir`, or refuse and say why.
 *
 * On one connection, because the advisory lock is held by a session and each
 * file's transaction must run on the session that holds it.
 */
export async function migrate(pool: Connectable, options: MigrateOptions): Promise<MigrateResult> {
  const { component, dir, lockKey } = options;
  if (!/^[a-z][a-z0-9_]*$/.test(component)) {
    throw new Error(`'${component}' is not a usable store name; it becomes part of a table name.`);
  }

  const files = readMigrations(dir);
  const target = options.to ?? files.length;
  if (!Number.isInteger(target) || target < 0 || target > files.length) {
    throw new Error(`Cannot migrate ${component} to version ${target}; there are ${files.length}.`);
  }

  const table = `${component}_schema_migrations`;
  const client = await pool.connect();
  const query = async <R>(text: string, values?: unknown[]) =>
    (await client.query(text, values)) as { rows: R[] };

  try {
    await query('SELECT pg_advisory_lock($1)', [lockKey]);
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS ${table} (
           version    integer     PRIMARY KEY,
           name       text        NOT NULL,
           checksum   text        NOT NULL,
           applied_at timestamptz NOT NULL DEFAULT now()
         )`
      );
      const { rows } = await query<AppliedRow>(
        `SELECT version, name, checksum, applied_at FROM ${table} ORDER BY version`
      );

      // Everything this database has run must still be here, unchanged, in
      // order — checked in full before a single statement is applied.
      rows.forEach((row, i) => {
        const file = files[row.version - 1];
        if (row.version !== i + 1 || !file) {
          throw new MigrationError(
            'MISSING',
            `${component}: this database has run ${row.name} (version ${row.version}), and it is ` +
              `not in ${dir}. Either it was deleted — restore it, an applied migration is never ` +
              'removed — or this code is older than the database it is pointed at.'
          );
        }
        if (file.checksum !== row.checksum || file.name !== row.name) {
          const when = new Date(row.applied_at).toISOString();
          throw new MigrationError(
            'CHANGED',
            `${component}: ${file.name} has changed since this database ran it as ${row.name} ` +
              `on ${when} (recorded sha256 ${row.checksum.slice(0, 12)}…, file now ` +
              `${file.checksum.slice(0, 12)}…). An applied migration never changes: databases ` +
              'that ran the old text will not run the new one. Restore it, and write the change ' +
              `as ${String(files.length + 1).padStart(3, '0')}_*.sql.`
          );
        }
      });

      const applied: number[] = [];
      for (const file of files.slice(rows.length, target)) {
        await query('BEGIN');
        try {
          await query(file.sql);
          await query(`INSERT INTO ${table} (version, name, checksum) VALUES ($1, $2, $3)`, [
            file.version,
            file.name,
            file.checksum,
          ]);
          await query('COMMIT');
        } catch (e) {
          await query('ROLLBACK').catch(() => {});
          if (file.version === 1 && isDuplicateObject(e)) {
            const { rows: db } = await query<{ name: string }>('SELECT current_database() AS name');
            throw new MigrationError(
              'UNVERSIONED',
              `${component}: database '${db[0]?.name}' already has objects ${file.name} creates, ` +
                'and no record of running it. It was built by the schema before G-077, which ' +
                're-applied one file at every start and recorded nothing. No database of that kind ' +
                'holds data that has to survive, and adopting one would carry its drift forward, so ' +
                `it is refused rather than adopted. Drop it and let it be recreated: DROP DATABASE ${db[0]?.name};`
            );
          }
          throw new MigrationError(
            'FAILED',
            `${component}: ${file.name} failed and was rolled back; the database is still at ` +
              `version ${file.version - 1}. ${(e as Error).message}`
          );
        }
        applied.push(file.version);
      }

      return { applied, version: Math.max(rows.length, target) };
    } finally {
      await query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => {});
    }
  } finally {
    client.release();
  }
}
