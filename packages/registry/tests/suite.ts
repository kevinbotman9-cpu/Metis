import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { CompileContext, DecisionFlowSource } from '@metis/compiler/decision-flow';
import { ArtifactRegistry, type RegistryStore } from '../src/registry';
import { RegistryError } from '../src/types';
import { modelVersionTests } from './models';

/**
 * One behaviour suite, run against every store.
 *
 * The registry's rules live in `ArtifactRegistry`; the store only persists.
 * Running the same assertions against the in-memory and PostgreSQL
 * implementations is what makes that claim checkable — if durable storage
 * changed a behaviour, this suite says which one, rather than the two drifting
 * until somebody notices in production.
 */

const T = 'telco-us';
const NAME = 'inbound-web-offers';
const AT = '2026-06-01T12:00:00.000Z';

export function source(over: Partial<DecisionFlowSource> = {}): DecisionFlowSource {
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
  } as DecisionFlowSource;
}

export function context(over: Partial<CompileContext> = {}): CompileContext {
  return {
    offers: [
      {
        id: 'p_a',
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
        creativeIds: ['t_a'],
        tags: [],
        createdAt: AT,
        updatedAt: AT,
        updatedBy: 'test',
      },
    ],
    targetingPolicies: [],
    frequencyPolicies: [],
    arbitration: {
      id: 'arb',
      tenantId: T,
      weights: { propensity: 1, value: 1, boost: 1, context: 1 },
      utility: { id: 'multiplicative', version: '1.0.0' },
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
          flowName: NAME,
          version: '1.0.0',
          source: source(),
          actor: 'sarah@telco.example',
          occurredAt: AT,
          ...over,
        },
        ctx
      );

    // --- Model versions (ADR-009 §4) ----------------------------------------

    modelVersionTests(() => registry);

    // --- Publishing compiles first -----------------------------------------

    it('stores a flow that compiles', async () => {
      const out = await publish();
      expect(out.status).toBe('published');
      expect(await registry.versions(T, NAME)).toHaveLength(1);
    });

    it('refuses a flow that does not compile, and stores nothing', async () => {
      // The gap this closes. The console showed the compiler's verdict for
      // weeks and nothing acted on it, so a flow with an error could be
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

    // --- Shadow ------------------------------------------------------------

    it('runs a version beside the active one without changing what is active', async () => {
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await publish({ version: '2.0.0' });

      const state = await registry.startShadow(T, NAME, '2.0.0', 'production', 'm', AT);
      // The active version is what decides. A shadow that changed it would be
      // a promotion with a quieter name.
      expect(state.activeVersion).toBe('1.0.0');
      expect(state.shadowVersion).toBe('2.0.0');
    });

    it('refuses to shadow a version against itself', async () => {
      // A 100% agreement rate that means nothing is worse than no number.
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await expect(
        registry.startShadow(T, NAME, '1.0.0', 'production', 'm', AT)
      ).rejects.toThrow(RegistryError);
    });

    it('refuses to shadow an unpublished version', async () => {
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await expect(
        registry.startShadow(T, NAME, '9.9.9', 'production', 'm', AT)
      ).rejects.toThrow(RegistryError);
    });

    it('refuses to shadow where nothing is running', async () => {
      // There is no baseline to compare against.
      await publish();
      await expect(
        registry.startShadow(T, NAME, '1.0.0', 'staging', 'm', AT)
      ).rejects.toThrow(RegistryError);
    });

    it('survives a promotion, because the two answer different questions', async () => {
      // What is running, and what is being evidenced. Clearing the shadow on
      // every promote would end a comparison halfway through unasked.
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await publish({ version: '2.0.0' });
      await registry.startShadow(T, NAME, '2.0.0', 'production', 'm', AT);

      await publish({ version: '3.0.0' });
      const after = await registry.promote(T, NAME, '3.0.0', 'production', 'm', AT);
      expect(after.activeVersion).toBe('3.0.0');
      expect(after.shadowVersion).toBe('2.0.0');
    });

    it('survives a rollback for the same reason', async () => {
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await publish({ version: '2.0.0' });
      await registry.promote(T, NAME, '2.0.0', 'production', 'm', AT);
      await publish({ version: '3.0.0' });
      await registry.startShadow(T, NAME, '3.0.0', 'production', 'm', AT);

      const back = await registry.rollback(T, NAME, 'production', 'm', AT);
      expect(back.activeVersion).toBe('1.0.0');
      expect(back.shadowVersion).toBe('3.0.0');
    });

    it('stops, leaving the active version alone', async () => {
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await publish({ version: '2.0.0' });
      await registry.startShadow(T, NAME, '2.0.0', 'production', 'm', AT);

      const stopped = await registry.stopShadow(T, NAME, 'production', 'm', AT);
      expect(stopped.shadowVersion).toBeNull();
      expect(stopped.activeVersion).toBe('1.0.0');
    });

    it('refuses to stop what was never started', async () => {
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await expect(registry.stopShadow(T, NAME, 'production', 'm', AT)).rejects.toThrow(
        RegistryError
      );
    });

    it('records starting and stopping in the log', async () => {
      // A shadow is a governance act: somebody chose to evidence a migration,
      // and an audit that only showed promotions could not say when.
      await publish();
      await registry.promote(T, NAME, '1.0.0', 'production', 'm', AT);
      await publish({ version: '2.0.0' });
      await registry.startShadow(T, NAME, '2.0.0', 'production', 'm', AT);
      await registry.stopShadow(T, NAME, 'production', 'm', AT);

      const events = await registry.events({ tenantId: T, flowName: NAME });
      const types = events.map((e) => e.type);
      expect(types).toContain('ShadowStarted');
      expect(types).toContain('ShadowStopped');
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

    it('filters by flow and limits', async () => {
      await publish({ version: '1.0.0' });
      await publish({ flowName: 'other', version: '1.0.0' });

      expect(await registry.events({ tenantId: T, flowName: 'other' })).toHaveLength(1);
      expect(await registry.events({ tenantId: T, limit: 1 })).toHaveLength(1);
    });

    // --- Tenancy ------------------------------------------------------------

    it('keeps one tenant out of another', async () => {
      await publish();
      await publish({ tenantId: 'bank-uk' });

      expect(await registry.flows(T)).toEqual([NAME]);
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

    // --- Drafts -------------------------------------------------------------

    it('keeps a draft, and replaces it when it is saved again', async () => {
      await registry.saveDraft(T, NAME, source(), 'sarah@telco.example', AT);
      await registry.saveDraft(T, NAME, v2(), 'marcus@telco.example', '2026-06-02T12:00:00.000Z');

      // Deep equality over a whole flow source: a jsonb round trip that dropped
      // a nested field would pass a shallower assertion.
      expect(await registry.draft(T, NAME)).toEqual({
        tenantId: T,
        flowName: NAME,
        draft: v2(),
        updatedAt: '2026-06-02T12:00:00.000Z',
        updatedBy: 'marcus@telco.example',
      });
      expect(await registry.drafts(T)).toHaveLength(1);
    });

    it('has no draft for a flow nobody has drawn', async () => {
      expect(await registry.draft(T, 'never-drawn')).toBeUndefined();
    });

    it('saves a draft without publishing, promoting or logging anything', async () => {
      // A draft is work in progress. The versions and the log are about what
      // shipped, and a save that appeared in either would be a lie about that.
      await registry.saveDraft(T, NAME, source(), 'sarah@telco.example', AT);
      expect(await registry.versions(T, NAME)).toEqual([]);
      expect(await registry.flows(T)).toEqual([]);
      expect(await registry.events({ tenantId: T })).toEqual([]);
    });

    it('hands back a copy, so editing a draft that was read changes nothing stored', async () => {
      // PostgreSQL can only return copies; memory must not do better, or code
      // that edits a read draft in place works in one and silently not the other.
      await registry.saveDraft(T, NAME, source(), 'sarah@telco.example', AT);
      const read = (await registry.draft<{ candidateKeys: string[] }>(T, NAME))!;
      read.draft.candidateKeys.push('offer_edited_in_place');

      const again = (await registry.draft<{ candidateKeys: string[] }>(T, NAME))!;
      expect(again.draft.candidateKeys).toEqual(['offer_a']);
    });

    it('keeps one tenant’s drafts out of another’s, and lists them in flow order', async () => {
      await registry.saveDraft(T, 'z-flow', source(), 'sarah@telco.example', AT);
      await registry.saveDraft(T, 'a-flow', source(), 'sarah@telco.example', AT);
      await registry.saveDraft('bank-uk', 'm-flow', source(), 'sarah@telco.example', AT);

      expect((await registry.drafts(T)).map((d) => d.flowName)).toEqual(['a-flow', 'z-flow']);
      expect((await registry.drafts('bank-uk')).map((d) => d.flowName)).toEqual(['m-flow']);
    });

    // --- Shadow comparisons ---------------------------------------------------

    /** 1.0.0 active and 2.0.0 shadowing, both published. */
    const twoVersions = async () => {
      await publish();
      await publish({ version: '2.0.0', source: source({ version: '2.0.0' }) });
    };
    const comparison = (over: Partial<Parameters<ArtifactRegistry['recordShadowComparison']>[0]> = {}) => ({
      tenantId: T,
      flowName: NAME,
      environment: 'production' as const,
      activeVersion: '1.0.0',
      shadowVersion: '2.0.0',
      recordedAt: AT,
      comparison: { agrees: false, divergences: [{ kind: 'winner', summary: 'offer_a became offer_b' }] },
      ...over,
    });

    it('keeps shadow comparisons, oldest first, and narrows them to the pair asked about', async () => {
      await twoVersions();
      await publish({ version: '3.0.0', source: source({ version: '3.0.0' }) });
      await registry.recordShadowComparison(comparison({ recordedAt: '2026-06-01T12:00:01.000Z' }));
      await registry.recordShadowComparison(
        comparison({ activeVersion: '2.0.0', shadowVersion: '1.0.0', recordedAt: '2026-06-01T12:00:02.000Z' })
      );
      // The same shadow beside a different active version — what a promotion
      // during a running shadow leaves behind. Matching on the shadow version
      // alone would fold it into the pair below, and the swapped record above
      // could not show that: its shadow version differs too.
      await registry.recordShadowComparison(
        comparison({ activeVersion: '3.0.0', recordedAt: '2026-06-01T12:00:02.500Z' })
      );
      await registry.recordShadowComparison(comparison({ recordedAt: '2026-06-01T12:00:03.000Z' }));

      const pair = await registry.shadowComparisons(T, NAME, {
        environment: 'production',
        activeVersion: '1.0.0',
        shadowVersion: '2.0.0',
      });
      // Whole records, so a jsonb round trip that dropped a nested field fails.
      expect(pair).toEqual([
        comparison({ recordedAt: '2026-06-01T12:00:01.000Z' }),
        comparison({ recordedAt: '2026-06-01T12:00:03.000Z' }),
      ]);
      expect(await registry.shadowComparisons(T, NAME)).toHaveLength(4);
      expect(await registry.shadowComparisons('bank-uk', NAME)).toEqual([]);
    });

    it('refuses a comparison naming a version that was never published, and keeps nothing', async () => {
      await publish();
      await expect(registry.recordShadowComparison(comparison())).rejects.toMatchObject({
        code: 'UNKNOWN_VERSION',
      });
      expect(await registry.shadowComparisons(T, NAME)).toEqual([]);
    });

    it('hands back comparisons as copies', async () => {
      await twoVersions();
      await registry.recordShadowComparison(comparison());
      const [read] = await registry.shadowComparisons<{ agrees: boolean }>(T, NAME);
      try {
        read.comparison.agrees = true;
      } catch {
        // A frozen copy refusing the edit is as good as a copy ignoring it.
      }
      const [again] = await registry.shadowComparisons<{ agrees: boolean }>(T, NAME);
      expect(again.comparison.agrees).toBe(false);
    });

    harness.extra?.(
      () => registry,
      () => store
    );
  });
}
