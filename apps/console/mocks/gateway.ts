/**
 * The integration gateway the development API uses.
 *
 * `resolveInputs` names three implementations of one shape — "the dev store, a
 * production HTTP client and a recorded-fixture player". This is the third.
 * `HttpIntegrationGateway` in `@metis/runtime` is the second, and it is what
 * runs when `METIS_INTEGRATIONS=live` is set; it is not the default here
 * because the fixture connectors point at `bureau.example` and
 * `consent.telco.example`, which do not exist, and two of them are configured
 * `onFailure: 'fail'`. Pointing the dev console at them would mean every
 * decision fails on a DNS lookup.
 *
 * Recorded, not invented: the values are derived from the connector's own
 * declared bindings, written at the paths the connector says its payload uses,
 * and seeded so the same customer gets the same answer on every call. That last
 * property is what makes a replay of a locally-made decision meaningful.
 *
 * Per CLAUDE.md, fixture data lives here rather than in any component or route.
 */

import { seededUnitInterval } from '@metis/runtime/deterministic/canonical';
import type { Connector, FieldBinding } from '@metis/core/domain';
import type { IntegrationGateway, ResolutionContext } from '@metis/runtime';

/**
 * Plausible ranges for the fields the fixture connectors declare.
 *
 * A credit score of 0.4 would pass every type check and make every policy that
 * reads it meaningless, so the fields the demo tenant actually decides on get
 * ranges. Anything else falls back to the generic shape below, which is correct
 * but not lifelike — and a connector whose fields are not here is one no fixture
 * flow reads.
 */
const RANGES: Record<string, [number, number]> = {
  monthlySpend: [1200, 10200],
  arrearsDays: [0, 60],
  dataUsageGb: [0, 120],
  roamingDays: [0, 14],
  tenureMonths: [0, 72],
  creditScore: [380, 820],
  stockLevel: [0, 400],
};

/** Write a value at a dotted path, creating the objects on the way. */
function writePath(payload: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = payload;
  for (const segment of segments.slice(0, -1)) {
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

function recordedValue(connector: Connector, binding: FieldBinding, customerId: string): unknown {
  const r = seededUnitInterval('recorded', connector.id, binding.field, customerId);

  switch (binding.type) {
    case 'number': {
      const [lo, hi] = RANGES[binding.field] ?? [0, 1000];
      const value = lo + r * (hi - lo);
      // Whole numbers unless the range is small enough that rounding would
      // collapse it — 0.0 to 1.0 in integers is two values, not a range.
      return hi - lo > 20 ? Math.floor(value) : Number(value.toFixed(2));
    }
    // Consent-shaped fields are true far more often than not; a fixture where
    // one customer in two has refused marketing would suppress half the
    // decisions in the console for reasons that are not about the flows.
    case 'boolean':
      return r > 0.12;
    case 'string':
      return `${binding.field}_${Math.floor(r * 1000)}`;
  }
}

export class RecordedIntegrationGateway implements IntegrationGateway {
  /**
   * No cache, deliberately.
   *
   * A recorded read costs nothing, so caching it would only make `cacheHit`
   * say something about this file rather than about a real integration.
   */
  async fetch(connector: Connector, context: ResolutionContext): Promise<unknown> {
    const payload: Record<string, unknown> = {};
    for (const binding of connector.provides) {
      // A static connector's values are its declared defaults, in development
      // exactly as in production — there is nothing to record.
      const value =
        connector.kind === 'static'
          ? binding.defaultValue
          : recordedValue(connector, binding, context.customerId);
      if (value !== undefined) writePath(payload, binding.path, value);
    }
    return payload;
  }
}
