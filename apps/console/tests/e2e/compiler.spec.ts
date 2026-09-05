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

  test('flags a flow that fails to compile in the list', async ({ page }) => {
    await page.goto('/decision-flows');

    const row = page.getByRole('row').filter({ hasText: 'plan-fit-nudges' });

    // The visible summary, and the glyph's accessible name for anyone who
    // cannot see the colour.
    await expect(row.getByText('2 errors', { exact: true })).toBeVisible();
    await expect(row.getByText('2 compile errors')).toBeAttached();

    // The health ring reports the same thing at the top of the page.
    await expect(page.getByText('Compilation')).toBeVisible();
    await expect(page.getByText('blocked')).toBeVisible();
  });

  test('shows why it fails, and what to do about it', async ({ page }) => {
    await page.goto('/decision-flows/plan-fit-nudges');

    await expect(page.getByText('Blocked.')).toBeVisible();

    // The specific defect, not a generic failure. Exact, because the registry
    // log on the same page also names the codes in its refusal summary — which
    // is the compilation gate working, not a duplicate.
    await expect(page.getByText('NO_ARBITRATION', { exact: true })).toBeVisible();
    await expect(
      page.getByText('The flow has no arbitrate node, so it can never select a winner.')
    ).toBeVisible();

    // A remedy, phrased for someone who is not the compiler author.
    await expect(page.getByText('Add an arbitrate node as the final step.')).toBeVisible();

    // The undeliverable-offer check, which the offers page also surfaces.
    await expect(page.getByText('NO_DELIVERABLE_CREATIVE', { exact: true })).toBeVisible();
  });

  test('shows a passing flow with its pinned versions and cost', async ({ page }) => {
    await page.goto('/decision-flows/next-best-action');

    await expect(page.getByText('passing')).toBeVisible();
    await expect(page.getByText('Validated against the catalogue')).toBeVisible();

    // Pinning is the reason replay works, so it has to be visible.
    await expect(page.getByText('Pinned at compile time')).toBeVisible();
    await expect(page.getByText(/@metis\/nodes-core@1\.4\.0/)).toBeVisible();
    await expect(page.getByText(/adm_accept_v4@4\.2\.0/)).toBeVisible();

    // Critical path against budget, not the sum of every node — and it now
    // includes the connectors the source node waits on, which is why this is
    // 23.9ms rather than the 11.9ms it was before integrations existed.
    await expect(page.getByText('Critical path')).toBeVisible();
    await expect(page.getByText(/23\.9ms \/ 50ms/)).toBeVisible();
  });

  test('surfaces the missing-score warning that made a flow return nothing', async ({
    page,
  }) => {
    await page.goto('/decision-flows/inbound-web-offers');

    await expect(page.getByText('ARBITRATION_MISSING_SCORE', { exact: true })).toBeVisible();
    // Twice on this page now: once in the compile report, once in the warnings
    // the registry kept with the published version. Both should say it — a
    // version that shipped with a warning is a different thing to explain later
    // than one that shipped clean.
    await expect(page.getByText(/no scoring node runs before it/)).toHaveCount(2);
  });
});
