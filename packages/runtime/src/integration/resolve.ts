/**
 * Integration resolution: turn configured connectors into a decision input.
 *
 * This runs *before* the deterministic engine and is deliberately not part of
 * it. Connectors do I/O, and I/O is not reproducible — the bureau that answered
 * in 40ms today may be down in six months, and it will certainly not return the
 * same score. So resolution happens here, produces a plain snapshot, and the
 * engine hashes that snapshot into `inputSnapshotHash`.
 *
 * Replay never calls a connector. It re-executes against the recorded snapshot,
 * which is why an integrated decision replays exactly as well as one with no
 * integrations at all. Any design that called out to a live system during
 * replay would be reproducing today's answer, not the original one.
 *
 * The gateway is an interface so the engine package does no I/O itself: it can
 * be tested without a network, and the dev store, a production HTTP client and
 * a recorded-fixture player are all the same shape.
 */

import type { Connector, SourceBinding, SourceCall } from '@metis/core/domain';
import type { ExecArtifact, DecisionRequest } from '../deterministic/types';

/** What a connector is asked for. Not the full decision request. */
export interface ResolutionContext {
  tenantId: string;
  customerId: string;
  channel: string;
  /** An input, never the clock — the same rule the engine follows. */
  occurredAt: string;
}

export interface IntegrationGateway {
  /**
   * Fetch a connector's raw payload.
   *
   * Throws to signal failure; the timeout and failure mode are applied here in
   * `resolveInputs`, not by the gateway, so every implementation behaves the
   * same way when something goes wrong.
   */
  fetch(connector: Connector, context: ResolutionContext): Promise<unknown>;
  /** Optional cache. Absent means every call goes to the source. */
  cache?: IntegrationCache;
}

export interface IntegrationCache {
  get(key: string): unknown | undefined;
  set(key: string, value: unknown, ttlSeconds: number): void;
}

export interface ResolvedInput {
  /** The decision input, ready to hash. */
  input: Record<string, unknown>;
  /** Which connector supplied which field. Reproducible; goes in the trace. */
  bindings: SourceBinding[];
  /** What happened on the wire. Measured; never hashed. */
  calls: SourceCall[];
}

export class IntegrationError extends Error {
  constructor(
    readonly connectorId: string,
    readonly outcome: 'timeout' | 'error',
    message: string
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

/** Read a dotted path out of a connector payload. */
function readPath(payload: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) =>
      acc !== null && typeof acc === 'object'
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    payload
  );
}

/**
 * Coerce to the declared type, or reject.
 *
 * A bureau that returns `"720"` where the policy expects a number would make
 * every numeric comparison silently false — which reads as "failed the rule"
 * rather than "the integration is misconfigured". Better to say so.
 */
function coerce(
  value: unknown,
  binding: { field: string; type: 'string' | 'number' | 'boolean' },
  connectorId: string
): unknown {
  if (value === undefined || value === null) return undefined;

  switch (binding.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) {
        throw new IntegrationError(
          connectorId,
          'error',
          `Field "${binding.field}" is declared number but ${connectorId} returned ${JSON.stringify(value)}`
        );
      }
      return n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      throw new IntegrationError(
        connectorId,
        'error',
        `Field "${binding.field}" is declared boolean but ${connectorId} returned ${JSON.stringify(value)}`
      );
    case 'string':
      return typeof value === 'string' ? value : String(value);
  }
}

function cacheKey(connector: Connector, ctx: ResolutionContext): string {
  return `${connector.id}:${ctx.tenantId}:${ctx.customerId}`;
}

/** Race a promise against the connector's declared timeout. */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  connectorId: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new IntegrationError(
                connectorId,
                'timeout',
                `${connectorId} exceeded its ${timeoutMs}ms timeout`
              )
            ),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Which connectors this artifact's source nodes name, in a stable order.
 *
 * Sorted by node id then connector id so the trace's bindings do not depend on
 * how the graph happened to be authored.
 */
export function requiredConnectors(
  artifact: ExecArtifact
): { nodeId: string; connectorId: string }[] {
  return artifact.nodes
    .filter((n) => n.type === 'source' && n.connectorIds?.length)
    .flatMap((n) => (n.connectorIds ?? []).map((connectorId) => ({ nodeId: n.id, connectorId })))
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId) || a.connectorId.localeCompare(b.connectorId));
}

/**
 * Run every connector the artifact needs and merge the result into the input.
 *
 * Connectors run concurrently: they are independent reads, and running them in
 * series would make the critical path the sum rather than the maximum, which is
 * also what the compiler's latency budget assumes.
 *
 * Fields already present on the request win. A caller that has the value
 * already — a channel that passes the customer's basket, say — should not pay
 * for a network call to learn it again.
 */
export async function resolveInputs(
  artifact: ExecArtifact,
  connectors: Connector[],
  request: Pick<DecisionRequest, 'tenantId' | 'customerId' | 'channel' | 'occurredAt' | 'input'>,
  gateway: IntegrationGateway
): Promise<ResolvedInput> {
  const byId = new Map(connectors.map((c) => [c.id, c]));
  const required = requiredConnectors(artifact);
  const context: ResolutionContext = {
    tenantId: request.tenantId,
    customerId: request.customerId,
    channel: request.channel,
    occurredAt: request.occurredAt,
  };

  const bindings: SourceBinding[] = [];
  const calls: SourceCall[] = [];
  const fetched: Record<string, unknown> = {};

  const results = await Promise.all(
    required.map(async ({ nodeId, connectorId }) => {
      const connector = byId.get(connectorId);

      // An artifact naming a connector that does not exist should never reach
      // execution — the compiler rejects it with UNKNOWN_CONNECTOR. If it does,
      // that is a bug worth surfacing rather than a decision worth making.
      if (!connector) {
        throw new IntegrationError(
          connectorId,
          'error',
          `Artifact ${artifact.id} names connector "${connectorId}", which is not configured`
        );
      }

      if (!connector.active) {
        return {
          nodeId,
          connector,
          values: {} as Record<string, unknown>,
          call: {
            connectorId,
            ms: 0,
            cacheHit: false,
            outcome: 'skipped' as const,
            fields: [],
            detail: 'Connector is not active',
          },
        };
      }

      const started = Date.now();
      const key = cacheKey(connector, context);
      const cached =
        connector.cacheTtlSeconds > 0 ? gateway.cache?.get(key) : undefined;

      let payload: unknown;
      let cacheHit = false;
      let outcome: SourceCall['outcome'] = 'ok';
      let detail: string | undefined;

      if (cached !== undefined) {
        payload = cached;
        cacheHit = true;
      } else {
        try {
          payload = await withTimeout(
            gateway.fetch(connector, context),
            connector.timeoutMs,
            connectorId
          );
          if (connector.cacheTtlSeconds > 0) {
            gateway.cache?.set(key, payload, connector.cacheTtlSeconds);
          }
        } catch (e) {
          const err =
            e instanceof IntegrationError
              ? e
              : new IntegrationError(connectorId, 'error', (e as Error).message);
          outcome = err.outcome;
          detail = err.message;

          if (connector.onFailure === 'fail') throw err;
          payload = undefined;
        }
      }

      const values: Record<string, unknown> = {};
      for (const binding of connector.provides) {
        let value =
          payload === undefined ? undefined : coerce(readPath(payload, binding.path), binding, connectorId);

        if (value === undefined && outcome !== 'ok' && connector.onFailure === 'default') {
          value = binding.defaultValue;
        }
        if (value !== undefined) values[binding.field] = value;
      }

      return {
        nodeId,
        connector,
        values,
        call: {
          connectorId,
          ms: Date.now() - started,
          cacheHit,
          outcome,
          fields: Object.keys(values).sort(),
          ...(detail ? { detail } : {}),
        } satisfies SourceCall,
      };
    })
  );

  for (const r of results) {
    calls.push(r.call);
    for (const field of Object.keys(r.values).sort()) {
      // The request wins: a caller that already has the value should not have
      // it overwritten by a slower, staler copy.
      if (field in request.input) continue;
      fetched[field] = r.values[field];
      bindings.push({ field, connectorId: r.connector.id, nodeId: r.nodeId });
    }
  }

  bindings.sort(
    (a, b) => a.field.localeCompare(b.field) || a.connectorId.localeCompare(b.connectorId)
  );
  calls.sort((a, b) => a.connectorId.localeCompare(b.connectorId));

  return { input: { ...fetched, ...request.input }, bindings, calls };
}
