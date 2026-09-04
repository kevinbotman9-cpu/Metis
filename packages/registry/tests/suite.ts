import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { CompileContext, StrategySource } from '@metis/compiler/strategy';
import { ArtifactRegistry, type RegistryStore } from '../src/registry';
import { RegistryError } from '../src/types';

/**
 * One behaviour suite, run against every store.
 *
 * The registry's rules live in `ArtifactRegistry`; the store only persists.
 * Running the same assertions against the in-memory and PostgreSQL
 * implementations is what makes that claim checkable — if durable storage
 * changed a behaviour, this suite says which one, rather than the two drifting
 * until somebody notices in production.
 */

const T = 'telco-uk';
const NAME = 'inbound-web-offers';
const AT = '2026-06-01T12:00:00.000Z';

export function source(over: Partial<StrategySource> = {}): StrategySource {
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

export function context(over: Partial<CompileContext> = {}): CompileContext {
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

/** A second version, differing only enough to change the artifact hash. */
export const v2 = () =>
  source({
    nodes: [
      { id: 'n1_source', type: 'source', label: 'Source v2', estimatedMs: 2 },
      { id: 'n2_arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 1 },
    ],
  });

export interface StoreHarness {
  /** A store with no state in it. */
  create(): Promise<RegistryStore>;
  /** Release connections, drop temporary schemas. */
  teardown?(): Promise<void>;
  /** Behaviour only this store can be asked about. */
  extra?: (getRegistry: () => ArtifactRegistry, getStore: () => RegistryStore) => void;
}

export function describeRegistry(label: string, harness: StoreHarness): void {
  describe(label, () => {
    let store: RegistryStore;
    let registry: ArtifactRegistry;

    beforeEach(async () => {
      store = await harness.create();
      registry = new ArtifactRegistry(store);
    });

    afterAll(async () => {
      await harness.teardown?.();
    });

    const publish = (
      over: Partial<Parameters<ArtifactRegistry['publish']>[0]> = {},
      ctx = context()
    ) =>
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

    // --- Publishing compiles first -----------------------------------------

    it('stores a strategy that compiles', async () => {
      const out = await publish();
      expect(out.status).toBe('published');
      expect(await registry.versions(T, NAME)).toHaveLength(1);
    });

    it('refuses a strategy that does not compile, and stores nothing', async () => {
      // The gap this closes. The console showed the compiler's verdict for
      // weeks and nothing acted on it, so a strategy with an error could be
      // promoted to production and fail at execution instead of at publish.
      const out = await publish({ source: source({ edges: [{ from: 'n1_source', to: 'nope' }] }) });

      expect(out.status).toBe('rejected');
      if (out.status !== 'rejected') return;
      expect(out.reason).toBe('compilation');
      expect(out.diagnostics.some((d) => d.severity === 'error')).toBe(true);
      expect(await registry.versions(T, NAME)).toHaveLength(0);
    });

    it('records the refusal, so an attempt to ship is answerable', async () => {
      await publish({ source: source({ edges: [{ from: 'n1_source', to: 'nope' }] }) });

      const events = await registry.events({ tenantId: T });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('PublishRejected');
      expect(events[0].actor).toBe('sarah@telco.example');
      // The summary must name the codes, or the log says "something failed".
      expect(events[0].summary).toMatch(/DANGLING_EDGE/);
      expect(events[0].diagnostics?.length).toBeGreaterThan(0);
    });

    it('publishes with warnings and keeps them with the version', async () => {
      const out = await publish({
        source: source({
          nodes: [
            { id: 'n1_source', type: 'source', label: 'Source', estimatedMs: 30 },
            { id: 'n2_arbitrate', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 12 },
          ],
        }),
      });

      expect(out.status).toBe('published');
      const warnings = await registry.warningsFor(T, NAME, '1.0.0');
      expect(warnings.some((w) => w.code === 'LATENCY_NEAR_BUDGET')).toBe(true);
    });

    // --- Versions are immutable --------------------------------------------

    it('treats republishing identical content as a no-op', async () => {
      await publish();
      const again = await publish();

      expect(again.status).toBe('unchanged');
      // A retried deploy must not look like a second publish in the log.
      const published = (await registry.events({ tenantId: T })).filter(
        (e) => e.type === 'ArtifactPublished'
      );
      expect(published).toHaveLength(1);
    });

    it('refuses different content under a published version', async () => {
      await publish();
      const out = await publish({ source: v2() });

      expect(out.status).toBe('rejected');
      if (out.status !== 'rejected' || out.reason !== 'immutable') {
        throw new Error('expected an immutability refusal');
      }
      expect(out.existingHash).not.toBe(out.attemptedHash);
    });

    it('keeps the original content after a refused overwrite', async () => {
      const first = await publish();
      if (first.status !== 'published') throw new Error('expected publish');

      await publish({ source: v2() });
      const stored = await registry.version(T, NAME, '1.0.0');
      expect(stored?.artifact.artifactHash).toBe(first.artifact.artifactHash);
    });

    // --- Publishing is not activating --------------------------------------

    it('leaves a published version inactive everywhere', async () => {
      await publish();
      expect(await registry.active(T, NAME, 'production')).toBeNull();
      expect(await registry.environments(T, NAME)).toHaveLength(0);
    });

    it('says so in the event, so nobody assumes otherwise', async () => {
      await publish();
      const events = await registry.events({ tenantId: T });
      expect(events[0].summary).toMatch(/Not active anywhere until promoted/);
    });

    it('promotes to one environment without touching another', async () => {
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'staging', 'marcus@telco.example', AT);

      expect((await registry.active(T, NAME, 'staging'))?.version).toBe('1.0.0');
      expect(await registry.active(T, NAME, 'production')).toBeNull();
    });

    it('refuses to promote a version that was never published', async () => {
      await publish();
      await expect(registry.promote(T, NAME, '9.9.9', 'production', 'm', AT)).rejects.toThrow(
        RegistryError
      );
    });

    it('refuses to promote what is already active', async () => {
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await expect(registry.promote(T, NAME, '1.0.0', 'production', 'm', AT)).rejects.toThrow(
        /already active/
      );
    });

    // --- Rollback -----------------------------------------------------------

    const publishTwo = async () => {
      await publish({ version: '1.0.0' });
      await publish({ version: '2.0.0', source: v2() });
    };

    it('returns an environment to the version it ran before', async () => {
      await publishTwo();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await registry.promote(T, NAME, '2.0.0', 'production', 'm', AT);
      expect((await registry.active(T, NAME, 'production'))?.version).toBe('2.0.0');

      await registry.rollback(T, NAME, 'production', 'm', AT);
      expect((await registry.active(T, NAME, 'production'))?.version).toBe('1.0.0');
    });

    it('rolling back twice returns to where you started', async () => {
      // What an operator means by "undo that". Walking backwards through
      // history would land them on something nobody remembers.
      await publishTwo();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await registry.promote(T, NAME, '2.0.0', 'production', 'm', AT);

      await registry.rollback(T, NAME, 'production', 'm', AT);
      await registry.rollback(T, NAME, 'production', 'm', AT);
      expect((await registry.active(T, NAME, 'production'))?.version).toBe('2.0.0');
    });

    it('refuses when there is nothing to go back to', async () => {
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await expect(registry.rollback(T, NAME, 'production', 'm', AT)).rejects.toThrow(
        /no earlier version/
      );
    });

    it('refuses when the environment was never promoted to', async () => {
      await publish();
      await expect(registry.rollback(T, NAME, 'production', 'm', AT)).rejects.toThrow(
        RegistryError
      );
    });

    // --- The event log ------------------------------------------------------

    it('orders by sequence, not by timestamp', async () => {
      // Two events can share a timestamp; the sequence is what makes the order
      // a fact rather than a sort key that happens to work.
      await publish({ version: '1.0.0' });
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);

      const events = await registry.events({ tenantId: T });
      expect(events.map((e) => e.type)).toEqual(['VersionPromoted', 'ArtifactPublished']);
      expect(events[0].seq).toBeGreaterThan(events[1].seq);
    });

    it('records every kind of change', async () => {
      await publishTwo();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await registry.promote(T, NAME, '2.0.0', 'production', 'm', AT);
      await registry.rollback(T, NAME, 'production', 'm', AT);
      await publish({ version: '3.0.0', source: source({ edges: [{ from: 'n1_source', to: 'x' }] }) });

      const types = new Set((await registry.events({ tenantId: T })).map((e) => e.type));
      expect(types).toEqual(
        new Set(['ArtifactPublished', 'VersionPromoted', 'VersionRolledBack', 'PublishRejected'])
      );
    });

    it('filters by strategy and limits', async () => {
      await publish({ version: '1.0.0' });
      await publish({ strategyName: 'other', version: '1.0.0' });

      expect(await registry.events({ tenantId: T, strategyName: 'other' })).toHaveLength(1);
      expect(await registry.events({ tenantId: T, limit: 1 })).toHaveLength(1);
    });

    // --- Tenancy ------------------------------------------------------------

    it('keeps one tenant out of another', async () => {
      await publish();
      await publish({ tenantId: 'bank-uk' });

      expect(await registry.strategies(T)).toEqual([NAME]);
      expect(await registry.versions('bank-uk', NAME)).toHaveLength(1);
      expect(await registry.events({ tenantId: 'bank-uk' })).toHaveLength(1);
    });

    it('round-trips an artifact without losing anything', async () => {
      // Durable storage serialises; in-memory does not. Asserting the whole
      // artifact comes back identical is what catches a column that quietly
      // drops a nested field or coerces a number.
      const out = await publish();
      if (out.status !== 'published') throw new Error('expected publish');

      const stored = await registry.version(T, NAME, '1.0.0');
      expect(stored?.artifact).toEqual(out.artifact);
      expect(stored?.publishedBy).toBe('sarah@telco.example');
      expect(stored?.publishedAt).toBe(AT);
    });

    harness.extra?.(
      () => registry,
      () => store
    );
  });
}
