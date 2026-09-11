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
  /**
   * The value and when it was fetched from the source.
   *
   * Optional, and the reason `SourceCall.observedAt` is optional too. A cache
   * that cannot say when it stored something makes a decision unable to say
   * whether the consent flag it used was current, and that is recorded as not
   * known rather than filled in with the time of the cache read (G-056).
   */
  entry?(key: string): { value: unknown; storedAt: number } | undefined;
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

/**
 * Read a dotted path out of the input.
 *
 * The same walk `readPath` does in the engine, repeated here rather than
 * imported: resolution runs before the deterministic core and must not depend
 * on it — that direction is what keeps I/O out of the engine's import graph.
 */
function readAt(input: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc !== null && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
      input
    );
}

/**
 * Write a value at a dotted path, creating the objects on the way.
 *
 * A connector declares where its value lands as a path into the profile —
 * `customer.credit_band` — because that is the vocabulary policies read and
 * the compiler validates against. Assigning it as a flat key with a dot in the
 * name would produce something `readPath` can never find, which is the shape
 * of G-069: two vocabularies, no meeting point, and every rule reading past
 * the values its integrations supplied.
 */
function writeAt(input: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = input;
  for (const segment of segments.slice(0, -1)) {
    const next = cursor[segment];
    if (typeof next !== 'object' || next === null) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

/**
 * The caller's input over the fetched one, branch by branch.
 *
 * A shallow spread cannot do this once a field is a path: the caller's
 * `customer` object would replace the fetched `customer` object whole, and
 * every value an integration supplied would vanish behind one the caller
 * happened to send. Leaves are compared, not branches — which is the same rule
 * as before, applied to a tree instead of a flat map.
 */
function deepPrefer(
  fetched: Record<string, unknown>,
  supplied: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fetched };
  for (const [key, value] of Object.entries(supplied)) {
    const existing = out[key];
    const bothBranches =
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value);
    out[key] = bothBranches
      ? deepPrefer(existing as Record<string, unknown>, value as Record<string, unknown>)
      : value;
  }
  return out;
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
            fetchedAt: new Date().toISOString(),
          },
        };
      }

      const started = Date.now();
      const key = cacheKey(connector, context);
      const usable = connector.cacheTtlSeconds > 0 ? gateway.cache : undefined;
      // `entry` when the cache implements it, so a hit can say how old the
      // value is; `get` otherwise, which answers with the value alone.
      const entry = usable?.entry?.(key);
      const cached = entry ? entry.value : usable?.get(key);

      let payload: unknown;
      let cacheHit = false;
      let outcome: SourceCall['outcome'] = 'ok';
      let detail: string | undefined;
      let observedAt: string | undefined;

      if (cached !== undefined) {
        payload = cached;
        cacheHit = true;
        // Absent when the cache does not keep the time: an unknown age is worth
        // more to an auditor than a fetch time wearing the value's clothes.
        observedAt = entry ? new Date(entry.storedAt).toISOString() : undefined;
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
          fetchedAt: new Date(started).toISOString(),
          // A call that went to the connector computed its value as it
          // answered, so the two times are the same by definition.
          ...(cacheHit ? (observedAt ? { observedAt } : {}) : { observedAt: new Date(started).toISOString() }),
        } satisfies SourceCall,
      };
    })
  );

  for (const r of results) {
    calls.push(r.call);
    for (const field of Object.keys(r.values).sort()) {
      // The request wins: a caller that already has the value should not have
      // it overwritten by a slower, staler copy. Compared by path, because a
      // field is a path now — `field in request.input` asked whether the input
      // had a key called `customer.credit_band`, which it never does.
      if (readAt(request.input, field) !== undefined) continue;
      writeAt(fetched, field, r.values[field]);
      bindings.push({ field, connectorId: r.connector.id, nodeId: r.nodeId });
    }
  }

  bindings.sort(
    (a, b) => a.field.localeCompare(b.field) || a.connectorId.localeCompare(b.connectorId)
  );
  calls.sort((a, b) => a.connectorId.localeCompare(b.connectorId));

  return { input: deepPrefer(fetched, request.input), bindings, calls };
}
