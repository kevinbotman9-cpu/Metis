import type { Connector, FieldBinding } from '@metis/core/domain';
import type { IntegrationGateway } from '@metis/runtime';

/**
 * A gateway whose every answer is wrong.
 *
 * `resolveInputs` calls every connector a flow declares, and a field the caller
 * already sent wins over what the connector returned. The service cases carry
 * every connector field, so a service that lets the request win reproduces
 * their chain hashes whatever the connectors say — and a case that did not
 * carry a field, or a service that let a connector overwrite the caller, would
 * take one of these values into the hashed input and diverge, naming the
 * decision.
 */
export const wrongAnswers: IntegrationGateway = {
  async fetch(connector: Connector) {
    const payload: Record<string, unknown> = {};
    for (const binding of connector.provides) write(payload, binding.path, wrong(binding));
    return payload;
  },
};

function wrong(binding: FieldBinding): unknown {
  switch (binding.type) {
    case 'number':
      return 987654;
    case 'boolean':
      return binding.defaultValue === true ? false : true;
    default:
      return 'not-what-the-caller-sent';
  }
}

function write(payload: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = payload;
  for (const segment of segments.slice(0, -1)) {
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

/** A response body, read as the loose JSON it is. */
export type Json = Record<string, unknown> & {
  decision?: { winner?: string | null; inputSnapshotHash?: string; catalogueSnapshotHash?: string };
};

export async function json(res: Response): Promise<Json> {
  return (await res.json()) as Json;
}
