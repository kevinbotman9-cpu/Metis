import { dataClassOf, type DataClass } from '@metis/ledger';
import { integrationModeOf, type IntegrationMode } from './gateways';

/** What the service is configured with, all from the environment. */
export interface ServiceConfig {
  token: string;
  dataClass: DataClass;
  environment: string;
  port: number;
  integrations: IntegrationMode;
}

/**
 * Read the service's configuration, refusing what a deployment must declare.
 *
 * - `METIS_SERVICE_TOKEN` — required. A service without a credential to check
 *   would answer anyone who can reach its port (G-115).
 * - `METIS_DATA_CLASS` — required, `synthetic` or `real`, with no default
 *   (ADR-016 §4.1). The mistake this prevents is a default of `synthetic` so
 *   that development "just works": the environment that forgets the variable is
 *   the one holding real data.
 * - `METIS_ENVIRONMENT` — `production` by default.
 * - `METIS_INTEGRATIONS` — `live` by default; see `gateways.ts`.
 * - `PORT` — 8080 by default.
 *
 * `METIS_DATABASE_URL` is read by the store factories themselves, and the
 * ledger's factory refuses `real` data in PostgreSQL while the subject is
 * stored in clear (ADR-016 §4.2).
 */
export function configFrom(env: Record<string, string | undefined>): ServiceConfig {
  const token = env.METIS_SERVICE_TOKEN;
  if (!token) {
    throw new ConfigRefused('METIS_SERVICE_TOKEN is not set. The decision service refuses to start without a credential to check.');
  }
  const dataClass = dataClassOf(env.METIS_DATA_CLASS);
  if (!dataClass) {
    throw new ConfigRefused(
      "METIS_DATA_CLASS is not set. Declare 'synthetic' or 'real' (ADR-016 §4.1); there is no default, " +
        'because the deployment that forgets it is the one holding real data.'
    );
  }
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigRefused(`PORT must be a port number, not '${env.PORT}'.`);
  }
  return {
    token,
    dataClass,
    environment: env.METIS_ENVIRONMENT || 'production',
    port,
    integrations: integrationModeOf(env.METIS_INTEGRATIONS),
  };
}

export class ConfigRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigRefused';
  }
}
