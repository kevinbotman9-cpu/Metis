import { describe, it, expect, beforeEach } from 'vitest';
import { DELETE } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { readCatalogue } from '@/mocks/catalogue-state';
import type { Creative } from '@metis/core/domain';

/**
 * The three proposed deletes (G-110), over HTTP.
 *
 * What matters is less that a record goes than when it may not: a delete that
 * quietly changed what decisions do — a policy an offer is bound to, a slot a
 * creative names, the last content an active offer can deliver — would be a
 * decision nobody made. Each refusal names what depends on the record.
 *
 * Arranged through the catalogue, never by editing what a read returned. Until
 * 2026-09-13 these pushed onto the store's arrays and assigned into its objects,
 * which only worked because the store handed out the objects it held; a real
 * store hands out copies, and an edit to a copy arranges nothing.
 */

const T = 'telco-us';
const AT = '2026-06-01T12:00:00.000Z';

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

const audited = async (eventType: string) =>
  (await store.governance.events(T)).some((e) => e.eventType === eventType);

beforeEach(async () => {
  await resetStore();
});

describe('deleting a targeting policy', () => {
  const unbound = async () => {
    const [first] = (await readCatalogue()).targetingPolicies;
    const copy = { ...structuredClone(first), id: 'pol_unbound', name: 'Nobody uses this' };
    await store.catalogue.putTargetingPolicy(T, copy, 'test', AT);
    return copy;
  };
  const held = async (id: string) => (await readCatalogue()).targetingPolicies.some((p) => p.id === id);

  it('deletes one no offer is bound to, and audits it', async () => {
    await unbound();
    const res = await del(['targeting-policies', T, 'pol_unbound']);
    expect(res.status).toBe(204);
    expect(await held('pol_unbound')).toBe(false);
    expect(await audited('TargetingPolicyDeleted')).toBe(true);
  });

  it('refuses one an offer is bound to, names the offer, and says what to do instead', async () => {
    const bound = (await readCatalogue()).offers.find((o) => o.policyIds.includes('pol_5g_bandwidth_need'))!;
    const res = await del(['targeting-policies', T, 'pol_5g_bandwidth_need']);
    expect(res.status).toBe(409);
    const { message } = await res.json();
    expect(message).toContain(bound.name);
    expect(message).toContain('Deactivate it instead');
    expect(await held('pol_5g_bandwidth_need')).toBe(true);
  });

  it('refuses an account without edit:policies, and deletes nothing', async () => {
    await unbound();
    expect((await del(['targeting-policies', T, 'pol_unbound'], SARAH())).status).toBe(403);
    expect(await held('pol_unbound')).toBe(true);
  });

  it('answers 404 for a policy that does not exist', async () => {
    expect((await del(['targeting-policies', T, 'pol_nope'])).status).toBe(404);
  });
});

describe('deleting a placement', () => {
  const doomed = async () => {
    const [first] = (await readCatalogue()).placements;
    const copy = { ...structuredClone(first), id: 'plc_doomed', key: 'doomed_slot' };
    await store.catalogue.putPlacement(T, copy, 'test', AT);
    return copy;
  };
  const held = async (key: string) => (await readCatalogue()).placements.some((p) => p.key === key);

  it('deletes one nothing names, and audits it', async () => {
    await doomed();
    const res = await del(['placements', T, 'doomed_slot']);
    expect(res.status).toBe(204);
    expect(await held('doomed_slot')).toBe(false);
    expect(await audited('PlacementDeleted')).toBe(true);
  });

  it('refuses one a creative names, and names the creative', async () => {
    await doomed();
    const creative = (await readCatalogue()).creatives.find((c) => c.channel === 'web')!;
    await store.catalogue.putCreative(
      T,
      { ...creative, content: { ...creative.content, placement: 'doomed_slot' } } as Creative,
      'test',
      AT
    );
    const res = await del(['placements', T, 'doomed_slot']);
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain(creative.name);
    expect(await held('doomed_slot')).toBe(true);
  });

  it('refuses an account without edit:integrations', async () => {
    await doomed();
    expect((await del(['placements', T, 'doomed_slot'], SARAH())).status).toBe(403);
  });
});

describe('deleting a creative', () => {
  it('deletes creatives until the next would leave an active offer nothing to deliver, then refuses', async () => {
    const cat = await readCatalogue();
    const offer = cat.offers.find(
      (o) => o.status === 'active' && cat.creatives.filter((c) => c.offerId === o.id && c.active).length > 0
    )!;
    const ids = cat.creatives.filter((c) => c.offerId === offer.id).map((c) => c.id);

    let refusal: { message: string } | null = null;
    for (const id of ids) {
      const res = await del(['creatives', T, offer.id, id]);
      if (res.status === 409) {
        refusal = await res.json();
        break;
      }
      expect(res.status).toBe(204);
      // The offer stops listing what it no longer has.
      expect((await readCatalogue()).offers.find((o) => o.id === offer.id)!.creativeIds).not.toContain(id);
    }

    // It never reaches an active offer with no active creative.
    expect(refusal, 'every creative was deleted from an active offer').not.toBeNull();
    expect(refusal!.message).toContain(offer.name);
    expect(refusal!.message).toContain('Pause or retire the offer first');
    expect((await readCatalogue()).creatives.some((c) => c.offerId === offer.id && c.active)).toBe(true);
  });

  it('refuses a creative that is not on the offer the path names', async () => {
    const cat = await readCatalogue();
    const [a, b] = cat.offers;
    const onA = cat.creatives.find((c) => c.offerId === a.id)!;
    expect((await del(['creatives', T, b.id, onA.id])).status).toBe(404);
  });
});
