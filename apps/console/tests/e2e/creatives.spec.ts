import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';
import { creatives } from '@/mocks/fixtures/catalogue';

/**
 * Counts come from the fixture, not from literals.
 *
 * The seeded tenant holds hundreds of creatives across 251 offers, and writing
 * the number down meant editing this file every time the seed grew — a stale
 * literal is a test that fails for the wrong reason. What these assert is
 * unchanged: that the library is across offers rather than scoped to one, and
 * that each filter genuinely narrows.
 */
const ALL = creatives.length;

/**
 * The content library.
 *
 * Creatives were reachable only through the offer that owns them, so the
 * questions this page answers had no answer at all: what content exists, what
 * is switched off, where is that line of copy. These assert the questions
 * rather than the markup — a table that renders and cannot be filtered is a
 * list, not a library.
 */

test.describe('the content library', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/creatives');
  });

  test('lists content across every offer, not one offer at a time', async ({ page }) => {
    // The whole point: the offer detail page shows four creatives, this shows
    // all of them, and the count is the assertion that it did not quietly
    // scope itself to one.
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    await expect(page.getByText(`${ALL} of ${ALL} creatives`)).toBeVisible();
    // More than any single offer holds, which is the thing being checked.
    expect(await rows.count()).toBeGreaterThan(8);

    // Content from more than one offer on the page, so "across offers" is
    // checked rather than assumed.
    const owners = await page.locator('tbody tr').getByRole('link').allInnerTexts();
    expect(new Set(owners).size).toBeGreaterThan(1);
  });

  test('shows the line each channel actually leads with', async ({ page }) => {
    // An email's subject, an SMS's text. Picking "the first string" would show
    // a from-address, which reads as content and is not. Filtered to the offer
    // these lines belong to: with hundreds of creatives they are not on the
    // first page, and this test is about the line, not about pagination.
    await page.getByLabel('Search content').fill('5G Unlimited');
    await expect(page.getByText('Your network, unlimited')).toBeVisible();
    await expect(page.getByText(/Running out of data again/)).toBeVisible();
  });

  test('finds a line of copy without knowing which offer owns it', async ({ page }) => {
    // The compliance question — "show me every piece of content that says X" —
    // which had no answer before this page.
    await page.getByLabel('Search content').fill('roaming');
    const narrowed = page.locator('tbody tr');
    await expect(narrowed.first()).toBeVisible();
    const hits = await narrowed.count();
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(ALL);

    await page.getByLabel('Search content').fill('');
    await expect(page.getByText(`${ALL} of ${ALL} creatives`)).toBeVisible();
  });

  test('narrows to a channel', async ({ page }) => {
    await page.getByLabel('Channel').selectOption('web');
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThan(ALL);
    // Web is the only channel with a placement, so the column stops being dashes.
    await page.getByLabel('Search content').fill('5G Unlimited');
    await expect(page.getByText('account_dashboard_hero')).toBeVisible();
  });

  test('separates written from delivering', async ({ page }) => {
    // The lens that makes the page worth opening: content that exists and is
    // not reaching anyone.
    await page.getByRole('radio', { name: /Switched off/ }).click();
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThan(ALL);
    await expect(page.getByText('off').first()).toBeVisible();
  });

  test('edits content from here, without going via the offer', async ({ page }) => {
    await page.getByLabel('Search content').fill('Your network');
    await page.getByRole('button', { name: 'Edit' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Subject').fill('Your network, unlimited — last week');
    await dialog.getByRole('button', { name: 'Save creative' }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText('Your network, unlimited — last week')).toBeVisible();
    await resetStore(page);
  });

  test('links back to the offer that owns the content', async ({ page }) => {
    // A creative belongs to exactly one offer, and the page says so by making
    // the offer the only navigable thing on the row.
    await page.getByLabel('Search content').fill('5G Unlimited');
    await page.getByRole('link', { name: '5G Unlimited 24mo' }).first().click();
    await expect(page).toHaveURL(/\/offers\/prop_5g_unlimited_24$/);
  });

  test('offers no edit control to an account that cannot author', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await login(page, ACCOUNTS.priya);
    await page.goto('/creatives');

    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });
});
