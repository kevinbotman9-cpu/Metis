import { test, expect } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * The regression suite for "the links are not working".
 *
 * Every nav item must resolve to a real page, not a 404 and not an error
 * boundary. This is the check that was claimed but never actually run.
 */

/**
 * `linkName` is the item's accessible name where it differs from its visible
 * label. Approvals folds its pending count into the name — the same shape the
 * notifications bell uses — so an exact match on the label alone would look
 * like a broken link when it is a working badge.
 */
const NAV_ITEMS: { label: string; heading: string | RegExp; linkName?: RegExp }[] = [
  { label: 'Home', heading: /Good to see you/ },
  { label: 'Offers', heading: 'Offers' },
  { label: 'Targeting Policies', heading: 'Targeting policies' },
  { label: 'Frequency Policy', heading: 'Frequency policy' },
  { label: 'Arbitration & Boosts', heading: 'Arbitration & boosts' },
  { label: 'Decision flows', heading: 'Decision flows' },
  { label: 'Decisions', heading: 'Decisions' },
  { label: 'Simulations', heading: 'Simulations' },
  { label: 'Approvals', heading: 'Approvals', linkName: /^Approvals(,|$)/ },
  { label: 'Agentic AI', heading: 'Agentic AI' },
  { label: 'Audit Log', heading: 'Audit log' },
  { label: 'Settings', heading: 'Settings' },
];

test.describe('navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  for (const item of NAV_ITEMS) {
    test(`${item.label} resolves to a real page`, async ({ page }) => {
      const nav = page.getByRole('navigation', { name: 'Main' });
      await nav
        .getByRole('link', item.linkName ? { name: item.linkName } : { name: item.label, exact: true })
        .click();

      await expect(page.getByRole('heading', { level: 1, name: item.heading })).toBeVisible();
      await expect(page.getByText('This page could not be found')).toHaveCount(0);
    });
  }

  test('marks the current page in the sidebar', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Decisions', exact: true }).click();
    await expect(
      nav.getByRole('link', { name: 'Decisions', exact: true })
    ).toHaveAttribute('aria-current', 'page');
  });

  test('an unknown decision shows a real empty state, not a crash', async ({ page }) => {
    await page.goto('/decisions/dec_does_not_exist');
    await expect(page.getByText(/No decision with ID dec_does_not_exist/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to decision search/ })).toBeVisible();
  });

  test('an unknown offer shows a real empty state', async ({ page }) => {
    await page.goto('/offers/prop_nope');
    await expect(page.getByText(/No offer with ID prop_nope/)).toBeVisible();
  });
});

test.describe('authentication', () => {
  test('redirects an anonymous visitor to login and returns them afterwards', async ({ page }) => {
    await page.goto('/offers');
    await expect(page).toHaveURL(/\/login\?next=%2Foffers/);

    await page.getByLabel('Email').fill(ACCOUNTS.sarah);
    await page.getByLabel('Password').fill('demo');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/offers$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Offers' })).toBeVisible();
  });

  test('rejects a wrong password without signing in', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ACCOUNTS.sarah);
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Scope to the form: Next.js injects its own role="alert" route announcer.
    await expect(
      page.locator('form').getByRole('alert')
    ).toContainText(/not recognised/);
    await expect(page).toHaveURL(/\/login/);
  });

  test('keeps the session across a reload', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('signing out returns to login and protects the app again', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.getByRole('button', { name: /Sarah Chen/ }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/login/);
    await page.goto('/audit');
    await expect(page).toHaveURL(/\/login/);
  });
});
