import { describe, it, expect } from 'vitest';
import type { Connector } from '@metis/core/domain';
import { resolveInputs, requiredConnectors, IntegrationError } from '../src/integration/resolve';
import type { IntegrationGateway, ResolutionContext } from '../src/integration/resolve';
import { execute, replay } from '../src/deterministic/engine';
import type { ExecArtifact, CatalogueSnapshot, DecisionRequest } from '../src/deterministic/types';

/**
 * Integrations at decision time, and the line they must not cross.
 *
 * A configured connector has to actually be used when a decision is made —
 * that is the point of configuring it. But connectors do I/O, and I/O is not
 * reproducible, so the design puts them *before* the deterministic core and
 * snapshots what they returned. These tests hold both halves of that: the
 * fetching really happens, and replay really does not repeat it.
 */

function connector(over: Partial<Connector> = {}): Connector {
  return {
    id: 'conn_bureau',
    name: 'Credit bureau',
    kind: 'rest',
    description: 'Credit score lookup',
    target: 'https://bureau.example/score',
    declaredP95Ms: 20,
    timeoutMs: 100,
    onFailure: 'fail',
    cacheTtlSeconds: 0,
    provides: [{ field: 'creditScore', path: 'score.value', type: 'number' }],
    active: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'test',
    ...over,
  };
}

const artifact: ExecArtifact = {
  id: 'art_test',
  version: '1.0.0',
  tenantId: 't',
  nodes: [
    { id: 'n_source', type: 'source', label: 'Source', connectorIds: ['conn_bureau'] },
    { id: 'n_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
  ],
  edges: [{ from: 'n_source', to: 'n_arbitrate' }],
  candidateKeys: ['offer_a'],
  packageVersions: {},
};

const catalogue: CatalogueSnapshot = {
  offers: [
    {
      id: 'p1',
      categoryId: 'g1',
      objectiveId: 'i1',
      name: 'Offer A',
      key: 'offer_a',
      description: '',
      status: 'active',
      financials: {
        price: { amount: 1000, currency: 'GBP' },
        cost: { amount: 400, currency: 'GBP' },
        expectedMargin: { amount: 600, currency: 'GBP' },
        termMonths: 12,
        oneOff: false,
      },
      validity: { startsAt: '2020-01-01', endsAt: null },
      boost: 1,
      policyIds: [],
      creativeIds: [],
      tags: [],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      updatedBy: 'test',
    },
  ],
  targetingPolicies: [],
  frequencyPolicies: [],
  arbitration: {
    id: 'arb',
    tenantId: 't',
    weights: { propensity: 1, value: 1, boost: 1, context: 1 },
    utility: { id: 'multiplicative', version: '1.0.0' },
    formula: 'P x V x L x C',
    updatedAt: '2020-01-01T00:00:00.000Z',
    updatedBy: 'test',
  },
  boosts: [],
  connectors: [connector()],
};

const request: DecisionRequest = {
  tenantId: 't',
  customerId: 'cust_1',
  channel: 'web',
  placement: 'hero',
  occurredAt: '2026-06-01T12:00:00.000Z',
  input: {},
};

/** Counts calls, so "did not call the connector" is checkable rather than assumed. */
function gateway(
  payload: unknown,
  opts: { fail?: Error; delayMs?: number } = {}
): IntegrationGateway & { calls: number } {
  const g = {
    calls: 0,
    async fetch(_c: Connector, _ctx: ResolutionContext) {
      g.calls++;
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.fail) throw opts.fail;
      return payload;
    },
  };
  return g;
}

describe('integration resolution', () => {
  it('fetches a configured connector and puts its fields in the input', async () => {
    const g = gateway({ score: { value: 720 } });
    const resolved = await resolveInputs(artifact, catalogue.connectors, request, g);

    expect(g.calls).toBe(1);
    expect(resolved.input.creditScore).toBe(720);
    expect(resolved.bindings).toEqual([
      { field: 'creditScore', connectorId: 'conn_bureau', nodeId: 'n_source' },
    ]);
    expect(resolved.calls[0]).toMatchObject({
      connectorId: 'conn_bureau',
      outcome: 'ok',
      cacheHit: false,
      fields: ['creditScore'],
    });
  });

  it('coerces to the declared type', async () => {
    const g = gateway({ score: { value: '720' } });
    const resolved = await resolveInputs(artifact, catalogue.connectors, request, g);
    expect(resolved.input.creditScore).toBe(720);
    expect(typeof resolved.input.creditScore).toBe('number');
  });

  it('refuses a value that cannot be the declared type', async () => {
    // Silently letting "not available" through as NaN would make every numeric
    // comparison false, which reads as "customer failed the rule".
    const g = gateway({ score: { value: 'not available' } });
    await expect(resolveInputs(artifact, catalogue.connectors, request, g)).rejects.toThrow(
      /declared number/
    );
  });

  it('lets the request win over a connector', async () => {
    const g = gateway({ score: { value: 720 } });
    const resolved = await resolveInputs(
      artifact,
      catalogue.connectors,
      { ...request, input: { creditScore: 810 } },
      g
    );
    expect(resolved.input.creditScore).toBe(810);
    // Nothing was bound, because nothing was taken from the connector.
    expect(resolved.bindings).toEqual([]);
  });

  it('fails the decision when a required connector fails', async () => {
    const g = gateway(null, { fail: new Error('bureau down') });
    await expect(resolveInputs(artifact, catalogue.connectors, request, g)).rejects.toThrow(
      IntegrationError
    );
  });

  it('falls back to a default when the connector says it may', async () => {
    const connectors = [
      connector({
        onFailure: 'default',
        provides: [
          { field: 'creditScore', path: 'score.value', type: 'number', defaultValue: 500 },
        ],
      }),
    ];
    const g = gateway(null, { fail: new Error('bureau down') });
    const resolved = await resolveInputs(artifact, connectors, request, g);

    expect(resolved.input.creditScore).toBe(500);
    expect(resolved.calls[0].outcome).toBe('error');
    // The trace has to say the value was a fallback, not a reading.
    expect(resolved.calls[0].detail).toContain('bureau down');
  });

  it('omits the field when the connector says it may', async () => {
    const connectors = [connector({ onFailure: 'omit' })];
    const g = gateway(null, { fail: new Error('bureau down') });
    const resolved = await resolveInputs(artifact, connectors, request, g);

    expect('creditScore' in resolved.input).toBe(false);
    expect(resolved.calls[0].outcome).toBe('error');
  });

  it('times out rather than waiting on a hung connector', async () => {
    const connectors = [connector({ timeoutMs: 20, onFailure: 'omit' })];
    const g = gateway({ score: { value: 720 } }, { delayMs: 200 });
    const resolved = await resolveInputs(artifact, connectors, request, g);

    expect(resolved.calls[0].outcome).toBe('timeout');
    expect('creditScore' in resolved.input).toBe(false);
  });

  it('skips an inactive connector without calling it', async () => {
    const g = gateway({ score: { value: 720 } });
    const resolved = await resolveInputs(artifact, [connector({ active: false })], request, g);

    expect(g.calls).toBe(0);
    expect(resolved.calls[0].outcome).toBe('skipped');
  });

  it('serves a second decision from cache', async () => {
    const store = new Map<string, unknown>();
    const g = gateway({ score: { value: 720 } });
    const cached: IntegrationGateway = {
      fetch: g.fetch,
      cache: { get: (k) => store.get(k), set: (k, v) => void store.set(k, v) },
    };
    const connectors = [connector({ cacheTtlSeconds: 60 })];

    const first = await resolveInputs(artifact, connectors, request, cached);
    const second = await resolveInputs(artifact, connectors, request, cached);

    expect(g.calls).toBe(1);
    expect(first.calls[0].cacheHit).toBe(false);
    expect(second.calls[0].cacheHit).toBe(true);
    expect(second.input.creditScore).toBe(720);
  });

  it('raises when the artifact names a connector nobody configured', async () => {
    const g = gateway({ score: { value: 720 } });
    await expect(resolveInputs(artifact, [], request, g)).rejects.toThrow(/not configured/);
  });

  it('lists required connectors in a stable order', () => {
    const many: ExecArtifact = {
      ...artifact,
      nodes: [
        { id: 'n_b', type: 'source', label: 'B', connectorIds: ['z', 'a'] },
        { id: 'n_a', type: 'source', label: 'A', connectorIds: ['m'] },
        { id: 'n_arbitrate', type: 'arbitrate', label: 'Arbitrate' },
      ],
    };
    expect(requiredConnectors(many)).toEqual([
      { nodeId: 'n_a', connectorId: 'm' },
      { nodeId: 'n_b', connectorId: 'a' },
      { nodeId: 'n_b', connectorId: 'z' },
    ]);
  });
});

describe('integrations and determinism', () => {
  it('records provenance in the reproducible half of the trace', async () => {
    const g = gateway({ score: { value: 720 } });
    const resolved = await resolveInputs(artifact, catalogue.connectors, request, g);
    const trace = execute(artifact, catalogue, { ...request, input: resolved.input });

    expect(trace.decision.sourceBindings).toEqual([
      { field: 'creditScore', connectorId: 'conn_bureau', nodeId: 'n_source' },
    ]);
  });

  it('replays without calling the connector, and matches', async () => {
    // The whole design in one test. The bureau answered once, months ago. It
    // is not asked again — the recorded snapshot is replayed instead, and the
    // chain hash matches.
    const g = gateway({ score: { value: 720 } });
    const resolved = await resolveInputs(artifact, catalogue.connectors, request, g);
    const original = execute(artifact, catalogue, { ...request, input: resolved.input });

    const callsBefore = g.calls;
    const result = replay(artifact, catalogue, original, resolved.input);

    expect(g.calls).toBe(callsBefore);
    expect(result.identical).toBe(true);
    expect(result.differences).toEqual([]);
  });

  it('a different connector value produces a different decision hash', async () => {
    // The other half: if the integration had returned something else, the
    // decision really is a different decision, and the hash says so.
    const a = await resolveInputs(artifact, catalogue.connectors, request, gateway({ score: { value: 720 } }));
    const b = await resolveInputs(artifact, catalogue.connectors, request, gateway({ score: { value: 500 } }));

    const ta = execute(artifact, catalogue, { ...request, input: a.input });
    const tb = execute(artifact, catalogue, { ...request, input: b.input });

    expect(ta.decision.inputSnapshotHash).not.toBe(tb.decision.inputSnapshotHash);
    expect(ta.chainHash).not.toBe(tb.chainHash);
  });

  it('changing a connector changes the catalogue hash', async () => {
    // A connector remapped to a different response path returns different
    // values, so a decision made before the change is not the same decision.
    // If the connectors were outside the snapshot, both would hash alike.
    const before = execute(artifact, catalogue, { ...request, input: { creditScore: 720 } });
    const after = execute(
      artifact,
      {
        ...catalogue,
        connectors: [connector({ provides: [{ field: 'creditScore', path: 'other.path', type: 'number' }] })],
      },
      { ...request, input: { creditScore: 720 } }
    );

    expect(before.decision.catalogueSnapshotHash).not.toBe(after.decision.catalogueSnapshotHash);
  });

  it('measured call detail never reaches the hashed half', async () => {
    // Cache state and latency must not change the decision. Two runs, one
    // served from cache, must produce the same chain hash.
    const store = new Map<string, unknown>();
    const g = gateway({ score: { value: 720 } });
    const cached: IntegrationGateway = {
      fetch: g.fetch,
      cache: { get: (k) => store.get(k), set: (k, v) => void store.set(k, v) },
    };
    const connectors = [connector({ cacheTtlSeconds: 60 })];

    const cold = await resolveInputs(artifact, connectors, request, cached);
    const warm = await resolveInputs(artifact, connectors, request, cached);
    expect(cold.calls[0].cacheHit).toBe(false);
    expect(warm.calls[0].cacheHit).toBe(true);

    const c = { ...catalogue, connectors };
    expect(execute(artifact, c, { ...request, input: cold.input }).chainHash).toBe(
      execute(artifact, c, { ...request, input: warm.input }).chainHash
    );
  });
});
