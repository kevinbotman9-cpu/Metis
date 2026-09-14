import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { Governance } from '../src/governance';
import { GovernanceError, type AuditEventInput, type ChangeSet, type GovernanceStore } from '../src/types';

/**
 * One behaviour suite, run against memory and a real PostgreSQL.
 *
 * Same shape as `packages/registry/tests/suite.ts`: if both stores pass these,
 * choosing PostgreSQL is a deployment decision and not a behavioural one.
 */

export interface Harness {
  create(): Promise<GovernanceStore>;
  teardown?(): Promise<void>;
}

const T = 'telco-us';
const AT = '2026-09-14T09:00:00.000Z';

export function changeSet(over: Partial<ChangeSet> = {}): ChangeSet {
  return {
    id: 'cr_0001',
    title: 'Lower the context weight',
    description: 'Context explains little of the ranking.',
    status: 'pending',
    autonomyTier: 2,
    requestedBy: 'agent-strategist-01',
    requestedAt: AT,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    targetScope: { level: 'tenant', targetId: null },
    changeType: 'arbitration_weights',
    diff: [{ field: 'weights.context', before: '1.0', after: '0.65' }],
    simulation: null,
    ...over,
  };
}

export function event(over: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    timestamp: AT,
    actor: 'sarah.chen@telco.example',
    actorType: 'human',
    eventType: 'OfferUpdated',
    scope: 'off_fios',
    summary: 'Renamed.',
    changeSetId: null,
    ...over,
  };
}

const approval = { status: 'approved' as const, decidedBy: 'priya', decidedAt: AT, reason: 'Fine.' };

export function describeGovernance(name: string, harness: Harness) {
  describe(name, () => {
    let store: GovernanceStore;
    let governance: Governance;

    beforeEach(async () => {
      store = await harness.create();
      governance = new Governance(store);
    });

    afterAll(async () => {
      await harness.teardown?.();
    });

    it('opens a change set and reads it back whole', async () => {
      const opened = changeSet({
        simulation: { ran: true, passed: true, populationSize: 10, projectedMarginDelta: '+1', biasRatio: 1.01, notes: 'ok' },
      });
      await governance.open(T, opened);
      expect(await governance.changeSet(T, opened.id)).toEqual(opened);
    });

    it('lists change sets newest request first, and by status', async () => {
      await governance.open(T, changeSet({ id: 'cr_old', requestedAt: '2026-09-01T09:00:00.000Z' }));
      await governance.open(T, changeSet({ id: 'cr_new', requestedAt: '2026-09-10T09:00:00.000Z' }));
      await governance.open(T, changeSet({ id: 'cr_mid', requestedAt: '2026-09-05T09:00:00.000Z' }));
      await governance.decide(T, 'cr_mid', approval);

      expect((await governance.changeSets(T)).map((c) => c.id)).toEqual(['cr_new', 'cr_mid', 'cr_old']);
      expect((await governance.changeSets(T, 'pending')).map((c) => c.id)).toEqual(['cr_new', 'cr_old']);
      expect((await governance.changeSets(T, 'approved')).map((c) => c.id)).toEqual(['cr_mid']);
    });

    it('refuses to open a change set that arrives decided, or under an id already used', async () => {
      await expect(governance.open(T, changeSet({ status: 'approved' }))).rejects.toMatchObject({ code: 'NOT_PENDING' });
      await governance.open(T, changeSet());
      await expect(governance.open(T, changeSet())).rejects.toMatchObject({ code: 'DUPLICATE_CHANGE_SET' });
    });

    it('decides a pending change set, recording who, when and why', async () => {
      await governance.open(T, changeSet());
      const decided = await governance.decide(T, 'cr_0001', approval);

      expect(decided).toMatchObject({ status: 'approved', decidedBy: 'priya', decidedAt: AT, decisionReason: 'Fine.' });
      expect(await governance.changeSet(T, 'cr_0001')).toEqual(decided);
    });

    it('refuses to decide a change set twice, and keeps the first decision', async () => {
      // The property a durable approval needs: re-approving would apply the
      // change set's diff a second time.
      await governance.open(T, changeSet());
      await governance.decide(T, 'cr_0001', approval);

      const again = governance.decide(T, 'cr_0001', { ...approval, status: 'rejected', decidedBy: 'marcus' });
      await expect(again).rejects.toBeInstanceOf(GovernanceError);
      await expect(again).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
      expect(await governance.changeSet(T, 'cr_0001')).toMatchObject({ status: 'approved', decidedBy: 'priya' });
    });

    it('lets exactly one of two decisions made together land', async () => {
      await governance.open(T, changeSet());
      const results = await Promise.allSettled([
        governance.decide(T, 'cr_0001', approval),
        governance.decide(T, 'cr_0001', { ...approval, status: 'rejected', decidedBy: 'marcus' }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(lost.reason).toMatchObject({ code: 'ALREADY_DECIDED' });
      const won = (results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<ChangeSet>).value;
      expect(await governance.changeSet(T, 'cr_0001')).toEqual(won);
    });

    it('has the store write a decision only over a pending change set', async () => {
      // The store's own half of decide-once, asserted without `Governance` in
      // front of it. The race above does not always interleave — against
      // PostgreSQL the second decision usually reads the first one's write and
      // is refused before reaching the store — so without this the conditional
      // write could go and nothing would notice.
      await governance.open(T, changeSet());
      const approved = await governance.decide(T, 'cr_0001', approval);

      const overwrite = { ...approved, status: 'rejected' as const, decidedBy: 'marcus' };
      await expect(store.decideChangeSet(T, overwrite)).resolves.toBe(false);
      await expect(store.decideChangeSet(T, { ...overwrite, id: 'cr_nobody' })).resolves.toBe(false);
      expect(await store.getChangeSet(T, 'cr_0001')).toEqual(approved);
    });

    it('refuses to decide a change set nobody opened', async () => {
      await expect(governance.decide(T, 'cr_nope', approval)).rejects.toMatchObject({ code: 'UNKNOWN_CHANGE_SET' });
    });

    it('records audit events newest first, each with an id of its own', async () => {
      const first = await governance.record(T, event({ summary: 'first' }));
      const second = await governance.record(T, event({ summary: 'second' }));
      const third = await governance.record(T, event({ summary: 'third' }));

      expect(new Set([first.id, second.id, third.id]).size).toBe(3);
      expect((await governance.events(T)).map((e) => e.summary)).toEqual(['third', 'second', 'first']);
      expect((await governance.events(T, { limit: 2 })).map((e) => e.summary)).toEqual(['third', 'second']);
      expect(await governance.countEvents(T)).toBe(3);
      expect((await governance.events(T))[0]).toEqual(third);
    });

    it('orders events by when they were appended, not by their timestamps', async () => {
      // A restored log carries timestamps out of order — an incident written
      // up after the fact — and the log's order is the order it was written in.
      await governance.record(T, event({ summary: 'appended first', timestamp: '2026-09-14T12:00:00.000Z' }));
      await governance.record(T, event({ summary: 'appended second', timestamp: '2026-09-01T12:00:00.000Z' }));
      expect((await governance.events(T)).map((e) => e.summary)).toEqual(['appended second', 'appended first']);
    });

    it('refuses an event id the tenant already holds', async () => {
      await store.appendAuditEvent(T, { ...event(), id: 'evt_0021' });
      await expect(store.appendAuditEvent(T, { ...event(), id: 'evt_0021' })).rejects.toMatchObject({
        code: 'DUPLICATE_EVENT',
      });
      expect(await store.countAuditEvents(T)).toBe(1);
    });

    it('hands back copies, so editing what was read changes nothing stored', async () => {
      await governance.open(T, changeSet());
      await governance.record(T, event());

      const read = (await governance.changeSet(T, 'cr_0001'))!;
      read.status = 'approved';
      read.diff[0].after = 'edited';
      const [logged] = await governance.events(T);
      logged.summary = 'edited';

      expect(await governance.changeSet(T, 'cr_0001')).toMatchObject({ status: 'pending' });
      expect((await governance.changeSet(T, 'cr_0001'))!.diff[0].after).toBe('0.65');
      expect((await governance.events(T))[0].summary).toBe('Renamed.');
    });

    it('keeps one tenant out of another, and lists the tenants it holds', async () => {
      await governance.open(T, changeSet());
      await governance.record('other-tenant', event());

      expect(await governance.changeSets('other-tenant')).toEqual([]);
      expect(await governance.changeSet('other-tenant', 'cr_0001')).toBeUndefined();
      expect(await governance.events(T)).toEqual([]);
      await expect(governance.decide('other-tenant', 'cr_0001', approval)).rejects.toMatchObject({
        code: 'UNKNOWN_CHANGE_SET',
      });
      expect(await store.listTenants()).toEqual(['other-tenant', T]);
    });
  });
}
