import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { readCatalogue } from '@/mocks/catalogue-state';

/**
 * Raising a change set publishes nothing.
 *
 * `createChangeSet` was in the spec, credited to a write suite, and answered
 * 404: the only test carrying `covers: createChangeSet` approved a change set
 * the fixtures had seeded. These hold the operation to what `/arbitration` needs
 * from it — a proposal a person can raise and another can approve, which
 * changes the weights only on approval.
 */

const AUTH = (email: string) => {
  const u = store.users.find((x) => x.email === email)!;
  return { authorization: `Bearer metis.${u.id}`, 'content-type': 'application/json' };
};
const MARCUS = () => AUTH('marcus.webb@telco.example');
const SARAH = () => AUTH('sarah.chen@telco.example');
const PRIYA = () => AUTH('priya.natarajan@telco.example');

const post = (path: string[], body: unknown, headers = MARCUS()) =>
  POST(new Request(`http://localhost/api/${path.join('/')}`, { method: 'POST', headers, body: JSON.stringify(body) }), {
    params: Promise.resolve({ path }),
  });
const get = (path: string[], headers = MARCUS()) =>
  GET(new Request(`http://localhost/api/${path.join('/')}`, { headers }), { params: Promise.resolve({ path }) });

const raise = (diff: unknown, over: Record<string, unknown> = {}, headers = MARCUS()) =>
  post(
    ['change-sets'],
    {
      title: 'Take the boost out of the ranking',
      description: 'See what the order is when nobody sets it.',
      changeType: 'arbitration_weights',
      diff,
      ...over,
    },
    headers
  );

const liveWeights = async () => (await readCatalogue()).arbitration!.weights;

describe('raising a change set', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('opens a pending change set, publishes nothing, and records who raised it', async () => {
    const before = await liveWeights();
    const res = await raise([{ field: 'weights.boost', before: String(before.boost), after: '0' }]);
    expect(res.status, await res.clone().text()).toBe(201);
    const raised = (await res.json()) as { id: string; status: string; requestedBy: string; decidedBy: null };

    expect(raised).toMatchObject({ status: 'pending', requestedBy: 'marcus.webb@telco.example', decidedBy: null });
    expect(raised.id).toMatch(/^cr_/);
    expect(await liveWeights(), 'raising a change set published the weights').toEqual(before);

    const listed = (await (await get(['change-sets'])).json()) as { changeSets: { id: string }[] };
    expect(listed.changeSets.map((c) => c.id)).toContain(raised.id);
    const [latest] = await store.governance.events('telco-us', { limit: 1 });
    expect(latest).toMatchObject({ eventType: 'ChangeSetOpened', changeSetId: raised.id });
  });

  it('changes the weights only when somebody approves it', async () => {
    const before = await liveWeights();
    const raised = (await (await raise([{ field: 'weights.boost', before: String(before.boost), after: '0' }])).json()) as {
      id: string;
    };

    const approved = await post(['change-sets', raised.id, 'approve'], { reason: 'Seen the order it makes.' }, PRIYA());
    expect(approved.status, await approved.clone().text()).toBe(200);
    expect(await liveWeights()).toEqual({ ...before, boost: 0 });
  });

  it('refuses a before that no longer matches the live weight', async () => {
    const res = await raise([{ field: 'weights.context', before: '0.5', after: '0.65' }]);
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain('live context weight is 1');
  });

  it('refuses a diff that changes nothing, a weight out of range, and something that is not a weight', async () => {
    const live = await liveWeights();
    expect((await raise([{ field: 'weights.value', before: String(live.value), after: String(live.value) }])).status).toBe(400);
    expect((await raise([{ field: 'weights.value', before: String(live.value), after: '2.5' }])).status).toBe(400);
    expect((await raise([{ field: 'weights.cost', before: '1', after: '0' }])).status).toBe(400);
    expect((await raise([])).status).toBe(400);
  });

  it('refuses a change type the console cannot raise', async () => {
    const res = await raise([{ field: 'pol_x.active', before: 'true', after: 'false' }], { changeType: 'policy_edit' });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('policy_edit');
  });

  it('refuses an account that cannot edit arbitration, and opens nothing', async () => {
    const before = (await store.governance.changeSets('telco-us')).length;
    const live = await liveWeights();
    const res = await raise([{ field: 'weights.boost', before: String(live.boost), after: '0' }], {}, SARAH());
    expect(res.status).toBe(403);
    expect((await store.governance.changeSets('telco-us')).length).toBe(before);
  });
});
