import { describe, it, expect, beforeEach } from 'vitest';
import type {
  ArbitrationConfig,
  Boost,
  Category,
  Connector,
  Creative,
  FrequencyPolicy,
  Objective,
  Offer,
  Placement,
  TargetingPolicy,
} from '@metis/core/domain';
import type { ProfileSchema } from '@metis/core/profile-schema';
import type { Experiment } from '@metis/core/experiment';
import { Catalogue } from '../src/catalogue';
import { CatalogueError, type CatalogueStore } from '../src/types';

/**
 * One behaviour suite, run against every store.
 *
 * The catalogue's rules live in `Catalogue`; the store only persists. Running
 * these assertions against both the in-memory implementation and a real
 * PostgreSQL is what makes that claim checkable — and it is the same shape the
 * registry and the ledger already use, for the same reason: if durable storage
 * changed a behaviour, this says which one, rather than the two drifting until
 * somebody notices in production.
 */

const T = 'telco-us';
const AT = '2026-06-01T12:00:00.000Z';

export const objective = (over: Partial<Objective> = {}): Objective =>
  ({ id: 'obj_ret', name: 'Retention', description: '', ...over }) as Objective;

export const category = (over: Partial<Category> = {}): Category =>
  ({
    id: 'cat_broadband',
    objectiveId: 'obj_ret',
    name: 'Broadband',
    description: '',
    ...over,
  }) as Category;

export const offer = (over: Partial<Offer> = {}): Offer =>
  ({
    id: 'off_fibre',
    categoryId: 'cat_broadband',
    objectiveId: 'obj_ret',
    name: 'Fibre 900',
    key: 'acq_fibre_900',
    description: '',
    status: 'active',
    financials: {
      price: { amount: 4900, currency: 'GBP' },
      cost: { amount: 1200, currency: 'GBP' },
      expectedMargin: { amount: 3700, currency: 'GBP' },
      termMonths: 24,
      oneOff: false,
    },
    validity: { startsAt: '2020-01-01', endsAt: null },
    boost: 1,
    policyIds: [],
    creativeIds: [],
    tags: [],
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'sarah',
    ...over,
  }) as Offer;

const creative = (over: Partial<Creative> = {}): Creative =>
  ({
    id: 'crt_fibre_email',
    offerId: 'off_fibre',
    name: 'Fibre 900 email',
    channel: 'email',
    status: 'approved',
    content: { subject: 'Upgrade to Fibre 900', preheader: '', body: '' },
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'sarah',
    ...over,
  }) as Creative;

const targeting = (over: Partial<TargetingPolicy> = {}): TargetingPolicy =>
  ({
    id: 'tp_adult',
    name: 'Adults only',
    description: '',
    kind: 'eligibility',
    conditions: [],
    scope: { level: 'tenant', targetId: null },
    active: true,
    ...over,
  }) as TargetingPolicy;

const frequency = (over: Partial<FrequencyPolicy> = {}): FrequencyPolicy =>
  ({
    id: 'fp_week',
    name: 'Weekly cap',
    description: '',
    channel: null,
    maxContacts: 3,
    period: 'week',
    cooldownDaysAfterReject: 14,
    scope: { level: 'tenant', targetId: null },
    active: true,
    ...over,
  }) as FrequencyPolicy;

const boost = (over: Partial<Boost> = {}): Boost =>
  ({
    id: 'bst_retention',
    name: 'Retention push',
    description: '',
    multiplier: 1.4,
    scope: { level: 'tenant', targetId: null },
    validity: { startsAt: '2020-01-01', endsAt: null },
    active: true,
    ...over,
  }) as Boost;

const arbitration = (over: Partial<ArbitrationConfig> = {}): ArbitrationConfig =>
  ({
    id: 'arb',
    tenantId: T,
    weights: { propensity: 1, value: 1, boost: 1, context: 0.5 },
    utility: { id: 'multiplicative', version: '1.0.0' },
    formula: 'P x V x B x C',
    updatedAt: AT,
    updatedBy: 'marcus',
    ...over,
  }) as ArbitrationConfig;

export const connector = (over: Partial<Connector> = {}): Connector =>
  ({
    id: 'conn_bureau',
    name: 'Credit bureau',
    kind: 'rest',
    description: '',
    target: 'https://bureau.example/score',
    declaredP95Ms: 40,
    timeoutMs: 80,
    onFailure: 'fail',
    cacheTtlSeconds: 0,
    provides: [{ field: 'customer.credit_band', path: 'band', type: 'string' }],
    active: true,
    updatedAt: AT,
    updatedBy: 'marcus',
    ...over,
  }) as Connector;

export const placement = (over: Partial<Placement> = {}): Placement =>
  ({
    id: 'plc_hero',
    key: 'homepage_hero',
    name: 'Homepage hero',
    description: '',
    channel: 'web',
    type: 'hero',
    slotCount: 1,
    artifactId: 'next-best-action',
    decidable: true,
    delivery: { mode: 'caller' },
    updatedAt: AT,
    updatedBy: 'marcus',
    ...over,
  }) as Placement;

export const profileSchema = (over: Partial<ProfileSchema> = {}): ProfileSchema =>
  ({
    id: 'schema_telco',
    tenantId: T,
    version: '1.0.0',
    roots: { customer: 'Customer', context: 'Context' },
    entities: [],
    aggregations: [],
    updatedAt: AT,
    updatedBy: 'marcus',
    ...over,
  }) as unknown as ProfileSchema;

export const experiment = (over: Partial<Experiment> = {}): Experiment =>
  ({
    id: 'exp_holdout',
    tenantId: T,
    key: 'fiber_holdout',
    name: 'Fiber holdout',
    description: '',
    arms: [
      { key: 'holdout', name: 'Held out', weight: 10, holdout: true },
      { key: 'treated', name: 'Offered as usual', weight: 90 },
    ],
    status: 'draft',
    startedAt: null,
    stoppedAt: null,
    updatedAt: AT,
    updatedBy: 'marcus',
    ...over,
  }) as Experiment;

export interface StoreUnderTest {
  create(): Promise<CatalogueStore>;
}

export function describeCatalogue(name: string, harness: StoreUnderTest): void {
  describe(name, () => {
    let catalogue: Catalogue;

    beforeEach(async () => {
      catalogue = new Catalogue(await harness.create());
      await catalogue.putObjective(T, objective(), 'sarah', AT);
      await catalogue.putCategory(T, category(), 'sarah', AT);
    });

    describe('reading', () => {
      it('returns an empty catalogue for a tenant that has none', async () => {
        const snapshot = await catalogue.read('nobody');
        expect(snapshot.offers).toEqual([]);
        // Null, not an invented default. A tenant with no ranking function
        // configured has not chosen one, and pretending otherwise would put a
        // formula nobody approved into a decision.
        expect(snapshot.arbitration).toBeNull();
      });

      it('keeps tenants apart', async () => {
        await catalogue.putObjective('other-tenant', objective({ id: 'obj_other' }), 'x', AT);
        const mine = await catalogue.read(T);
        expect(mine.objectives.map((o) => o.id)).toEqual(['obj_ret']);
      });

      it('reads back everything that was written, unchanged', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        await catalogue.putCreative(T, creative(), 'sarah', AT);
        await catalogue.putTargetingPolicy(T, targeting(), 'sarah', AT);
        await catalogue.putFrequencyPolicy(T, frequency(), 'sarah', AT);
        await catalogue.putBoost(T, boost(), 'sarah', AT);
        await catalogue.putArbitration(T, arbitration(), 'marcus', AT);
        await catalogue.putConnector(T, connector(), 'marcus', AT);
        await catalogue.putPlacement(T, placement(), 'marcus', AT);
        await catalogue.putProfileSchema(T, profileSchema(), 'marcus', AT);
        await catalogue.putExperiment(T, experiment(), 'marcus', AT);

        const s = await catalogue.read(T);
        // Deep equality, not a field count: a jsonb round trip that dropped a
        // nested financials field would pass a shallower assertion.
        expect(s.offers).toEqual([offer()]);
        expect(s.creatives).toEqual([creative()]);
        expect(s.targetingPolicies).toEqual([targeting()]);
        expect(s.frequencyPolicies).toEqual([frequency()]);
        expect(s.boosts).toEqual([boost()]);
        expect(s.arbitration).toEqual(arbitration());
        expect(s.connectors).toEqual([connector()]);
        expect(s.placements).toEqual([placement()]);
        expect(s.profileSchema).toEqual(profileSchema());
        expect(s.experiments).toEqual([experiment()]);
      });

      it('has no profile schema until one is put, rather than an invented one', async () => {
        expect((await catalogue.read(T)).profileSchema).toBeNull();
      });

      it('hands back copies, so editing what was read or written changes nothing stored', async () => {
        // PostgreSQL can only return copies. The memory store returned the
        // stored objects until 2026-09-13, so code that edited a read result in
        // place worked against memory and silently lost the edit against a real
        // database — the console did exactly that for policies, connectors,
        // experiments and the ranking function.
        const written = offer();
        await catalogue.putOffer(T, written, 'sarah', AT);
        written.name = 'Edited after writing';

        const read = (await catalogue.read(T)).offers[0];
        read.name = 'Edited after reading';
        await catalogue.putArbitration(T, arbitration(), 'marcus', AT);
        const arbitrationRead = (await catalogue.read(T)).arbitration!;
        arbitrationRead.weights.value = 99;

        const again = await catalogue.read(T);
        expect(again.offers[0].name).toBe('Fibre 900');
        expect(again.arbitration!.weights.value).toBe(1);
      });

      it('reads every array in id order, whatever order it was written in', async () => {
        // The engine hashes arrays in the order it is given. A store that
        // returned write order would give one catalogue two hashes — authored
        // one way on one instance, imported another way on the next — and the
        // two stores did disagree about this until 2026-09-13. Written in
        // reverse, so write order and id order cannot coincide.
        for (const id of ['off_c', 'off_b', 'off_a']) {
          await catalogue.putOffer(T, offer({ id, key: `k_${id}` }), 'sarah', AT);
        }
        for (const id of ['tp_c', 'tp_b', 'tp_a']) {
          await catalogue.putTargetingPolicy(T, targeting({ id }), 'sarah', AT);
        }
        for (const id of ['fp_c', 'fp_b', 'fp_a']) {
          await catalogue.putFrequencyPolicy(T, frequency({ id }), 'sarah', AT);
        }
        for (const id of ['bst_c', 'bst_b', 'bst_a']) {
          await catalogue.putBoost(T, boost({ id }), 'sarah', AT);
        }
        for (const id of ['conn_c', 'conn_b', 'conn_a']) {
          await catalogue.putConnector(T, connector({ id }), 'marcus', AT);
        }
        for (const id of ['plc_c', 'plc_b', 'plc_a']) {
          await catalogue.putPlacement(T, placement({ id, key: `key_${id}` }), 'marcus', AT);
        }
        for (const id of ['exp_c', 'exp_b', 'exp_a']) {
          await catalogue.putExperiment(T, experiment({ id, key: `key_${id}` }), 'marcus', AT);
        }

        const s = await catalogue.read(T);
        const ids = (list: { id: string }[]) => list.map((x) => x.id);
        expect(ids(s.offers)).toEqual(['off_a', 'off_b', 'off_c']);
        expect(ids(s.targetingPolicies)).toEqual(['tp_a', 'tp_b', 'tp_c']);
        expect(ids(s.frequencyPolicies)).toEqual(['fp_a', 'fp_b', 'fp_c']);
        expect(ids(s.boosts)).toEqual(['bst_a', 'bst_b', 'bst_c']);
        expect(ids(s.connectors)).toEqual(['conn_a', 'conn_b', 'conn_c']);
        expect(ids(s.placements)).toEqual(['plc_a', 'plc_b', 'plc_c']);
        expect(ids(s.experiments)).toEqual(['exp_a', 'exp_b', 'exp_c']);
      });

      it('is stable across two reads, because the engine hashes it', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        await catalogue.putOffer(T, offer({ id: 'off_b', key: 'k_b' }), 'sarah', AT);
        await catalogue.putOffer(T, offer({ id: 'off_a', key: 'k_a' }), 'sarah', AT);

        const first = await catalogue.read(T);
        const second = await catalogue.read(T);
        // A snapshot whose order varied would hash differently run to run, and
        // the catalogue hash is recorded in every decision.
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      });
    });

    describe('referential integrity', () => {
      it('refuses a category whose objective does not exist', async () => {
        await expect(
          catalogue.putCategory(T, category({ id: 'cat_x', objectiveId: 'obj_missing' }), 'sarah', AT)
        ).rejects.toThrow(CatalogueError);
      });

      it('refuses an offer in a category that does not exist', async () => {
        await expect(
          catalogue.putOffer(T, offer({ categoryId: 'cat_missing' }), 'sarah', AT)
        ).rejects.toThrow(/does not exist/);
      });

      it('refuses a creative for an offer that does not exist', async () => {
        await expect(
          catalogue.putCreative(T, creative({ offerId: 'off_missing' }), 'sarah', AT)
        ).rejects.toThrow(/does not exist/);
      });

      it('refuses two offers sharing a key', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        await expect(
          catalogue.putOffer(T, offer({ id: 'off_other' }), 'sarah', AT)
        ).rejects.toThrow(/already used by/);
      });

      it('allows an offer to keep its own key when updated', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        await catalogue.putOffer(T, offer({ name: 'Fibre 900 renamed' }), 'sarah', AT);
        const s = await catalogue.read(T);
        expect(s.offers).toHaveLength(1);
        expect(s.offers[0].name).toBe('Fibre 900 renamed');
      });

      it('refuses to delete an offer that creatives still point at', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        await catalogue.putCreative(T, creative(), 'sarah', AT);

        // Cascading would destroy content somebody wrote as a side effect of a
        // different action.
        await expect(catalogue.deleteOffer(T, 'off_fibre', 'sarah', AT)).rejects.toThrow(
          /still has 1 creative/
        );
        expect((await catalogue.read(T)).offers).toHaveLength(1);
      });

      it('deletes an offer once nothing points at it', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        expect(await catalogue.deleteOffer(T, 'off_fibre', 'sarah', AT)).toBe(true);
        expect((await catalogue.read(T)).offers).toEqual([]);
      });

      it('reports deleting something that was never there, rather than throwing', async () => {
        expect(await catalogue.deleteOffer(T, 'off_never', 'sarah', AT)).toBe(false);
      });

      it('refuses two placements sharing a key', async () => {
        // A request names a placement by key, and the placement names the flow
        // that answers. Two sharing a key would give one request two flows.
        await catalogue.putPlacement(T, placement(), 'marcus', AT);
        await expect(
          catalogue.putPlacement(T, placement({ id: 'plc_other' }), 'marcus', AT)
        ).rejects.toThrow(/already used by plc_hero/);
        expect((await catalogue.read(T)).placements).toHaveLength(1);
      });

      it('refuses two experiments sharing a key', async () => {
        await catalogue.putExperiment(T, experiment(), 'marcus', AT);
        await expect(
          catalogue.putExperiment(T, experiment({ id: 'exp_other' }), 'marcus', AT)
        ).rejects.toThrow(/already used by exp_holdout/);
      });

      it('deletes a creative, a policy and a placement, and reports what was never there', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        await catalogue.putCreative(T, creative(), 'sarah', AT);
        await catalogue.putTargetingPolicy(T, targeting(), 'sarah', AT);
        await catalogue.putPlacement(T, placement(), 'marcus', AT);

        expect(await catalogue.deleteCreative(T, 'crt_fibre_email', 'sarah', AT)).toBe(true);
        expect(await catalogue.deleteTargetingPolicy(T, 'tp_adult', 'sarah', AT)).toBe(true);
        expect(await catalogue.deletePlacement(T, 'plc_hero', 'marcus', AT)).toBe(true);
        const s = await catalogue.read(T);
        expect([s.creatives, s.targetingPolicies, s.placements]).toEqual([[], [], []]);

        expect(await catalogue.deleteCreative(T, 'crt_never', 'sarah', AT)).toBe(false);
        expect(await catalogue.deleteTargetingPolicy(T, 'tp_never', 'sarah', AT)).toBe(false);
        expect(await catalogue.deletePlacement(T, 'plc_never', 'marcus', AT)).toBe(false);

        const deleted = (await catalogue.events({ tenantId: T })).filter((e) => e.action === 'deleted');
        expect(deleted.map((e) => [e.entity, e.entityId]).sort()).toEqual([
          ['creative', 'crt_fibre_email'],
          ['placement', 'plc_hero'],
          ['targeting_policy', 'tp_adult'],
        ]);
      });

      it('allows a placement to keep its own key when updated', async () => {
        await catalogue.putPlacement(T, placement(), 'marcus', AT);
        await catalogue.putPlacement(T, placement({ slotCount: 3 }), 'marcus', AT);
        const s = await catalogue.read(T);
        expect(s.placements).toHaveLength(1);
        expect(s.placements[0].slotCount).toBe(3);
      });
    });

    describe('the edit log', () => {
      it('records who changed what, and whether it was new', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        await catalogue.putOffer(T, offer({ name: 'Renamed' }), 'marcus', AT);

        const events = await catalogue.events({ tenantId: T, entity: 'offer' });
        expect(events.map((e) => e.action)).toEqual(['updated', 'created']);
        expect(events[0].actor).toBe('marcus');
        expect(events[1].actor).toBe('sarah');
      });

      it('records connector and placement changes like any other', async () => {
        // A connector edit changes the catalogue hash, so who made it is the
        // same audit question as who changed a boost.
        await catalogue.putConnector(T, connector(), 'marcus', AT);
        await catalogue.putConnector(T, connector({ timeoutMs: 120 }), 'marcus', AT);
        await catalogue.putPlacement(T, placement(), 'marcus', AT);

        const connectors = await catalogue.events({ tenantId: T, entity: 'connector' });
        expect(connectors.map((e) => e.action)).toEqual(['updated', 'created']);
        const placements = await catalogue.events({ tenantId: T, entity: 'placement' });
        expect(placements.map((e) => [e.action, e.entityId])).toEqual([['created', 'plc_hero']]);
      });

      it('records a profile schema and an experiment change like any other', async () => {
        await catalogue.putProfileSchema(T, profileSchema(), 'marcus', AT);
        await catalogue.putProfileSchema(T, profileSchema({ version: '1.1.0' }), 'marcus', AT);
        await catalogue.putExperiment(T, experiment(), 'marcus', AT);
        await catalogue.putExperiment(T, experiment({ status: 'running' }), 'marcus', AT);

        const schemas = await catalogue.events({ tenantId: T, entity: 'profile_schema' });
        expect(schemas.map((e) => e.action)).toEqual(['updated', 'created']);
        const experiments = await catalogue.events({ tenantId: T, entity: 'experiment' });
        expect(experiments.map((e) => e.action)).toEqual(['updated', 'created']);
      });

      it('orders by sequence, newest first', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        await catalogue.putBoost(T, boost(), 'sarah', AT);
        const events = await catalogue.events({ tenantId: T });
        const seqs = events.map((e) => e.seq);
        expect([...seqs].sort((a, b) => b - a)).toEqual(seqs);
      });

      it('records a deletion, so the log answers "where did it go"', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        await catalogue.deleteOffer(T, 'off_fibre', 'marcus', AT);
        const events = await catalogue.events({ tenantId: T, entity: 'offer' });
        expect(events[0].action).toBe('deleted');
        expect(events[0].summary).toContain('off_fibre');
      });

      it('does not record a refused write', async () => {
        // An audit log that showed attempts as though they succeeded would be
        // worse than one that showed nothing.
        const before = (await catalogue.events({ tenantId: T })).length;
        await catalogue
          .putOffer(T, offer({ categoryId: 'cat_missing' }), 'sarah', AT)
          .catch(() => {});
        expect((await catalogue.events({ tenantId: T })).length).toBe(before);
      });

      it('keeps one tenant out of another tenant log', async () => {
        await catalogue.putObjective('other', objective({ id: 'obj_o' }), 'x', AT);
        const mine = await catalogue.events({ tenantId: T });
        expect(mine.every((e) => e.tenantId === T)).toBe(true);
      });
    });

    describe('tenants', () => {
      it('lists the tenants that have a catalogue', async () => {
        await catalogue.putOffer(T, offer(), 'sarah', AT);
        await catalogue.putObjective('other', objective({ id: 'obj_o' }), 'x', AT);
        expect(await catalogue.tenants()).toEqual(['other', T].sort());
      });
    });
  });
}
