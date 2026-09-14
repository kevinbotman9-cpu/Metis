import { describe, it, expect, beforeEach } from 'vitest';
import { GET, PUT } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';

/**
 * `GET` and `PUT /tenants/{tenantId}/settings`. G-092.
 *
 * The setting every formatter in the console reads. What matters over HTTP is
 * that only an administrator can change it, that a locale the runtime cannot
 * format is refused rather than silently falling back to a default — the bug
 * this exists to remove — and that the change is on the audit log.
 */

const AUTH = (email: string) => {
  const u = store.users.find((x) => x.email === email);
  if (!u) throw new Error(`no fixture user ${email}`);
  return { authorization: `Bearer metis.${u.id}`, 'content-type': 'application/json' };
};
/** Holds admin:settings. */
const MARCUS = () => AUTH('marcus.webb@telco.example');
/** Does not. */
const SARAH = () => AUTH('sarah.chen@telco.example');

const call = (method: 'GET' | 'PUT', path: string[], body?: unknown, headers = MARCUS()) => {
  const req = new Request(`http://localhost/api/${path.join('/')}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const ctx = { params: Promise.resolve({ path }) };
  return method === 'GET' ? GET(req, ctx) : PUT(req, ctx);
};

const SETTINGS = ['tenants', 'telco-us', 'settings'];

beforeEach(async () => {
  await resetStore();
});

describe('reading the tenant’s settings', () => {
  it('answers with the seeded tenant’s locale and currency', async () => {
    const res = await call('GET', SETTINGS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ tenantId: 'telco-us', locale: 'en-US', currency: 'USD' });
  });

  it('does not answer for a tenant that is not this one', async () => {
    expect((await call('GET', ['tenants', 'telco-uk', 'settings'])).status).toBe(404);
  });
});

describe('changing them', () => {
  it('refuses an account without admin:settings, and changes nothing', async () => {
    const res = await call('PUT', SETTINGS, { locale: 'de-DE' }, SARAH());
    expect(res.status).toBe(403);
    expect(store.tenantSettings.locale).toBe('en-US');
  });

  it('refuses a locale the runtime cannot format, naming the field', async () => {
    const res = await call('PUT', SETTINGS, { locale: 'not a locale' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.problems).toEqual([expect.objectContaining({ field: 'locale' })]);
    expect(store.tenantSettings.locale).toBe('en-US');
  });

  it('refuses a currency an amount cannot be held in', async () => {
    const res = await call('PUT', SETTINGS, { currency: 'JPY' });
    expect(res.status).toBe(400);
    expect((await res.json()).problems).toEqual([expect.objectContaining({ field: 'currency' })]);
  });

  it('saves a change in canonical form, names who made it, and audits it', async () => {
    const res = await call('PUT', SETTINGS, { locale: 'de-de', currency: 'EUR', tenantId: 'somebody-else' });
    expect(res.status).toBe(200);
    const saved = await res.json();
    // `de-de` and `de-DE` are one setting, not two.
    expect(saved).toMatchObject({ tenantId: 'telco-us', locale: 'de-DE', currency: 'EUR' });
    expect(saved.updatedBy).toBe('marcus.webb@telco.example');

    // What the next reader sees, not only what this response said.
    expect(await (await call('GET', SETTINGS)).json()).toMatchObject({ locale: 'de-DE', currency: 'EUR' });

    const [latest] = await store.governance.events('telco-us', { limit: 1 });
    expect(latest.eventType).toBe('TenantSettingsChanged');
    expect(latest.summary).toContain('en-US');
    expect(latest.summary).toContain('de-DE');
  });
});
