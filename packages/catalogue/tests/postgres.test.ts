import { it, expect, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PostgresCatalogueStore } from '../src/postgres-store';
import { runMigration } from '../src/create-store';
import { Catalogue } from '../src/catalogue';
import { describeCatalogue, objective, category, offer } from './suite';

/**
 * The same behaviour suite, against a real PostgreSQL.
 *
 * Real, not a fake: the point of durable storage is the things a fake cannot
 * have — a jsonb round trip that can lose a nested field, foreign keys that
 * refuse an offer in a category nobody created, and a trigger that rejects an
 * UPDATE to the edit log whatever the application intended.
 *
 * Skipped rather than failed when no database is reachable, so a developer
 * without one can still run the rest. CI runs a postgres service, so the skip
 * does not become the normal case.
 */

const URL =
  process.env.METIS_TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/metis_registry_test';

const pool = new Pool({ connectionString: URL, max: 4 });

let reachable = false;
try {
  const probe = await pool.query('select 1');
  reachable = probe.rowCount === 1;
} catch {
  reachable = false;
}

const T = 'telco-uk';
const AT = '2026-06-01T12:00:00.000Z';

if (!reachable) {
  it.skip(`postgres at ${URL.replace(/:[^:@]*@/, ':***@')} is not reachable`, () => {});
} else {
  await runMigration(pool);

  const truncate = () =>
    pool.query(
      `TRUNCATE catalogue_events, catalogue_arbitration, catalogue_boosts,
                catalogue_frequency_policies, catalogue_targeting_policies,
                catalogue_creatives, catalogue_offers, catalogue_categories,
                catalogue_objectives
       RESTART IDENTITY CASCADE`
    );

  describeCatalogue('catalogue over postgres', {
    async create() {
      // Truncate rather than delete: the trigger rejects DELETE on the event
      // log row by row, and TRUNCATE is the statement-level operation that
      // gets past it.
      await truncate();
      return new PostgresCatalogueStore(pool);
    },
  });

  // The pool closes at file scope, not in the harness. The harness's afterAll
  // runs when its describe finishes, which is before the assertions below.
  afterAll(async () => {
    await pool.end();
  });

  // --- What only the schema can enforce ------------------------------------

  it('the database refuses an orphan offer even when the application does not', async () => {
    await truncate();
    // Straight to the store, bypassing `Catalogue`'s check. This is the race an
    // application check cannot close: a category deleted between the check and
    // the write. The foreign key is the only thing that can be sure.
    const store = new PostgresCatalogueStore(pool);
    await expect(store.putOffer(T, offer({ categoryId: 'cat_never' }))).rejects.toThrow(
      /violates foreign key constraint/i
    );
  });

  it('the database refuses two offers sharing a key, whatever the caller checked', async () => {
    await truncate();
    const store = new PostgresCatalogueStore(pool);
    await store.putObjective(T, objective());
    await store.putCategory(T, category());
    await store.putOffer(T, offer());
    await expect(store.putOffer(T, offer({ id: 'off_second' }))).rejects.toThrow(
      /duplicate key value|unique constraint/i
    );
  });

  it('the edit log rejects UPDATE and DELETE at the schema', async () => {
    await truncate();
    const catalogue = new Catalogue(new PostgresCatalogueStore(pool));
    await catalogue.putObjective(T, objective(), 'sarah', AT);

    // The application refusing to rewrite history is not enough on its own:
    // anything holding the connection string could, and "the code does not do
    // that" is not an answer to an auditor.
    await expect(
      pool.query("UPDATE catalogue_events SET actor = 'someone else'")
    ).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM catalogue_events')).rejects.toThrow(/append-only/);
  });

  it('survives a restart, which is the whole reason this exists', async () => {
    await truncate();
    const first = new Catalogue(new PostgresCatalogueStore(pool));
    await first.putObjective(T, objective(), 'sarah', AT);
    await first.putCategory(T, category(), 'sarah', AT);
    await first.putOffer(T, offer({ boost: 1.9 }), 'sarah', AT);

    // A different store instance over the same database is what a restarted
    // process gets. The in-memory implementation loses everything here, which
    // is the correctness problem this package was built to fix.
    const afterRestart = new Catalogue(new PostgresCatalogueStore(pool));
    const snapshot = await afterRestart.read(T);
    expect(snapshot.offers).toHaveLength(1);
    expect(snapshot.offers[0].boost).toBe(1.9);
  });
}
