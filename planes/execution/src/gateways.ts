import type { Connector } from '@metis/core/domain';
import { HttpIntegrationGateway, MemoryIntegrationCache, type IntegrationGateway } from '@metis/runtime';

/**
 * Which integration gateway the service resolves connectors through.
 *
 * - `live` — `HttpIntegrationGateway`: connectors are called. The default, and
 *   the only mode for serving customers.
 * - `caller-only` — every connector answers with nothing, so a decision is made
 *   from the fields the caller sent and nothing else. For conformance runs
 *   against a catalogue whose connectors point at hosts that do not exist, as
 *   the console fixtures' do; the console has the same switch
 *   (`METIS_INTEGRATIONS`). `/health` reports the mode, so a deployment running
 *   it cannot pass for a live one.
 *
 * Why not point the fixture connectors somewhere that answers: the connectors
 * are part of the catalogue snapshot, and a changed target is a changed
 * catalogue hash on every decision.
 */
export type IntegrationMode = 'live' | 'caller-only';

export function integrationModeOf(value: string | undefined): IntegrationMode {
  if (value === undefined || value === '' || value === 'live') return 'live';
  if (value === 'caller-only') return 'caller-only';
  throw new Error(`METIS_INTEGRATIONS must be 'live' or 'caller-only', not '${value}'.`);
}

/** Answers every connector with an empty payload: no value, and no failure. */
export class CallerOnlyGateway implements IntegrationGateway {
  async fetch(_connector: Connector): Promise<unknown> {
    return {};
  }
}

export function gatewayFor(mode: IntegrationMode): IntegrationGateway {
  return mode === 'live'
    ? // One cache for the life of the process, so `cacheTtlSeconds` means something.
      new HttpIntegrationGateway({ cache: new MemoryIntegrationCache() })
    : new CallerOnlyGateway();
}
