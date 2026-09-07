import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * Authoring an offer and its content, from the console.
 *
 * This is the gap the configurability audit turned on: the controls existed,
 * were enabled, and did nothing. These drive them the way a person does — click
 * the button, fill the form, read what comes back — rather than posting to the
 * API, because the API has its own suite and what was missing was everything
 * between the two.
 *
 * The order below is the order it happens in: a new offer is a draft, it cannot
 * go active with nothing to deliver, and it can the moment it has something.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function newOffer(page: Page, name: string) {
  await page.goto('/offers');
  await page.getByRole('button', { name: 'New offer' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Objective').selectOption('iss_growth');
  await dialog.getByLabel('Category').selectOption('grp_data_upsell');
  await dialog.getByLabel('Price / month').fill('8.00');
  await dialog.getByLabel('Expected margin').fill('210.00');
  await dialog.getByRole('button', { name: 'Create offer' }).click();
  return dialog;
}

test.describe('authoring an offer', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
  });

  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  test('creates one, and it opens as a draft', async ({ page }) => {
    await newOffer(page, 'Speed Boost 100Mb');

    // Straight to the offer, because it has no creative and cannot be
    // delivered — the thing to do next is on this page.
    await expect(page).toHaveURL(/\/offers\/prop_speed_boost_100mb$/);
    await expect(page.getByRole('heading', { name: /Speed Boost 100Mb/ })).toBeVisible();
    await expect(page.getByText('draft').first()).toBeVisible();
  });

  test('suggests a key from the name, and locks it once the offer exists', async ({ page }) => {
    // The key is the action every decision record names. Suggesting it saves a
    // step; changing it later would orphan history.
    await page.goto('/offers');
    await page.getByRole('button', { name: 'New offer' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Speed Boost 100Mb');
    await expect(dialog.getByLabel('Key')).toHaveValue('speed_boost_100mb');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.goto('/offers/prop_5g_unlimited_24');
    await page.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page.getByRole('dialog').getByLabel('Key')).toBeDisabled();
  });

  test('refuses to activate an offer with nothing to deliver, and says why', async ({ page }) => {
    await newOffer(page, 'Speed Boost 100Mb');
    await page.getByRole('button', { name: 'Activate' }).click();

    // Not `getByRole('alert')`: Next renders its route announcer with that
    // role too, so the role alone is ambiguous.
    await expect(page.getByText(/has no active creative/)).toBeVisible();
    // Still a draft: the refusal is real, not cosmetic.
    await expect(page.getByText('draft').first()).toBeVisible();
  });

  test('adds a creative, puts each refusal on its own field, then activates', async ({ page }) => {
    await newOffer(page, 'Speed Boost 100Mb');
    await page.getByRole('button', { name: 'Add the first creative' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Speed Boost — SMS');
    await dialog.getByLabel('Channel').selectOption('sms');
    await dialog.getByLabel('Message').fill('x'.repeat(200));
    await dialog.getByLabel('Sender id').fill('MeridianMobileLong');

    // The counter is the cheap half of the same information.
    await expect(dialog.getByText('200 / 160 characters')).toBeVisible();

    await dialog.getByRole('button', { name: 'Add creative' }).click();

    // Both problems, each against its own input, rather than one sentence at
    // the top that makes the person hunt.
    await expect(dialog.getByText(/the limit is 160/)).toBeVisible();
    await expect(dialog.getByText(/carriers allow 11/)).toBeVisible();
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Message').fill('Double your speed for 6 months.');
    await dialog.getByLabel('Sender id').fill('Meridian');
    await dialog.getByLabel('Delivery').selectOption('active');
    await dialog.getByRole('button', { name: 'Add creative' }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText('Speed Boost — SMS')).toBeVisible();

    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  test('edits a creative through the console', async ({ page }) => {
    await page.goto('/offers/prop_5g_unlimited_24');
    // The creative's own Edit, not the offer's.
    await page.getByRole('button', { name: 'Edit' }).nth(1).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The channel is fixed once the creative exists: the content shape is the
    // channel's, and changing it would leave fields belonging to neither.
    await expect(dialog.getByLabel('Channel')).toBeDisabled();

    await dialog.getByLabel('Subject').fill('Your network, unlimited — one week left');
    await dialog.getByRole('button', { name: 'Save creative' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('one week left')).toBeVisible();
  });

  test('offers nothing to write with to an account that cannot author', async ({ page }) => {
    // Priya approves changes and cannot author offers. No control at all,
    // rather than a control that fails on click.
    //
    // Signed out first: `login` drives the real form, and /login redirects an
    // account that already has a session, so a second login in one test never
    // sees the form.
    await page.evaluate(() => localStorage.clear());
    await login(page, ACCOUNTS.priya);
    await page.goto('/offers');
    await expect(page.getByRole('button', { name: 'New offer' })).toHaveCount(0);

    await page.goto('/offers/prop_5g_unlimited_24');
    await expect(page.getByRole('button', { name: 'Add creative' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Activate' })).toHaveCount(0);
  });

  test('both dialogs are accessible', async ({ page }) => {
    // The axe sweep walks routes, and a dialog is not a route — so these were
    // outside it by construction.
    await page.goto('/offers');
    await page.getByRole('button', { name: 'New offer' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);

    await page.goto('/offers/prop_5g_unlimited_24');
    await page.getByRole('button', { name: 'Add creative' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations).toEqual([]);
  });
});
