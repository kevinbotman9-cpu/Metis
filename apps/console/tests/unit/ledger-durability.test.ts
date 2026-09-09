import { describe, it, expect, afterEach } from 'vitest';
import { createLedgerStore, InMemoryLedgerStore } from '@metis/ledger';

/**
 * Which store the console's ledger resolves to — ADR-008 phase three.
 *
 * Outcomes were durable in `packages/ledger` and reachable from no screen: the
 * PostgreSQL store had migrations, a behaviour suite and dual implementations,
 * and the only non-test caller in the repository was
 * `packages/portability/src/cli.ts`. The console kept its own in-memory store
 * and every outcome recorded through it was lost on restart.
 *
 * The change is a swap, not a rewrite, and this is what holds the swap honest.
 * The behaviour of the two stores is already covered by one suite run against
 * both in `packages/ledger`; there is no value in asserting that again here.
 * What is worth asserting is the **selection** — that the default is the lossy
 * one, that a configured database is used, and above all that a configured
 * database which cannot be reached is an error rather than a quiet downgrade.
 *
 * That last rule is the one worth a test. A silent fall back to memory turns a
 * deployment fault into a data-loss incident discovered days later, and for the
 * decision ledger it means losing the audit record of what was decided.
 */

const ORIGINAL = process.env.METIS_DATABASE_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.METIS_DATABASE_URL;
  else process.env.METIS_DATABASE_URL = ORIGINAL;
});

describe('choosing the console ledger store', () => {
  it('defaults to memory, and says what that costs', async () => {
    delete process.env.METIS_DATABASE_URL;
    const handle = await createLedgerStore();
    expect(handle.kind).toBe('memory');
    expect(handle.store).toBeInstanceOf(InMemoryLedgerStore);
    // The description is not decoration: it is what gets printed at startup,
    // and a console that forgets should say so rather than look durable.
    expect(handle.description).toMatch(/lost on restart/);
    await handle.close();
  });

  it('refuses a configured database it cannot reach, rather than forgetting quietly', async () => {
    // Port 1 is reserved and nothing listens on it. The assertion is that this
    // *throws* — the failure mode being prevented is the one where it returns
    // an in-memory store, the console starts, looks healthy, and loses every
    // decision it records.
    process.env.METIS_DATABASE_URL = 'postgres://metis:metis@127.0.0.1:1/metis';
    await expect(createLedgerStore()).rejects.toThrow(/not reachable/);
  });

  it('does not put the credential in the error it throws', async () => {
    // The error is logged at startup and read by whoever is on call.
    process.env.METIS_DATABASE_URL = 'postgres://metis:hunter2@127.0.0.1:1/metis';
    await expect(createLedgerStore()).rejects.toThrow();
    const error = await createLedgerStore().catch((e: Error) => e);
    expect((error as Error).message).not.toContain('hunter2');
  });

  it('is the same interface either way, so the console cannot tell them apart', async () => {
    // The console holds a `DecisionLedger`, never a store. That is what makes
    // this a deployment choice rather than a behavioural one, and it is why
    // `packages/ledger`'s single behaviour suite covers both.
    delete process.env.METIS_DATABASE_URL;
    const handle = await createLedgerStore();
    for (const method of ['get', 'put', 'query', 'appendOutcome', 'outcomesFor']) {
      expect(typeof (handle.store as unknown as Record<string, unknown>)[method]).toBe('function');
    }
    await handle.close();
  });
});
