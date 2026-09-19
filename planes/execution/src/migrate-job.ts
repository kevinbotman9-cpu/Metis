import { runMigration as catalogue } from '@metis/catalogue';
import { runMigration as governance } from '@metis/governance';
import { runMigration as keys } from '@metis/keys';
import { runMigration as ledger } from '@metis/ledger';
import { runMigration as registry } from '@metis/registry';
import { MigrationError, type Connectable, type MigrateResult } from '@metis/core/migrate';

/**
 * The migration job. ADR-016 §3.2.
 *
 * A one-shot command in the decision service's image, run once per environment
 * before either service rolls:
 *
 *   docker run --rm -e METIS_DATABASE_URL=… <image> node --import tsx src/migrate-job.ts
 *
 * It brings every store's schema up to this release and exits 0, or stops at
 * the first store the runner refuses and exits 1. Its output is the runner's
 * own sentences, one line per store, written to be attached to the deployment
 * record — the operator's only view, because nobody logs in.
 *
 * **It never acts on a refusal's advice** (§3.5). There is no repair flag, no
 * checksum rewrite and no drop: a flag that turned a stopped deploy into a
 * running one would turn it into silent drift between environments, which is
 * what G-077 was. A refusal stops the job, and the job's exit stops the rollout.
 */

type Store = { name: string; run: (pool: Connectable) => Promise<MigrateResult> };

/** Every store, in a fixed order, so two runs of the job read the same. */
export const STORES: readonly Store[] = [
  { name: 'catalogue', run: (pool) => catalogue(pool) },
  { name: 'governance', run: (pool) => governance(pool) },
  { name: 'keys', run: (pool) => keys(pool) },
  { name: 'ledger', run: (pool) => ledger(pool) },
  { name: 'registry', run: (pool) => registry(pool) },
];

export interface JobResult {
  ok: boolean;
  lines: string[];
}

/** Run every store's migrations against one pool; never throws for a refusal. */
export async function runJob(pool: Connectable, stores: readonly Store[] = STORES): Promise<JobResult> {
  const lines: string[] = [];
  for (const store of stores) {
    try {
      const { applied, version } = await store.run(pool);
      lines.push(
        applied.length === 0
          ? `${store.name}: at version ${version}; nothing to apply`
          : `${store.name}: applied ${applied.join(', ')}; now at version ${version}`
      );
    } catch (e) {
      const code = e instanceof MigrationError ? e.code : 'ERROR';
      lines.push(`${store.name}: REFUSED (${code}) ${(e as Error).message}`);
      lines.push(
        'The job has stopped and applied nothing further. Nothing here drops a database, rewrites a ' +
          'recorded checksum or skips a file; resolve the refusal by hand, on the database it names.'
      );
      return { ok: false, lines };
    }
  }
  return { ok: true, lines };
}

async function main(): Promise<void> {
  const url = process.env.METIS_DATABASE_URL;
  if (!url) {
    console.error('METIS_DATABASE_URL is not set. The migration job has nothing to migrate, and memory has no schema.');
    process.exit(1);
  }
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query('select 1');
  } catch (e) {
    console.error(`METIS_DATABASE_URL is set but the database is not reachable: ${(e as Error).message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  }
  const result = await runJob(pool as unknown as Connectable);
  for (const line of result.lines) (result.ok ? console.log : console.error)(line);
  await pool.end();
  process.exit(result.ok ? 0 : 1);
}

// Run when invoked, not when imported by its tests.
if (process.argv[1] && /migrate-job\.ts$/.test(process.argv[1])) {
  void main();
}
