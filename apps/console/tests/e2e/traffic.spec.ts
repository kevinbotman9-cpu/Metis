import { test, expect } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * Inbound traffic.
 *
 * covers: listInboundCalls
 * covers: clearInboundCalls
 *
 * The page exists to answer one question that had no answer: is the site
 * calling METIS, and with what. So the assertions are that question, not the
 * markup — a table of calls that cannot show a payload is a latency chart.
 *
 * Each test posts its own decision through the placement endpoint rather than
 * relying on traffic another spec happened to leave behind. The buffer is
 * process-wide, like the store, so anything else would pass or fail depending
 * on what ran first.
 */

const DECISION_BODY = {
  request: {
    tenantId: 'telco-uk',
    customerId: 'cust_0001',
    channel: 'web',
    occurredAt: '2026-09-07T12:00:00.000Z',
    input: {
      customer: { age: 29, credit_status: 'pass', account_status: 'active' },
      address: { fibre_available: true },
    },
    consent: { marketing: true, profiling: true, thirdParty: false },
  },
};

/** Drive one decision the way the storefront does, referer included. */
async function callAsStorefront(page: import('@playwright/test').Page) {
  const res = await page.request.post('/api/placements/telco-uk/homepage_hero/decisions', {
    data: DECISION_BODY,
    headers: { referer: 'http://localhost:3000/storefront/index.html' },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { decisionId: string };
}

test.describe('inbound traffic', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.request.post('/api/inbound-calls/clear');
  });

  test('shows a call the storefront made, with both payloads', async ({ page }) => {
    await callAsStorefront(page);
    await page.goto('/integrations/traffic');

    const row = page.getByRole('button', {
      name: /POST \/api\/placements\/telco-uk\/homepage_hero\/decisions — 200/,
    });
    await expect(row).toBeVisible();

    // Collapsed, the row says what happened. Expanded, it says what was said.
    await expect(page.getByText('"cust_0001"')).toHaveCount(0);
    await row.click();

    // The request the site sent — the thing the ledger deliberately does not keep.
    await expect(page.getByText(/"customerId": "cust_0001"/)).toBeVisible();
    await expect(page.getByText(/"fibre_available": true/)).toBeVisible();
    // And what went back.
    await expect(page.getByText(/"action": "acq_fibre_900"/)).toBeVisible();
  });

  test('links a call to the decision it produced', async ({ page }) => {
    // The correlation is the whole reason a request log beats devtools: from
    // "what did the site ask" to "why did it get that" without a copy-paste.
    const { decisionId } = await callAsStorefront(page);
    await page.goto('/integrations/traffic');

    await page
      .getByRole('button', { name: /POST \/api\/placements.*homepage_hero/ })
      .click();
    await page.getByRole('link', { name: decisionId }).click();

    await expect(page).toHaveURL(new RegExp(`/decisions/${decisionId}$`));
  });

  test('attributes the caller', async ({ page }) => {
    await callAsStorefront(page);
    await page.goto('/integrations/traffic');

    // Console traffic is on the page too — loading it makes some. The filter is
    // what separates "the site is calling" from "I am looking at the site".
    await expect(page.getByRole('button', { name: /from Storefront/ })).toHaveCount(1);

    await page.getByLabel('Caller').selectOption('console');
    await expect(page.getByRole('button', { name: /from Storefront/ })).toHaveCount(0);

    await page.getByLabel('Caller').selectOption('storefront');
    await expect(page.getByRole('button', { name: /from Storefront/ })).toHaveCount(1);
  });

  test('records a refusal with its reason', async ({ page }) => {
    // The calls worth having. A 400 that never reaches the log leaves the
    // integrator with a broken site and an empty page.
    const res = await page.request.post('/api/placements/telco-uk/homepage_hero/decisions', {
      data: { request: { tenantId: 'telco-uk', customerId: 'c', channel: 'web' } },
      headers: { referer: 'http://localhost:3000/storefront/index.html' },
    });
    expect(res.status()).toBe(400);

    await page.goto('/integrations/traffic');
    const row = page.getByRole('button', { name: /homepage_hero\/decisions — 400/ });
    await expect(row).toBeVisible();

    await row.click();
    // The banner, not the copy of the same word inside the response JSON —
    // both are on the page, and only one of them is the row telling you why.
    // Scoped by element rather than by `role=alert`: Next renders its route
    // announcer with that role, so it matches first and is always empty.
    await expect(page.locator('p', { hasText: 'bad_request' })).toBeVisible();
    await expect(
      page.getByText(/Missing required field: request.occurredAt/).first()
    ).toBeVisible();
  });

  test('does not record reads of itself', async ({ page }) => {
    // Regression. Recording the poll nests the whole log inside the next
    // response, and the ring fills with copies of itself in about a minute.
    await callAsStorefront(page);
    await page.goto('/integrations/traffic');
    await expect(page.getByRole('button', { name: /homepage_hero/ })).toBeVisible();

    // Let the poll run several times over.
    await page.waitForTimeout(5000);

    const res = await page.request.get('/api/inbound-calls?limit=250');
    const { calls } = (await res.json()) as { calls: { path: string }[] };
    expect(calls.filter((c) => c.path === '/api/inbound-calls')).toHaveLength(0);
  });

  test('clears on request', async ({ page }) => {
    await callAsStorefront(page);
    await page.goto('/integrations/traffic');
    await expect(page.getByRole('button', { name: /homepage_hero/ })).toBeVisible();

    await page.getByRole('button', { name: 'Clear log' }).click();

    // The clear records itself, so the log is not empty — it says what emptied it.
    await expect(page.getByRole('button', { name: /homepage_hero/ })).toBeHidden();
    await expect(page.getByRole('button', { name: /inbound-calls\/clear/ })).toBeVisible();
  });

  test('says what is missing when a caller has sent nothing', async ({ page }) => {
    // Not by emptying the log: opening the page is itself console traffic, so
    // "no calls at all" is a state the console cannot observe in itself. The
    // reachable empty state is a caller that has not called, which is also the
    // one somebody hits during a demo — the site is not wired up yet.
    await page.goto('/integrations/traffic');
    await expect(page.getByRole('button', { name: /from Console/ }).first()).toBeVisible();

    await page.getByLabel('Caller').selectOption('storefront');
    await expect(page.getByText('Nothing from Storefront yet.')).toBeVisible();
  });
});
