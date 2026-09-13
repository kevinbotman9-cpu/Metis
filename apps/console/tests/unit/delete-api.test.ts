import { describe, it, expect, beforeEach } from 'vitest';
import { DELETE } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';

/**
 * The three proposed deletes (G-110), over HTTP.
 *
 * What matters is less that a record goes than when it may not: a delete that
 * quietly changed what decisions do — a policy an offer is bound to, a slot a
 * creative names, the last content an active offer can deliver — would be a
 * decision nobody made. Each refusal names what depends on the record.
 */

const AUTH = (email: string) => {
  const u = store.users.find((x) => x.email === email);
  if (!u) throw new Error(`no fixture user ${email}`);
  return { authorization: `Bearer metis.${u.id}` };
};
/** An administrator: every edit permission. */
const MARCUS = () => AUTH('marcus.webb@telco.example');
/** Authors offers and flows; not policies or integrations. */
const SARAH = () => AUTH('sarah.chen@telco.example');

const del = (path: string[], headers = MARCUS()) =>
  DELETE(new Request(`http://localhost/api/${path.join('/')}`, { method: 'DELETE', headers }), {
    params: Promise.resolve({ path }),
  });

const audited = (eventType: string) => store.auditEvents.some((e) => e.eventType === eventType);

beforeEach(async () => {
  await resetStore();
});

describe('deleting a targeting policy', () => {
  const unbound = () => {
    const copy = { ...structuredClone(store.targetingPolicies[0]), id: 'pol_unbound', name: 'Nobody uses this' };
    store.targetingPolicies.push(copy);
    return copy;
  };

  it('deletes one no offer is bound to, and audits it', async () => {
    unbound();
    const res = await del(['targeting-policies', 'telco-us', 'pol_unbound']);
    expect(res.status).toBe(204);
    expect(store.targetingPolicies.some((p) => p.id === 'pol_unbound')).toBe(false);
    expect(audited('TargetingPolicyDeleted')).toBe(true);
  });

  it('refuses one an offer is bound to, names the offer, and says what to do instead', async () => {
    const bound = store.offers.find((o) => o.policyIds.includes('pol_5g_bandwidth_need'))!;
    const res = await del(['targeting-policies', 'telco-us', 'pol_5g_bandwidth_need']);
    expect(res.status).toBe(409);
    const { message } = await res.json();
    expect(message).toContain(bound.name);
    expect(message).toContain('Deactivate it instead');
    expect(store.targetingPolicies.some((p) => p.id === 'pol_5g_bandwidth_need')).toBe(true);
  });

  it('refuses an account without edit:policies, and deletes nothing', async () => {
    unbound();
    expect((await del(['targeting-policies', 'telco-us', 'pol_unbound'], SARAH())).status).toBe(403);
    expect(store.targetingPolicies.some((p) => p.id === 'pol_unbound')).toBe(true);
  });

  it('answers 404 for a policy that does not exist', async () => {
    expect((await del(['targeting-policies', 'telco-us', 'pol_nope'])).status).toBe(404);
  });
});

describe('deleting a placement', () => {
  const doomed = () => {
    const copy = { ...structuredClone(store.placements[0]), id: 'plc_doomed', key: 'doomed_slot' };
    store.placements.push(copy);
    return copy;
  };

  it('deletes one nothing names, and audits it', async () => {
    doomed();
    const res = await del(['placements', 'telco-us', 'doomed_slot']);
    expect(res.status).toBe(204);
    expect(store.placements.some((p) => p.key === 'doomed_slot')).toBe(false);
    expect(audited('PlacementDeleted')).toBe(true);
  });

  it('refuses one a creative names, and names the creative', async () => {
    doomed();
    const creative = store.creatives.find((c) => c.channel === 'web')!;
    (creative.content as { placement?: string }).placement = 'doomed_slot';
    const res = await del(['placements', 'telco-us', 'doomed_slot']);
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain(creative.name);
    expect(store.placements.some((p) => p.key === 'doomed_slot')).toBe(true);
  });

  it('refuses an account without edit:integrations', async () => {
    doomed();
    expect((await del(['placements', 'telco-us', 'doomed_slot'], SARAH())).status).toBe(403);
  });
});

describe('deleting a creative', () => {
  it('deletes creatives until the next would leave an active offer nothing to deliver, then refuses', async () => {
    const offer = store.offers.find(
      (o) => o.status === 'active' && store.creatives.filter((c) => c.offerId === o.id && c.active).length > 0
    )!;
    const ids = store.creatives.filter((c) => c.offerId === offer.id).map((c) => c.id);

    let refusal: { message: string } | null = null;
    for (const id of ids) {
      const res = await del(['creatives', 'telco-us', offer.id, id]);
      if (res.status === 409) {
        refusal = await res.json();
        break;
      }
      expect(res.status).toBe(204);
      // The offer stops listing what it no longer has.
      expect(store.offers.find((o) => o.id === offer.id)!.creativeIds).not.toContain(id);
    }

    // It never reaches an active offer with no active creative.
    expect(refusal, 'every creative was deleted from an active offer').not.toBeNull();
    expect(refusal!.message).toContain(offer.name);
    expect(refusal!.message).toContain('Pause or retire the offer first');
    expect(store.creatives.some((c) => c.offerId === offer.id && c.active)).toBe(true);
  });

  it('refuses a creative that is not on the offer the path names', async () => {
    const [a, b] = store.offers;
    const onA = store.creatives.find((c) => c.offerId === a.id)!;
    expect((await del(['creatives', 'telco-us', b.id, onA.id])).status).toBe(404);
  });
});
