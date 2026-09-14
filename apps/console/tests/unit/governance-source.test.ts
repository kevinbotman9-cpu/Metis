import { describe, it, expect } from 'vitest';
import { Governance, InMemoryGovernanceStore } from '@metis/governance';
import { CONSOLE_TENANT } from '@/mocks/catalogue-source';
import { openGovernance, GovernanceTenantRefused } from '@/mocks/governance-source';
import { changeSets, auditEvents } from '@/mocks/fixtures/governance';

/**
 * What happens to the fixture change sets and audit log when the console opens
 * a governance store. Against memory, so it runs everywhere; that an approval
 * survives a restart is in `console-durable.test.ts`.
 */

const AT = '2026-09-14T09:00:00.000Z';

describe('opening the console change sets and audit log in a store', () => {
  it('gives an empty store the fixture change sets as decided, and the log in its order', async () => {
    const store = new InMemoryGovernanceStore();
    const opened = await openGovernance(store);
    const governance = new Governance(store);

    expect(opened.seeded).toBe(true);
    expect((await governance.changeSets(CONSOLE_TENANT)).map((c) => c.id).sort()).toEqual(
      changeSets.map((c) => c.id).sort()
    );
    // Decided change sets stay decided: an approved one cannot be approved again.
    const approved = changeSets.find((c) => c.status === 'approved')!;
    await expect(
      governance.decide(CONSOLE_TENANT, approved.id, { status: 'approved', decidedBy: 'marcus', decidedAt: AT, reason: 'Again.' })
    ).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
    expect((await governance.events(CONSOLE_TENANT)).map((e) => e.id)).toEqual(auditEvents.map((e) => e.id));
  });

  it('uses a store that holds the tenant as found, adding nothing', async () => {
    const store = new InMemoryGovernanceStore();
    const governance = new Governance(store);
    await governance.record(CONSOLE_TENANT, {
      timestamp: AT, actor: 'sarah', actorType: 'human', eventType: 'OfferUpdated', scope: 'off_fios', summary: 'Renamed.', changeSetId: null,
    });

    const opened = await openGovernance(store);

    expect(opened.seeded).toBe(false);
    expect(await governance.countEvents(CONSOLE_TENANT)).toBe(1);
    expect(await governance.changeSets(CONSOLE_TENANT)).toEqual([]);
  });

  it('refuses a store that holds another tenant and not this one, and writes nothing', async () => {
    const store = new InMemoryGovernanceStore();
    await new Governance(store).record('someone-else', {
      timestamp: AT, actor: 'them', actorType: 'human', eventType: 'OfferUpdated', scope: 'x', summary: 'Theirs.', changeSetId: null,
    });

    const refusal = await openGovernance(store).catch((e: unknown) => e);

    expect(refusal).toBeInstanceOf(GovernanceTenantRefused);
    expect((refusal as Error).message).toContain("'someone-else'");
    expect(await store.listTenants()).toEqual(['someone-else']);
  });
});
