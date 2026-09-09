import { test, expect, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, ACCOUNTS } from './helpers';

/**
 * Shadow mode, end to end.
 *
 * The mechanism is asynchronous by design — the shadow runs after the response
 * is sent, so it cannot enter the active latency budget — so these tests drain
 * it rather than sleep. A sleep here would be a flake with a timer attached.
 */

/**
 * Authenticated at the API level, not through the page.
 *
 * Playwright's `request` context does not share the browser context's session,
 * so a page login leaves it anonymous — the registry endpoints answered 401
 * until this was fixed. Decisions and outcomes happen not to require auth,
 * which is why the earlier suites got away without it.
 */
async function tokenFor(api: APIRequestContext, email: string): Promise<string> {
  const res = await api.post('/api/auth/login', { data: { email, password: 'demo' } as never });
  return (await res.json()).token;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const TENANT = 'telco-uk';
const FLOW = 'next-best-action';
/**
 * A shadow is another *version of the same flow*, not another flow.
 *
 * This pointed at `inbound-web-offers` at first and got a 404 — which was the
 * registry being right. 2.3.1 is the version before the active 2.4.0, and it
 * could not select `addon_roaming`, so the two genuinely disagree.
 */
const OTHER = '2.3.1';

async function decide(api: APIRequestContext, customerId: string) {
  const res = await api.post('/api/decisions', {
    data: {
      artifactId: FLOW,
      request: {
        tenantId: TENANT,
        customerId,
        channel: 'email',
        placement: 'weekly_offers_send',
        occurredAt: '2026-06-01T12:00:00.000Z',
        input: { customer: { age: 41 } },
        consent: { marketing: true, profiling: true, thirdParty: false },
      },
    } as never,
  });
  return res.status();
}

const drain = (api: APIRequestContext) => api.post('/api/_test/drain');

const report = async (api: APIRequestContext, token: string, flow = FLOW) =>
  (await api.get(`/api/registry/${TENANT}/${flow}/shadow-report`, { headers: auth(token) })).json();

test.describe('shadow mode', () => {
  let token: string;

  test.beforeEach(async ({ request }) => {
    token = await tokenFor(request, ACCOUNTS.marcus);
  });

  test.afterEach(async ({ request }) => {
    await request.post('/api/_test/reset');
  });

  test('the report opens at zero, not at a hundred', async ({ request }) => {
    // "100% agreement, 0 compared" is the number somebody in a hurry reads as
    // a reason to cut over.
    const r = await report(request, token);
    expect(r.compared).toBe(0);
    expect(r.agreementRate).toBe(0);
    expect(r.shadowVersion).toBeNull();
  });

  // covers: setShadow
  test('a shadow does not change what is active', async ({ request }) => {
    const before = await (
      await request.get(`/api/registry/${TENANT}/${FLOW}`, { headers: auth(token) })
    ).json();
    const activeBefore = before.environments.find(
      (e: { environment: string }) => e.environment === 'production'
    )?.activeVersion;

    const res = await request.post(`/api/registry/${TENANT}/${FLOW}/shadow`, {
      headers: auth(token),
      data: { version: OTHER, environment: 'production' } as never,
    });
    expect(res.status()).toBe(200);
    const state = await res.json();

    // A shadow that changed the active version would be a promotion with a
    // quieter name.
    expect(state.activeVersion).toBe(activeBefore);
    expect(state.shadowVersion).toBe(OTHER);
  });

  test('shadowing a version against itself is refused', async ({ request }) => {
    const state = await (
      await request.get(`/api/registry/${TENANT}/${FLOW}`, { headers: auth(token) })
    ).json();
    const active = state.environments.find(
      (e: { environment: string }) => e.environment === 'production'
    )?.activeVersion;

    // A 100% agreement rate that means nothing is worse than no number.
    const res = await request.post(`/api/registry/${TENANT}/${FLOW}/shadow`, {
      headers: auth(token),
      data: { version: active, environment: 'production' } as never,
    });
    expect(res.status()).toBe(409);
  });

  test('decisions made while shadowing are compared and reported', async ({ request }) => {
    await request.post(`/api/registry/${TENANT}/${FLOW}/shadow`, {
      headers: auth(token),
      data: { version: OTHER, environment: 'production' } as never,
    });

    for (let i = 0; i < 5; i++) {
      expect(await decide(request, `cust_shadow_${i}`)).toBe(200);
    }
    await drain(request);

    const r = await report(request, token);
    expect(r.compared).toBe(5);
    expect(r.shadowVersion).toBe(OTHER);
    expect(r.agreementRate).toBeGreaterThanOrEqual(0);
    expect(r.agreementRate).toBeLessThanOrEqual(1);
    // Two genuinely different flows should not agree on everything, or the
    // comparison is not comparing.
    expect(r.agreed).toBeLessThan(r.compared);
    expect(r.topDivergences.length).toBeGreaterThan(0);
    // Every divergence names which of the three questions failed.
    for (const d of r.topDivergences) {
      expect(['winner', 'ranking', 'reasons']).toContain(d.kind);
    }
  });

  test('the shadow cost is published rather than hidden', async ({ request }) => {
    await request.post(`/api/registry/${TENANT}/${FLOW}/shadow`, {
      headers: auth(token),
      data: { version: OTHER, environment: 'production' } as never,
    });
    await decide(request, 'cust_cost');
    await drain(request);

    const r = await report(request, token);
    // It runs off the request path, so it never enters the active budget — but
    // it is not free, and a report that omitted the number would invite the
    // assumption that it was.
    expect(r.shadowMsP50).toBeGreaterThan(0);
    expect(r.shadowMsP95).toBeGreaterThanOrEqual(r.shadowMsP50);
  });

  test('no shadow means no comparisons, however many decisions are made', async ({ request }) => {
    await decide(request, 'cust_none_1');
    await decide(request, 'cust_none_2');
    await drain(request);
    expect((await report(request, token)).compared).toBe(0);
  });

  test('stopping clears the shadow and the report goes back to zero', async ({ request }) => {
    await request.post(`/api/registry/${TENANT}/${FLOW}/shadow`, {
      headers: auth(token),
      data: { version: OTHER, environment: 'production' } as never,
    });
    await decide(request, 'cust_stop');
    await drain(request);
    expect((await report(request, token)).compared).toBe(1);

    const stopped = await request.post(`/api/registry/${TENANT}/${FLOW}/shadow`, {
      headers: auth(token),
      data: { version: null, environment: 'production' } as never,
    });
    expect(stopped.status()).toBe(200);
    expect((await stopped.json()).shadowVersion).toBeNull();

    // The comparisons were about a pair that is no longer configured. Folding
    // them into the next shadow's rate would average across two migrations.
    const r = await report(request, token);
    expect(r.compared).toBe(0);
    expect(r.shadowVersion).toBeNull();
  });

  test('a flow that never compiled has no report, rather than a zeroed one', async ({
    request,
  }) => {
    // plan-fit-nudges is refused by the compiler, so it was never stored. A
    // report of "0 compared, nothing shadowing" would read as a shadow that is
    // merely idle rather than one that cannot exist, and the panel would offer
    // to start one against nothing.
    const res = await request.get(`/api/registry/${TENANT}/plan-fit-nudges/shadow-report`, {
      headers: auth(token),
    });
    expect(res.status()).toBe(404);
  });

  test('setting a shadow needs promote:flows', async ({ request }) => {
    // Sarah authors flows but cannot promote them, and a shadow is the step
    // before a cutover — same authority.
    const sarah = await tokenFor(request, ACCOUNTS.sarah);
    const res = await request.post(`/api/registry/${TENANT}/${FLOW}/shadow`, {
      headers: auth(sarah),
      data: { version: OTHER, environment: 'production' } as never,
    });
    expect(res.status()).toBe(403);
  });
});

/**
 * The panel a migration is argued from.
 *
 * Driven through the page rather than the API because the thing being checked
 * is what a person reads before deciding to cut over — in particular that an
 * unexercised shadow does not show a percentage.
 */
test.describe('the shadow panel', () => {
  const FLOW_PAGE = `/decision-flows/${FLOW}`;

  // Signed in per test rather than in a beforeEach: one of these is about a
  // different account, and logging in twice in one context does not swap it.
  test.afterEach(async ({ request }) => {
    await request.post('/api/_test/reset');
  });

  test('starting a shadow reports it without inventing a rate', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto(FLOW_PAGE);

    const panel = page.getByRole('region', { name: 'Shadow' }).or(
      page.locator('section', { has: page.getByRole('heading', { name: 'Shadow', exact: true }) })
    );
    await expect(page.getByText('Nothing shadowing')).toBeVisible();

    await page.getByLabel('Shadow version').selectOption(OTHER);
    await page.getByRole('button', { name: 'Start shadowing' }).click();

    // Configured but never exercised. A percentage here would be read as a
    // measurement, and there is nothing behind it yet.
    await expect(page.getByText(`${OTHER} is shadowing 2.4.0`)).toBeVisible();
    await expect(panel.getByText('no decisions compared')).toBeVisible();
    await expect(panel.getByText('—')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Stop shadowing' })).toBeVisible();
  });

  test('no panel at all for a flow the registry never accepted', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/decision-flows/plan-fit-nudges');

    // The registry panel explains why it is not there; a second panel offering
    // to shadow it would contradict that on the same screen.
    await expect(page.getByText('Not in the registry')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shadow', exact: true })).toHaveCount(0);
  });

  test('a person who cannot promote is not offered the control', async ({ page }) => {
    // Sarah authors flows. Starting a shadow is the step before a cutover, so
    // she can read the report and cannot change what is being compared.
    await login(page, ACCOUNTS.sarah);
    await page.goto(FLOW_PAGE);

    await expect(page.getByRole('heading', { name: 'Shadow', exact: true })).toBeVisible();
    await expect(page.getByLabel('Shadow version')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start shadowing' })).toHaveCount(0);
  });

  test('the panel is accessible while it is reporting', async ({ page, request }) => {
    const token = await tokenFor(request, ACCOUNTS.marcus);
    await request.post(`/api/registry/${TENANT}/${FLOW}/shadow`, {
      headers: auth(token),
      data: { version: OTHER, environment: 'production' } as never,
    });
    await decide(request, 'cust_a11y');
    await drain(request);

    await login(page, ACCOUNTS.marcus);
    await page.goto(FLOW_PAGE);
    await expect(page.getByText(`${OTHER} is shadowing 2.4.0`)).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`)
    ).toEqual([]);
  });
});
