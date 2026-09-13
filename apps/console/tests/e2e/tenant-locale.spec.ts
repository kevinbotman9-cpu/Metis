import { test, expect, type Page } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * A tenant reads in its own locale, and an administrator can change it from the
 * screen. G-092.
 *
 * Until 2026-09-13 there was no tenant locale anywhere: `'en-GB'` was written at
 * 77 call sites, so a demo for a US carrier showed every date day-first and
 * every grouped number to British convention, beside a catalogue, copy and
 * tenant that were American. The proof asked for is the one this test makes —
 * switch the locale by clicking, and watch dates and money change on screens
 * that have nothing to do with settings.
 *
 * Setup is a sign-in. The switch is made through the descriptor form on
 * `/settings`, and every assertion reads what a person sees.
 */

/** "Sep 05, 02:30 PM": an audit timestamp as en-US writes it. */
const US_STAMP = /^[A-Z][a-z]{2} \d{2}, \d{2}:\d{2}\s(AM|PM)$/;
/** "05. Sept., 14:30": the same shape as de-DE writes it. */
const DE_STAMP = /^\d{2}\. [A-Za-zä]+\.?, \d{2}:\d{2}$/;
/** "$1,234.56". */
const US_TOTAL = /^\$[\d,]+\.\d{2}$/;
/** "1.234,56 €", with ICU's no-break space before the symbol. */
const DE_TOTAL = /^[\d.]+,\d{2}\s€$/;

/** The realised-value figure on the performance overview. */
const realisedValue = (page: Page) =>
  page.getByText('Realised value', { exact: true }).locator('xpath=following-sibling::p[1]');

test.describe('the tenant reads in its own locale @screen-only', () => {
  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  test('switching the tenant locale changes dates and money on every screen', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);

    // --- As seeded: an American tenant, read the American way. -------------
    await page.goto('/audit');
    await expect(page.locator('main').getByText(US_STAMP).first()).toBeVisible();

    await page.goto('/performance');
    await expect(realisedValue(page)).toHaveText(US_TOTAL);

    // --- The switch, made by clicking. -------------------------------------
    await page.goto('/settings');
    const card = page.locator('main');
    // The fifth of September, which en-US writes month first.
    await expect(card.getByText('9/5/2026', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Edit tenant settings' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Locale').selectOption('de-DE');
    await dialog.getByLabel('Currency').selectOption('EUR');
    await dialog.getByRole('button', { name: 'Save settings' }).click();
    await expect(dialog).toHaveCount(0);

    // The card is formatted by the same formatter as every other screen, so it
    // changes the moment the settings do.
    await expect(card.getByText('5.9.2026', { exact: true })).toBeVisible();

    // --- Screens that have nothing to do with settings. --------------------
    // Asserted present before asserted absent: a `toHaveCount(0)` that runs
    // before the page renders passes against nothing, and one did here once.
    await page.goto('/audit');
    await expect(page.locator('main').getByText(DE_STAMP).first()).toBeVisible();
    await expect(page.locator('main').getByText(US_STAMP)).toHaveCount(0);

    await page.goto('/performance');
    await expect(realisedValue(page)).toHaveText(DE_TOTAL);

    // And the change is evidence, not only formatting.
    await page.goto('/audit');
    await expect(page.getByText('TenantSettingsChanged').first()).toBeVisible();
  });

  test('an account that cannot change the settings is told why, not shown a dead control', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/settings');
    await expect(page.getByText('A date reads')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit tenant settings' })).toHaveCount(0);
    await expect(page.getByText(/needs the admin:settings permission/)).toBeVisible();
  });
});
