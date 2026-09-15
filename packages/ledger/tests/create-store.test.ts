import { describe, it, expect } from 'vitest';
import { createLedgerStore, dataClassOf, SUBJECT_PROTECTION } from '../src/create-store';
import { InMemoryLedgerStore } from '../src/memory-store';
import { PostgresLedgerStore } from '../src/postgres-store';

/**
 * Choosing a ledger store is a deployment decision, and the two ways it can go
 * wrong both matter more here than for the registry: this is the audit record
 * of what was decided, so silently forgetting it is not a degraded mode.
 */
describe('choosing a ledger store', () => {
  it('runs in memory when no database is configured', async () => {
    const handle = await createLedgerStore({ databaseUrl: undefined });
    expect(handle.kind).toBe('memory');
    expect(handle.store).toBeInstanceOf(InMemoryLedgerStore);
    // The description has to name what is lost, not just what was chosen —
    // including the consequence for idempotency, which is the non-obvious one.
    expect(handle.description).toMatch(/lost on restart/);
    expect(handle.description).toMatch(/retry after a restart/);
    await handle.close();
  });

  it('refuses to start when a configured database is unreachable', async () => {
    // Not a fallback. Starting anyway with storage that forgets would turn a
    // deployment fault into a data-loss incident found days later — and for
    // the ledger, the lost data is the evidence of what the platform decided.
    await expect(
      createLedgerStore({
        databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:1/definitely_not_there',
      })
    ).rejects.toThrow(/not reachable/);
  });

  it('refuses real data in postgres while the subject is stored in clear — ADR-004, G-068', async () => {
    // ADR-016 §4.2. Before any connection: an unreachable URL is enough, so the
    // refusal cannot be skipped by a database that happens to be down.
    const refusal = await createLedgerStore({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:1/definitely_not_there',
      dataClass: 'real',
    }).catch((e: Error) => e);
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toMatch(/ADR-004/);
    expect((refusal as Error).message).toMatch(/G-068/);
    expect((refusal as Error).message).not.toMatch(/not reachable/);
    expect(SUBJECT_PROTECTION).toBe('none');
  });

  it('allows real data in memory, which keeps nothing', async () => {
    const handle = await createLedgerStore({ databaseUrl: undefined, dataClass: 'real' });
    expect(handle.kind).toBe('memory');
    await handle.close();
  });

  it('reads the data class from METIS_DATA_CLASS and refuses a value it does not know', () => {
    expect(dataClassOf(undefined)).toBeUndefined();
    expect(dataClassOf('synthetic')).toBe('synthetic');
    expect(dataClassOf('real')).toBe('real');
    expect(() => dataClassOf('production')).toThrow(/synthetic' or 'real/);
  });

  it('uses postgres when one is configured, and redacts the password', async () => {
    const url =
      process.env.METIS_TEST_DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/metis_registry_test';

    let handle;
    try {
      handle = await createLedgerStore({ databaseUrl: url });
    } catch {
      // No database here; the postgres suite skips for the same reason.
      return;
    }

    expect(handle.kind).toBe('postgres');
    expect(handle.store).toBeInstanceOf(PostgresLedgerStore);
    expect(handle.description).not.toContain('postgres:postgres@');
    expect(handle.description).toContain('***');
    await handle.close();
  });
});
