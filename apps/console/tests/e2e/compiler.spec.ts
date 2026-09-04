import { test, expect } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * The compiler is only useful if its findings reach the person who can act on
 * them. These assert the verdict is visible, specific, and tells them what to do.
 */

test.describe('compiler output in the console', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test('flags a strategy that fails to compile in the list', async ({ page }) => {
    await page.goto('/strategies');

    const row = page.getByRole('row').filter({ hasText: 'plan-fit-nudges' });
    await expect(row.getByText(/error/)).toBeVisible();
    await expect(page.getByText('Failing compilation')).toBeVisible();
  });

  test('shows why it fails, and what to do about it', async ({ page }) => {
    await page.goto('/strategies/plan-fit-nudges');

    await expect(page.getByText('Blocked.')).toBeVisible();

    // The specific defect, not a generic failure.
    await expect(page.getByText('NO_ARBITRATION')).toBeVisible();
    await expect(
      page.getByText('The strategy has no arbitrate node, so it can never select a winner.')
    ).toBeVisible();

    // A remedy, phrased for someone who is not the compiler author.
    await expect(page.getByText('Add an arbitrate node as the final step.')).toBeVisible();

    // The undeliverable-offer check, which the propositions page also surfaces.
    await expect(page.getByText('NO_DELIVERABLE_TREATMENT')).toBeVisible();
  });

  test('shows a passing strategy with its pinned versions and cost', async ({ page }) => {
    await page.goto('/strategies/next-best-action');

    await expect(page.getByText('passing')).toBeVisible();
    await expect(page.getByText('Validated against the catalogue')).toBeVisible();

    // Pinning is the reason replay works, so it has to be visible.
    await expect(page.getByText('Pinned at compile time')).toBeVisible();
    await expect(page.getByText(/@metis\/nodes-core@1\.4\.0/)).toBeVisible();
    await expect(page.getByText(/adm_accept_v4@4\.2\.0/)).toBeVisible();

    // Critical path against budget, not the sum of every node.
    await expect(page.getByText('Critical path')).toBeVisible();
    await expect(page.getByText(/11\.9ms \/ 50ms/)).toBeVisible();
  });

  test('surfaces the missing-score warning that made a strategy return nothing', async ({
    page,
  }) => {
    await page.goto('/strategies/inbound-web-offers');

    await expect(page.getByText('ARBITRATION_MISSING_SCORE')).toBeVisible();
    await expect(page.getByText(/no scoring node runs before it/)).toBeVisible();
  });
});
