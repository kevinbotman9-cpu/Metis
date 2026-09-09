/**
 * The gateway that actually reaches a network.
 *
 * `resolveInputs` has always been able to fetch; it had nothing to fetch with.
 * `IntegrationGateway` was an interface implemented only by test doubles, so a
 * connector could be configured, shown in the console, named by a flow and
 * counted in the compiler's latency budget without any code existing that could
 * call it. This is that code.
 *
 * **Where the boundary sits.** This file does I/O and therefore lives outside
 * the deterministic core, on the far side of the line `tests/no-egress.test.ts`
 * guards: `execute` and `replay` reach no network, and nothing here is imported
 * by either. Resolution runs first, its output is hashed into the input
 * snapshot, and replay reads the snapshot rather than calling any of this again.
 *
 * **What it cannot do.** It sends no credentials, because `Connector` has no
 * field in which to name one. That is ADR-007, which is Proposed and not
 * Accepted, and inventing a credential field here to get a demo working would
 * put a secret into an append-only audit log and every export made from it. So
 * this is useful against internal and unauthenticated endpoints and useless
 * against a credit bureau, and the gap is registered rather than worked around.
 */

import type { Connector } from '@metis/core/domain';
import { IntegrationError } from './resolve';
import type { IntegrationCache, IntegrationGateway, ResolutionContext } from './resolve';

export interface HttpGatewayOptions {
  /**
   * Injected for tests. Defaults to the platform `fetch`.
   *
   * Typed loosely on purpose: the gateway uses status, headers and json(), and
   * pinning the full DOM lib into a Node package to say so is not worth it.
   */
  fetchImpl?: typeof globalThis.fetch;
  /** Shared across connectors; each entry expires on its connector's TTL. */
  cache?: IntegrationCache;
}

/**
 * An in-memory cache with per-entry expiry.
 *
 * Process-local and deliberately so: a shared cache would make one tenant's
 * latency depend on another's traffic, and the values here are customer data
 * with a TTL measured in minutes. `SourceCall.cacheHit` records which reads came
 * from here, and that field is measured, never hashed — a decision must not
 * depend on whether it was lucky with the cache.
 */
export class MemoryIntegrationCache implements IntegrationCache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  get(key: string): unknown | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: unknown, ttlSeconds: number): void {
    if (ttlSeconds <= 0) return;
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  /** Test and operations affordance; resolution never calls it. */
  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Build the payload a `static` connector supplies.
 *
 * `target` is empty for this kind, so the values are the ones declared on the
 * bindings themselves. It exists for the case where a field is a constant the
 * platform does not hold — a tenant's regulatory regime, a flag during a
 * migration — and making it a connector rather than a special case means the
 * trace says where the value came from in the same way as every other field.
 */
function staticPayload(connector: Connector): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const binding of connector.provides) {
    if (binding.defaultValue === undefined) continue;
    // Write it at the declared path so the same reader handles every kind.
    const segments = binding.path.split('.');
    let cursor = payload;
    for (const segment of segments.slice(0, -1)) {
      if (typeof cursor[segment] !== 'object' || cursor[segment] === null) cursor[segment] = {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]] = binding.defaultValue;
  }
  return payload;
}

export class HttpIntegrationGateway implements IntegrationGateway {
  readonly cache?: IntegrationCache;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: HttpGatewayOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.cache = options.cache;
  }

  async fetch(connector: Connector, context: ResolutionContext): Promise<unknown> {
    switch (connector.kind) {
      case 'static':
        return staticPayload(connector);

      case 'feature-store':
        // Named rather than attempted. There is no feature service (W-009), so
        // the honest failure is "this is not built", not a connection refused
        // to a `featurestore://` URL that was never going to resolve.
        throw new IntegrationError(
          connector.id,
          'error',
          `Connector "${connector.id}" is kind feature-store and there is no feature service to read (W-009). Configure it as \`rest\` against a service that exists, or deactivate it.`
        );

      case 'rest':
        return this.fetchRest(connector, context);

      default: {
        // Unreachable while `kind` is the closed set the spec declares; here so
        // that widening the enum without widening this is a type error.
        const unreachable: never = connector.kind;
        throw new IntegrationError(
          connector.id,
          'error',
          `Unknown connector kind ${String(unreachable)}`
        );
      }
    }
  }

  private async fetchRest(connector: Connector, context: ResolutionContext): Promise<unknown> {
    if (!/^https?:\/\//.test(connector.target)) {
      throw new IntegrationError(
        connector.id,
        'error',
        `Connector "${connector.id}" declares target "${connector.target}", which is not an http(s) URL`
      );
    }

    // POST, and the context in the body rather than the query string. A
    // customer reference in a URL is a customer reference in every proxy log,
    // access log and browser history between here and the endpoint; in a body
    // it is only where it was sent.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), connector.timeoutMs);

    try {
      const response = await this.fetchImpl(connector.target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          tenantId: context.tenantId,
          customerId: context.customerId,
          channel: context.channel,
          occurredAt: context.occurredAt,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new IntegrationError(
          connector.id,
          'error',
          `${connector.id} answered HTTP ${response.status}`
        );
      }

      try {
        return await response.json();
      } catch {
        // A 200 of HTML is the shape an authentication redirect or a captive
        // proxy takes. Saying "not JSON" is more use than a parse error.
        throw new IntegrationError(
          connector.id,
          'error',
          `${connector.id} answered HTTP ${response.status} with a body that is not JSON`
        );
      }
    } catch (e) {
      if (e instanceof IntegrationError) throw e;
      // `resolveInputs` races its own timeout too, and normally wins the race.
      // This one exists so the socket is actually closed rather than left to
      // finish into a promise nobody is waiting on.
      if ((e as Error).name === 'AbortError') {
        throw new IntegrationError(
          connector.id,
          'timeout',
          `${connector.id} exceeded its ${connector.timeoutMs}ms timeout`
        );
      }
      throw new IntegrationError(connector.id, 'error', (e as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }
}
