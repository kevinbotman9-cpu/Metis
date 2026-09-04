import { describe, it, expect, beforeEach } from 'vitest';
import type { CompileContext, StrategySource } from '@metis/compiler/strategy';
import { ArtifactRegistry } from '../src/registry';
import { InMemoryRegistryStore } from '../src/memory-store';
import { RegistryError } from '../src/types';

/**
 * What the registry is for.
 *
 * The old stub stored artifacts in a Map and set `activeVersion` on publish.
 * It compiled nothing, enforced nothing, and had no way back. These tests are
 * the difference.
 */

const T = 'telco-uk';
const NAME = 'inbound-web-offers';
const AT = '2026-06-01T12:00:00.000Z';

function source(over: Partial<StrategySource> = {}): StrategySource {
  return {
    id: NAME,
    version: '1.0.0',
    tenantId: T,
    nodes: [
      { id: 'n1_source', type: 'source', label: 'Source', estimatedMs: 2 },
      { id: 'n2_arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 1 },
    ],
    edges: [{ from: 'n1_source', to: 'n2_arbitrate' }],
    candidateKeys: ['offer_a'],
    packageRanges: { '@metis/nodes-core': '^2.0.0' },
    ...over,
  } as StrategySource;
}

function context(over: Partial<CompileContext> = {}): CompileContext {
  return {
    propositions: [
      {
        id: 'p_a',
        groupId: 'g1',
        issueId: 'i1',
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
        lever: 1,
        policyIds: [],
        treatmentIds: ['t_a'],
        tags: [],
        createdAt: AT,
        updatedAt: AT,
        updatedBy: 'test',
      },
    ],
    engagementPolicies: [],
    contactPolicies: [],
    arbitration: {
      id: 'arb',
      tenantId: T,
      weights: { propensity: 1, value: 1, lever: 1, context: 1 },
      formula: 'P x V x L x C',
      updatedAt: AT,
      updatedBy: 'test',
    },
    availablePackages: { '@metis/nodes-core': ['2.0.0', '2.1.0'] },
    tenant: { id: T, latencyBudgetMs: 50, maxNodes: 100 },
    ...over,
  } as CompileContext;
}

let store: InMemoryRegistryStore;
let registry: ArtifactRegistry;

beforeEach(() => {
  store = new InMemoryRegistryStore();
  registry = new ArtifactRegistry(store);
});

const publish = (over: Partial<Parameters<ArtifactRegistry['publish']>[0]> = {}, ctx = context()) =>
  registry.publish(
    {
      tenantId: T,
      strategyName: NAME,
      version: '1.0.0',
      source: source(),
      actor: 'sarah@telco.example',
      occurredAt: AT,
      ...over,
    },
    ctx
  );

describe('publishing compiles first', () => {
  it('stores a strategy that compiles', () => {
    const out = publish();
    expect(out.status).toBe('published');
    expect(registry.versions(T, NAME)).toHaveLength(1);
  });

  it('refuses a strategy that does not compile, and stores nothing', () => {
    // The gap this closes. The console has shown the compiler's verdict for a
    // while and nothing acted on it, so a strategy with an error could be
    // promoted to production and fail at execution instead of at publish.
    const broken = source({
      edges: [{ from: 'n1_source', to: 'nope' }],
    });
    const out = publish({ source: broken });

    expect(out.status).toBe('rejected');
    if (out.status !== 'rejected') return;
    expect(out.reason).toBe('compilation');
    expect(out.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(registry.versions(T, NAME)).toHaveLength(0);
  });

  it('records the refusal, so an attempt to ship is answerable', () => {
    publish({ source: source({ edges: [{ from: 'n1_source', to: 'nope' }] }) });

    const events = registry.events({ tenantId: T });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('PublishRejected');
    expect(events[0].actor).toBe('sarah@telco.example');
    // The summary must name the codes, or the log says "something failed".
    expect(events[0].summary).toMatch(/DANGLING_EDGE/);
  });

  it('publishes with warnings and keeps them with the version', () => {
    // A strategy that shipped near the latency budget is a different thing to
    // explain in six months than one that shipped clean.
    const slow = source({
      nodes: [
        { id: 'n1_source', type: 'source', label: 'Source', estimatedMs: 30 },
        { id: 'n2_arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 12 },
      ],
    });
    const out = publish({ source: slow });

    expect(out.status).toBe('published');
    const warnings = registry.warningsFor(T, NAME, '1.0.0');
    expect(warnings.some((w) => w.code === 'LATENCY_NEAR_BUDGET')).toBe(true);
  });
});

describe('versions are immutable', () => {
  it('treats republishing identical content as a no-op', () => {
    publish();
    const again = publish();

    expect(again.status).toBe('unchanged');
    // A retried deploy must not look like a second publish in the audit log.
    expect(registry.events({ tenantId: T }).filter((e) => e.type === 'ArtifactPublished')).toHaveLength(1);
  });

  it('refuses different content under a published version', () => {
    publish();
    const changed = source({ candidateKeys: ['offer_a'], nodes: [
      { id: 'n1_source', type: 'source', label: 'Renamed source', estimatedMs: 2 },
      { id: 'n2_arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 1 },
    ] });

    const out = publish({ source: changed });
    expect(out.status).toBe('rejected');
    if (out.status !== 'rejected') return;
    expect(out.reason).toBe('immutable');
    if (out.reason !== 'immutable') return;
    expect(out.existingHash).not.toBe(out.attemptedHash);
  });

  it('cannot be edited through a returned artifact', () => {
    // "Immutable" that depends on nobody trying is not immutable.
    const out = publish();
    if (out.status !== 'published') throw new Error('expected publish');

    expect(() => {
      (out.artifact as { version: string }).version = 'tampered';
    }).toThrow();
    expect(registry.version(T, NAME, '1.0.0')?.artifact.version).toBe('1.0.0');
  });
});

describe('publishing is not activating', () => {
  it('leaves a published version inactive everywhere', () => {
    publish();
    expect(registry.active(T, NAME, 'production')).toBeNull();
    expect(registry.environments(T, NAME)).toHaveLength(0);
  });

  it('says so in the event, so nobody assumes otherwise', () => {
    publish();
    const event = registry.events({ tenantId: T })[0];
    expect(event.summary).toMatch(/Not active anywhere until promoted/);
  });

  it('promotes to one environment without touching another', () => {
    publish();
    registry.promote(T, NAME, '1.0.0', 'staging', 'marcus@telco.example', AT);

    expect(registry.active(T, NAME, 'staging')?.version).toBe('1.0.0');
    expect(registry.active(T, NAME, 'production')).toBeNull();
  });

  it('refuses to promote a version that was never published', () => {
    publish();
    expect(() => registry.promote(T, NAME, '9.9.9', 'production', 'm', AT)).toThrow(RegistryError);
  });

  it('refuses to promote what is already active', () => {
    publish();
    registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
    expect(() => registry.promote(T, NAME, '1.0.0', 'production', 'm', AT)).toThrow(
      /already active/
    );
  });
});

describe('rollback', () => {
  const publishTwo = () => {
    publish({ version: '1.0.0' });
    publish({
      version: '2.0.0',
      source: source({
        nodes: [
          { id: 'n1_source', type: 'source', label: 'Source v2', estimatedMs: 2 },
          { id: 'n2_arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 1 },
        ],
      }),
    });
  };

  it('returns an environment to the version it ran before', () => {
    publishTwo();
    registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
    registry.promote(T, NAME, '2.0.0', 'production', 'm', AT);
    expect(registry.active(T, NAME, 'production')?.version).toBe('2.0.0');

    registry.rollback(T, NAME, 'production', 'm', AT);
    expect(registry.active(T, NAME, 'production')?.version).toBe('1.0.0');
  });

  it('rolling back twice returns to where you started', () => {
    // What an operator means by "undo that". Walking backwards through history
    // would land them on something nobody remembers.
    publishTwo();
    registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
    registry.promote(T, NAME, '2.0.0', 'production', 'm', AT);

    registry.rollback(T, NAME, 'production', 'm', AT);
    registry.rollback(T, NAME, 'production', 'm', AT);
    expect(registry.active(T, NAME, 'production')?.version).toBe('2.0.0');
  });

  it('refuses when there is nothing to go back to', () => {
    publish();
    registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
    expect(() => registry.rollback(T, NAME, 'production', 'm', AT)).toThrow(
      /no earlier version/
    );
  });

  it('refuses when the environment was never promoted to', () => {
    publish();
    expect(() => registry.rollback(T, NAME, 'production', 'm', AT)).toThrow(RegistryError);
  });
});

describe('the event log', () => {
  it('orders by sequence, not by timestamp', () => {
    // Two events can share a timestamp; the sequence is what makes the order a
    // fact rather than a sort key that happens to work.
    publish({ version: '1.0.0' });
    registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);

    const events = registry.events({ tenantId: T });
    expect(events.map((e) => e.type)).toEqual(['VersionPromoted', 'ArtifactPublished']);
    expect(events[0].seq).toBeGreaterThan(events[1].seq);
  });

  it('records every kind of change', () => {
    publish({ version: '1.0.0' });
    publish({
      version: '2.0.0',
      source: source({
        nodes: [
          { id: 'n1_source', type: 'source', label: 'v2', estimatedMs: 2 },
          { id: 'n2_arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 1 },
        ],
      }),
    });
    registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
    registry.promote(T, NAME, '2.0.0', 'production', 'm', AT);
    registry.rollback(T, NAME, 'production', 'm', AT);
    publish({ version: '3.0.0', source: source({ edges: [{ from: 'n1_source', to: 'gone' }] }) });

    const types = registry.events({ tenantId: T }).map((e) => e.type);
    expect(new Set(types)).toEqual(
      new Set(['ArtifactPublished', 'VersionPromoted', 'VersionRolledBack', 'PublishRejected'])
    );
  });

  it('cannot be edited after the fact', () => {
    publish();
    const event = registry.events({ tenantId: T })[0];
    expect(() => {
      (event as { summary: string }).summary = 'rewritten';
    }).toThrow();
  });

  it('filters by strategy and limits', () => {
    publish({ version: '1.0.0' });
    publish({ strategyName: 'other', version: '1.0.0' });

    expect(registry.events({ tenantId: T, strategyName: 'other' })).toHaveLength(1);
    expect(registry.events({ tenantId: T, limit: 1 })).toHaveLength(1);
  });
});

describe('tenancy', () => {
  it('keeps one tenant out of another', () => {
    publish();
    publish({ tenantId: 'bank-uk' });

    expect(registry.strategies(T)).toEqual([NAME]);
    expect(registry.versions('bank-uk', NAME)).toHaveLength(1);
    expect(registry.events({ tenantId: 'bank-uk' })).toHaveLength(1);
  });
});
