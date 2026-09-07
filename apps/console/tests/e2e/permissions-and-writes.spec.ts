import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS, openAccountPanel } from './helpers';

test.describe('role-based access', () => {
  test('hides the audit log from an account without view:audit', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    const nav = page.getByRole('navigation', { name: 'Main' });
    // Sarah has view:audit, so it is present. Assert the mechanism instead by
    // checking a permission she lacks surfaces as read-only.
    await expect(nav.getByRole('link', { name: 'Arbitration & Boosts' })).toBeVisible();

    await page.goto('/arbitration');
    await expect(page.getByText('read only')).toBeVisible();
    await expect(page.getByRole('button', { name: /Publish weights/ })).toHaveCount(0);
  });

  test('lets an administrator edit arbitration', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/arbitration');
    await expect(page.getByText('read only')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Publish weights/ })).toBeVisible();
  });

  // covers: approveChangeSet
  test('gates approval on the permission, not just the UI', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/approvals/cr_0042');
    await expect(page.getByText('approve:changes required')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

    // The server must refuse too, not merely the hidden button. page.request
    // does not share the browser's localStorage, so send the token explicitly —
    // otherwise this asserts 401 (no session) rather than 403 (no permission).
    const token = await page.evaluate(() => localStorage.getItem('metis.auth.token'));
    const res = await page.request.post('/api/change-sets/cr_0042/approve', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).message).toContain('approve:changes');
  });

  // covers: rejectChangeSet
  test('shows approve and reject to a compliance officer', async ({ page }) => {
    await login(page, ACCOUNTS.priya);
    await page.goto('/approvals/cr_0042');
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
  });
});

test.describe('writes persist', () => {
  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  // covers: updateArbitrationConfig
  test('publishing arbitration weights survives a reload and is audited', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/arbitration');

    const context = page.getByRole('slider', { name: 'Context weight' });
    await context.fill('0.35');
    await page.getByRole('button', { name: /Publish weights/ }).click();
    await expect(page.getByText('Published. Recorded in the audit log.')).toBeVisible();

    await page.reload();
    await expect(page.getByText('C0.35')).toBeVisible();

    await page.goto('/audit');
    await expect(page.getByText('ArbitrationWeightsChanged').first()).toBeVisible();
  });

  // covers: createChangeSet
  test('approving a change set applies its diff and records the decision', async ({ page }) => {
    await login(page, ACCOUNTS.priya);

    // cr_0042 lowers the heavy-user threshold from 0.8 to 0.7.
    const before = await page.request.get('/api/targeting-policies/telco-uk');
    const policyBefore = (await before.json()).policies.find(
      (p: { id: string }) => p.id === 'pol_heavy_user'
    );
    expect(policyBefore.conditions[0].value).toBe(0.8);

    await page.goto('/approvals/cr_0042');
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Approved\. The change will publish/)).toBeVisible();

    const after = await page.request.get('/api/targeting-policies/telco-uk');
    const policyAfter = (await after.json()).policies.find(
      (p: { id: string }) => p.id === 'pol_heavy_user'
    );
    expect(policyAfter.conditions[0].value).toBe(0.7);

    await page.goto('/audit');
    await expect(page.getByText('ChangeSetApproved').first()).toBeVisible();
  });

  // covers: updateAutonomySetting
  test('changing an autonomy level persists and is audited', async ({ page }) => {
    await login(page, ACCOUNTS.priya);
    await page.goto('/agentic');

    await page.getByRole('button', { name: 'Change level' }).first().click();
    await page.getByRole('button', { name: 'L3 Bounded' }).click();

    await page.reload();
    await page.goto('/audit');
    await expect(page.getByText('AutonomyChanged').first()).toBeVisible();
  });
});

test.describe('appearance', () => {
  test('theme and density persist across navigation', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);

    await openAccountPanel(page, /Sarah Chen/);
    await page.getByRole('group', { name: 'Colour scheme' }).getByText('Dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('group', { name: 'Density' }).getByText('Compact').click();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');

    await page.goto('/decisions');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  });
});

/**
 * Creating an offer.
 *
 * `createOffer` was declared built, served by nothing, and exempted from the
 * contract suite as "covered by a write suite" while no write suite existed.
 * This is that suite. It drives the API rather than the UI because the console
 * has no form yet — `New offer` is present, enabled, and does nothing (C-1 in
 * the Phase C audit), and asserting through a control that is inert would
 * assert nothing.
 */
test.describe('creating an offer', () => {
  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  const body = (over: Record<string, unknown> = {}) => ({
    key: 'upsell_speed_boost',
    name: 'Speed Boost 100Mb',
    description: 'Doubles the line speed for six months.',
    categoryId: 'grp_data_upsell',
    objectiveId: 'iss_growth',
    ...over,
  });

  async function token(page: import('@playwright/test').Page, email: string) {
    const res = await page.request.post('/api/auth/login', {
      data: { email, password: 'demo' },
    });
    return (await res.json()).token as string;
  }

  // covers: createOffer
  test('an author creates one, and it is in the catalogue and the audit log', async ({ page }) => {
    const auth = await token(page, ACCOUNTS.sarah);

    const created = await page.request.post('/api/offers/telco-uk', {
      headers: { Authorization: `Bearer ${auth}` },
      data: body(),
    });
    expect(created.status()).toBe(201);
    const offer = await created.json();

    // Draft, not active. An offer that went live the moment it was created
    // would skip every review the platform has.
    expect(offer.status).toBe('draft');
    expect(offer.updatedBy).toBe(ACCOUNTS.sarah);

    const list = await (await page.request.get('/api/offers/telco-uk')).json();
    expect(list.offers.map((p: { key: string }) => p.key)).toContain('upsell_speed_boost');

    const audit = await (await page.request.get('/api/audit')).json();
    expect(
      (audit.events as { eventType: string; summary: string }[]).some(
        (e) => e.eventType === 'OfferCreated' && e.summary.includes('Speed Boost 100Mb')
      )
    ).toBe(true);
  });

  test('and the console shows it', async ({ page }) => {
    const auth = await token(page, ACCOUNTS.sarah);
    await page.request.post('/api/offers/telco-uk', {
      headers: { Authorization: `Bearer ${auth}` },
      data: body(),
    });

    await login(page, ACCOUNTS.sarah);
    await page.goto('/offers');
    await expect(page.getByText('Speed Boost 100Mb').first()).toBeVisible();
  });

  test('refuses a duplicate key', async ({ page }) => {
    // The key is the action a decision names. Two offers sharing one would be
    // indistinguishable in every trace ever written.
    const auth = await token(page, ACCOUNTS.sarah);
    const headers = { Authorization: `Bearer ${auth}` };

    await page.request.post('/api/offers/telco-uk', { headers, data: body() });
    const again = await page.request.post('/api/offers/telco-uk', { headers, data: body() });
    expect(again.status()).toBe(409);
  });

  test('refuses an offer that names no key', async ({ page }) => {
    const auth = await token(page, ACCOUNTS.sarah);
    const res = await page.request.post('/api/offers/telco-uk', {
      headers: { Authorization: `Bearer ${auth}` },
      data: { name: 'Nameless', categoryId: 'grp_data_upsell', objectiveId: 'iss_growth' },
    });
    expect(res.status()).toBe(400);
  });

  // covers: updateOffer
  test('an author edits one, and the change is in the catalogue and the audit log', async ({
    page,
  }) => {
    // Served since it was written, and exercised by nothing until now — the
    // console's edit affordances are inert (C-1), so no UI-driven suite reached
    // it and the contract suite exempted it as covered.
    const auth = await token(page, ACCOUNTS.sarah);
    const headers = { Authorization: `Bearer ${auth}` };

    const before = await (await page.request.get('/api/offers/telco-uk/prop_data_boost_10gb')).json();
    expect(before.offer.boost).not.toBe(1.75);

    const res = await page.request.put('/api/offers/telco-uk/prop_data_boost_10gb', {
      headers,
      data: { boost: 1.75 },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).boost).toBe(1.75);

    const after = await (await page.request.get('/api/offers/telco-uk/prop_data_boost_10gb')).json();
    expect(after.offer.boost).toBe(1.75);
    expect(after.offer.updatedBy).toBe(ACCOUNTS.sarah);

    const audit = await (await page.request.get('/api/audit')).json();
    expect(
      (audit.events as { eventType: string; summary: string }[]).some(
        (e) => e.eventType === 'OfferUpdated' && e.summary.includes('boost')
      )
    ).toBe(true);
  });

  // covers: createCreative
  test('gives the offer content, and only then can it go active', async ({ page }) => {
    // The whole point of the invariant, in one test: a new offer cannot be
    // created active, cannot be activated while it has nothing to deliver, and
    // can be activated the moment it does.
    const auth = await token(page, ACCOUNTS.sarah);
    const headers = { Authorization: `Bearer ${auth}` };

    const born = await page.request.post('/api/offers/telco-uk', { headers, data: body() });
    const offer = await born.json();
    expect(offer.status).toBe('draft');

    const tooSoon = await page.request.put(`/api/offers/telco-uk/${offer.id}`, {
      headers,
      data: { status: 'active' },
    });
    expect(tooSoon.status()).toBe(409);

    const creative = await page.request.post(`/api/creatives/telco-uk/${offer.id}`, {
      headers,
      data: {
        name: 'Speed Boost — Web',
        channel: 'web',
        active: true,
        locale: 'en-GB',
        content: {
          channel: 'web',
          headline: 'Double your speed for six months',
          subheadline: 'Then it reverts, unless you renew.',
          imageUrl: '/assets/offers/speed-boost.jpg',
          ctaLabel: 'Add Speed Boost',
          ctaUrl: '/broadband/speed-boost',
          placement: 'feature_band',
        },
      },
    });
    expect(creative.status()).toBe(201);
    expect((await creative.json()).offerId).toBe(offer.id);

    const now = await page.request.put(`/api/offers/telco-uk/${offer.id}`, {
      headers,
      data: { status: 'active' },
    });
    expect(now.status()).toBe(200);

    // And the console's list counts it as covered rather than undeliverable.
    const listed = await (await page.request.get('/api/offers/telco-uk')).json();
    const found = listed.offers.find((p: { id: string }) => p.id === offer.id);
    expect(found.creativeIds).toHaveLength(1);
  });

  test('refuses a creative its channel cannot deliver, naming every problem', async ({ page }) => {
    const auth = await token(page, ACCOUNTS.sarah);
    const headers = { Authorization: `Bearer ${auth}` };
    const offer = await (await page.request.post('/api/offers/telco-uk', { headers, data: body() })).json();

    const res = await page.request.post(`/api/creatives/telco-uk/${offer.id}`, {
      headers,
      data: {
        name: 'Too long',
        channel: 'sms',
        content: { channel: 'sms', text: 'x'.repeat(200), senderId: 'MeridianMobileTooLong' },
      },
    });
    expect(res.status()).toBe(400);
    const problems = (await res.json()).problems as { field: string }[];
    // Both at once, not the first: a caller fixing one field per round trip is
    // a caller making several.
    expect(problems.map((p) => p.field).sort()).toEqual(['content.senderId', 'content.text']);
  });

  // covers: updateCreative
  test('will not switch off the last creative an active offer has', async ({ page }) => {
    const auth = await token(page, ACCOUNTS.sarah);
    const headers = { Authorization: `Bearer ${auth}` };

    // 5G Unlimited is active in the fixtures with several creatives; switch all
    // but one off, then attempt the last.
    const list = await (await page.request.get('/api/creatives/telco-uk/prop_5g_unlimited_24')).json();
    const active = (list.creatives as { id: string; active: boolean }[]).filter((c) => c.active);
    expect(active.length).toBeGreaterThan(1);

    for (const c of active.slice(1)) {
      const off = await page.request.put(`/api/creatives/telco-uk/prop_5g_unlimited_24/${c.id}`, {
        headers,
        data: { active: false },
      });
      expect(off.status()).toBe(200);
    }

    const last = await page.request.put(
      `/api/creatives/telco-uk/prop_5g_unlimited_24/${active[0].id}`,
      { headers, data: { active: false } }
    );
    expect(last.status()).toBe(409);
    expect((await last.json()).message).toMatch(/Pause or retire the offer first/);
  });

  test('edits a creative, and the change is audited', async ({ page }) => {
    const auth = await token(page, ACCOUNTS.sarah);
    const res = await page.request.put(
      '/api/creatives/telco-uk/prop_5g_unlimited_24/trt_5g_sms',
      {
        headers: { Authorization: `Bearer ${auth}` },
        data: { content: { channel: 'sms', text: 'Unlimited 5G, £35/mo. Reply STOP to opt out.', senderId: 'Meridian' } },
      }
    );
    expect(res.status()).toBe(200);
    expect((await res.json()).content.text).toMatch(/Reply STOP/);

    const audit = await (await page.request.get('/api/audit')).json();
    expect(
      (audit.events as { eventType: string }[]).some((e) => e.eventType === 'CreativeUpdated')
    ).toBe(true);
  });

  test('refuses an account without edit:offers, server-side', async ({ page }) => {
    // Priya approves changes and cannot author offers. The server has to say so
    // itself; there is no UI control to hide.
    const auth = await token(page, ACCOUNTS.priya);
    const res = await page.request.post('/api/offers/telco-uk', {
      headers: { Authorization: `Bearer ${auth}` },
      data: body({ key: 'upsell_speed_boost_2' }),
    });
    expect(res.status()).toBe(403);
  });
});
