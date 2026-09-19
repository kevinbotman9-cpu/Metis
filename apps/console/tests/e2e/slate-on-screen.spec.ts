import { test, expect, type APIRequestContext } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * The screens say what a decision showed — ADR-020 §1, on the screen.
 *
 * Found by driving the storefront on 2026-09-18. The record held a slate of
 * three and the trace said "5 candidates, one offered" over a funnel that said
 * three; the score table marked only slot 1, so slots 2 and 3 read like the two
 * candidates ranked below the last slot; /decisions showed slot 1 alone.
 *
 * Not tagged `@screen-only`: the decision is made through the API so the test
 * holds a known three-offer slate, and the storefront journey that makes one by
 * clicking is `storefront-reporting.spec.ts`.
 */

const TENANT = 'telco-us';

/** An input every offer on the email send qualifies for — see `ledger.spec.ts`. */
const request = (slotCount: number, occurredAt = '2026-06-01T12:00:00.000Z') => ({
  artifactId: 'next-best-action',
  request: {
    tenantId: TENANT,
    customerId: 'cust_probe_1',
    channel: 'email',
    placement: 'weekly_offers_send',
    slotCount,
    occurredAt,
    input: {
      customer: {
        age: 41,
        account_status: 'active',
        credit_status: 'pass',
        moving_within_days: 999,
        broadband: { status: 'active', product: 'dsl' },
        ott: { disney: false, netflix: false },
        usage: { pct_of_allowance_3mo_avg: 0.9, months_of_history: 12 },
      },
      context: {},
    },
    consent: { marketing: true, profiling: true, thirdParty: true },
  },
});

async function decide(api: APIRequestContext, slotCount: number, occurredAt?: string) {
  const res = await api.post('/api/decisions', { data: request(slotCount, occurredAt) as never });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return { id: body.id as string, shown: (body.decision.slate as { action: string }[]).map((e) => e.action) };
}

test.describe('what a decision showed, on the screens that show it', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
  });

  test('the trace of a three-offer decision says three, and marks each slot', async ({ page, request: api }) => {
    const made = await decide(api, 3);
    expect(made.shown, 'the fixture must show three offers').toHaveLength(3);

    await page.goto(`/decisions/${made.id}`);
    await expect(page.getByText(/candidates, 3 offered$/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('3 were offered', { exact: true })).toBeVisible();
    await expect(page.getByText(/one offered/)).toHaveCount(0);
    // The identity line names all three, in slot order.
    for (const [i, action] of made.shown.entries()) {
      await expect(page.getByText(`${i + 1}. ${action}`, { exact: true }).first()).toBeVisible();
    }
    // The score table marks slots 2 and 3, not only slot 1.
    const table = page.getByRole('table').filter({ hasText: 'Priority' }).first();
    for (const slot of [1, 2, 3]) await expect(table.getByText(`slot ${slot}`, { exact: true })).toBeVisible();
    await expect(table.getByText('winner', { exact: true })).toHaveCount(0);
  });

  test('a single-offer decision still reads as one, with its winner', async ({ page, request: api }) => {
    const made = await decide(api, 1);
    await page.goto(`/decisions/${made.id}`);
    await expect(page.getByText(/candidates, one offered$/)).toBeVisible({ timeout: 20_000 });
    const table = page.getByRole('table').filter({ hasText: 'Priority' }).first();
    await expect(table.getByText('winner', { exact: true })).toBeVisible();
  });

  test('/decisions shows every offer a decision showed', async ({ page, request: api }) => {
    // After the seeded corpus ends, so it is on the first page of a list
    // sorted newest first — the corpus runs to 2026-09-04.
    const made = await decide(api, 3, '2027-01-01T12:00:00.000Z');
    await page.goto('/decisions');
    // The id is text in a clickable row, not a link of its own.
    const row = page.getByRole('row').filter({ hasText: made.id });
    await expect(row).toBeVisible({ timeout: 20_000 });
    for (const [i, action] of made.shown.entries()) {
      await expect(row.getByText(`${i + 1}. ${action}`, { exact: true })).toBeVisible();
    }
  });
});
