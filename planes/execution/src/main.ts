import { createCatalogueStore } from '@metis/catalogue';
import { createLedgerStore, DecisionLedger } from '@metis/ledger';
import { ArtifactRegistry, createRegistryStore } from '@metis/registry';
import { gatewayFor } from './gateways';
import { configFrom, ConfigRefused } from './config';
import { createService } from './server';
import { loadTenants, type LoadResult } from './state';

/**
 * The decision service's entry point. ADR-016 §1.
 *
 * Configuration is the environment and nothing else:
 *
 * - `METIS_SERVICE_TOKEN` — required. There is no default: a service that
 *   started without one would answer anybody who can reach its port (G-115).
 * - `METIS_DATABASE_URL` — the stores. Without it they run in memory, which the
 *   store factories already say loudly; an image in an environment sets it.
 * - `METIS_ENVIRONMENT` — which environment's active artifacts to serve;
 *   `production` by default.
 * - `METIS_INTEGRATIONS` — `live` (the default) or `caller-only`; see
 *   `gateways.ts`. `/health` reports which.
 * - `PORT` — 8080 by default.
 */
async function main(): Promise<void> {
  let config;
  try {
    config = configFrom(process.env);
  } catch (e) {
    if (e instanceof ConfigRefused) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
  const { token, dataClass, environment, port, integrations } = config;

  const [catalogue, registry, ledger] = await Promise.all([
    createCatalogueStore(),
    createRegistryStore(),
    // The factory refuses real data in PostgreSQL while the subject is stored
    // in clear (ADR-016 §4.2); the data class is passed rather than re-read.
    createLedgerStore({ dataClass }),
  ]);

  let loaded: LoadResult | null = null;
  const server = createService({
    token,
    loaded: () => loaded,
    ledger: new DecisionLedger(ledger.store),
    gateway: gatewayFor(integrations),
    integrations,
    dataClass,
    now: () => new Date().toISOString(),
  });

  // Listening before loading, so a probe gets a 503 that says "loading" rather
  // than a refused connection that says nothing.
  server.listen(port, () => console.log(`decision service listening on ${port}`));

  loaded = await loadTenants({
    catalogueStore: catalogue.store,
    registry: new ArtifactRegistry(registry.store),
    environment,
  });
  const served = [...loaded.tenants.values()]
    .map((t) => `${t.tenantId} (${t.artifacts.size} flow(s))`)
    .join(', ');
  console.log(`loaded ${served || 'no tenants'}${loaded.refused.length ? `; refused ${loaded.refused.map((r) => `${r.tenantId}: ${r.reason}`).join('; ')}` : ''}`);

  const stop = async () => {
    server.close();
    await Promise.all([catalogue.close(), registry.close(), ledger.close()]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
}

void main().catch((e: unknown) => {
  console.error(`decision service failed to start: ${(e as Error).message}`);
  process.exit(1);
});
