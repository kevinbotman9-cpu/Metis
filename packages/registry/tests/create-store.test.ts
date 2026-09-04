import { describe, it, expect } from 'vitest';
import { createRegistryStore } from '../src/create-store';
import { InMemoryRegistryStore } from '../src/memory-store';
import { PostgresRegistryStore } from '../src/postgres-store';

/**
 * Choosing a store is a deployment decision, and the two ways it can go wrong
 * are both worth a test: silently forgetting when a database was expected, and
 * demanding one when none was configured.
 */
describe('choosing a store', () => {
  it('runs in memory when no database is configured', async () => {
    const handle = await createRegistryStore({ databaseUrl: undefined });
    expect(handle.kind).toBe('memory');
    expect(handle.store).toBeInstanceOf(InMemoryRegistryStore);
    // The description has to say what was lost, not just what was chosen.
    expect(handle.description).toMatch(/lost on restart/);
    await handle.close();
  });

  it('refuses to start when a configured database is unreachable', async () => {
    // Not a fallback. Starting anyway with storage that forgets would turn a
    // deployment fault into a data-loss incident found days later.
    await expect(
      createRegistryStore({
        databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:1/definitely_not_there',
      })
    ).rejects.toThrow(/not reachable/);
  });

  it('uses postgres when one is configured, and redacts the password', async () => {
    const url =
      process.env.METIS_TEST_DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/metis_registry_test';

    let handle;
    try {
      handle = await createRegistryStore({ databaseUrl: url });
    } catch {
      // No database here; the postgres suite skips for the same reason.
      return;
    }

    expect(handle.kind).toBe('postgres');
    expect(handle.store).toBeInstanceOf(PostgresRegistryStore);
    expect(handle.description).not.toContain('postgres:postgres@');
    expect(handle.description).toContain('***');
    await handle.close();
  });
});
