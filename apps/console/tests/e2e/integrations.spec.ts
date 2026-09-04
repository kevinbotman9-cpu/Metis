import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * Integrations, from configuration through to the trace.
 *
 * The claim being tested is the one that makes the feature worth having: a
 * connector configured here is actually used when a decision is made, and the
 * decision still replays.
 */

test.describe('integrations', () => {
  test.beforeEach(async ({ page }) => {
    await resetStore(page);
    await login(page, ACCOUNTS.marcus);
    await page.goto('/integrations');
  });

  test('lists the configured connectors and what each supplies', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible();

    const row = page.getByRole('row').filter({ hasText: 'Billing ledger' });
    await expect(row).toBeVisible();
    // The fields it binds are the contract with the policies.
    await expect(row.getByText('monthlySpend')).toBeVisible();
    await expect(row.getByText('arrearsDays')).toBeVisible();
  });

  test('flags a connector that cannot fit the latency budget', async ({ page }) => {
    // The bureau declares 180ms against a 50ms budget. Saying so here is the
    // whole point of declaring latency at configuration time.
    await expect(
      page.getByText('Some connectors cannot be called synchronously')
    ).toBeVisible();
    await expect(page.getByText(/Credit bureau declares 180ms/)).toBeVisible();
  });

  test('deactivating a connector persists and is audited', async ({ page }) => {
    const row = page.getByRole('row').filter({ hasText: 'Network usage' });
    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(row.getByText('Inactive')).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('row').filter({ hasText: 'Network usage' }).getByText('Inactive')
    ).toBeVisible();

    await page.goto('/audit');
    await expect(page.getByText('ConnectorChanged').first()).toBeVisible();
  });

});

test.describe('integrations, without the permission', () => {
  // Its own describe: the block above signs in as an administrator, and the
  // login helper cannot sign a second account in over a live session.
  test('a compliance officer can read but not toggle', async ({ page }) => {
    await resetStore(page);
    await login(page, ACCOUNTS.priya);
    await page.goto('/integrations');

    await expect(page.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible();
    // Readable, not editable: compliance has to see what feeds a decision
    // without being able to change what a decision can see.
    await expect(page.getByRole('row').filter({ hasText: 'Billing ledger' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);
  });
});

test.describe('integration provenance in the trace', () => {
  test.beforeEach(async ({ page }) => {
    await resetStore(page);
    await login(page, ACCOUNTS.marcus);
  });

  test('a decision records which connector supplied which field', async ({ page }) => {
    await page.goto('/decisions');
    const id = (await page.locator('tr[data-row] td').first().innerText()).trim();
    await page.goto(`/decisions/${id}`);

    await expect(page.getByRole('heading', { name: 'Where the data came from' })).toBeVisible();
    // Provenance names the connector and the node, not just the field.
    await expect(page.getByText(/via conn_/).first()).toBeVisible();
    await expect(page.getByText(/at node source_/).first()).toBeVisible();
  });

  test('replay still reproduces a decision that used an integration', async ({ page }) => {
    // The property the whole design exists to protect. Replay calls no
    // connector; it re-executes against the recorded snapshot.
    await page.goto('/decisions');
    const id = (await page.locator('tr[data-row] td').first().innerText()).trim();
    await page.goto(`/decisions/${id}`);

    await page.getByRole('button', { name: /Replay/ }).click();
    await expect(page.getByText(/identical|reproduced|matches/i).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
