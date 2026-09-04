import { test, expect } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * The console has to stay usable at the volume the gap register assumes
 * ("virtualised 100k+ rows"), and the search has to be one box rather than a
 * field per parameter.
 */

test.describe('virtualised decision grid', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/decisions');
    await expect(page.getByText(/Only the visible rows are rendered/)).toBeVisible();
  });

  test('renders a window, not five thousand rows', async ({ page }) => {
    const rendered = await page.locator('tr[data-row]').count();

    expect(rendered).toBeGreaterThan(5);
    // The whole point: DOM cost is bounded regardless of result size.
    expect(rendered).toBeLessThan(100);
    await expect(page.getByText(/of 5,000/)).toBeVisible();
  });

  test('advances the window when scrolled, keeping the DOM bounded', async ({ page }) => {
    const status = page.getByText(/Showing rows/);
    await expect(status).toContainText('Showing rows 1');

    const firstBefore = await page.locator('tr[data-row] td').first().innerText();

    const scroller = page.locator('div.overflow-auto').filter({ has: page.locator('tr[data-row]') });
    await scroller.hover();
    await page.mouse.wheel(0, 20000);
    await expect(status).not.toContainText('Showing rows 1–');

    const firstAfter = await page.locator('tr[data-row] td').first().innerText();
    expect(firstAfter).not.toBe(firstBefore);

    // Still bounded after scrolling a long way.
    expect(await page.locator('tr[data-row]').count()).toBeLessThan(100);
  });

  test('opens the trace for a row scrolled into view', async ({ page }) => {
    const scroller = page.locator('div.overflow-auto').filter({ has: page.locator('tr[data-row]') });
    await scroller.hover();
    await page.mouse.wheel(0, 8000);
    await expect(page.getByText(/Showing rows/)).not.toContainText('Showing rows 1–');

    const row = page.locator('tr[data-row]').nth(2);
    const id = (await row.locator('td').first().innerText()).trim();
    await row.click();

    await expect(page).toHaveURL(new RegExp(`/decisions/${id}$`));
  });
});

test.describe('smart search', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/decisions');
  });

  test('replaces the row of separate filter inputs with one box', async ({ page }) => {
    await expect(page.getByRole('combobox', { name: 'Search and filter' })).toBeVisible();
    // The old pattern: a labelled input per parameter.
    await expect(page.getByLabel('Channel', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Outcome', { exact: true })).toHaveCount(0);
  });

  /** Pull just the total out of "Showing rows 1-29 of 5,000." */
  async function totalRows(page: import('@playwright/test').Page) {
    const text = await page.getByText(/Showing rows/).innerText();
    const match = text.match(/of ([\d,]+)/);
    return Number((match?.[1] ?? '0').replace(/,/g, ''));
  }

  test('narrows results with a facet, and shows it as a dismissible chip', async ({ page }) => {
    const totalBefore = await totalRows(page);
    expect(totalBefore).toBe(5000);

    await page.getByRole('combobox', { name: 'Search and filter' }).click();
    await page.getByRole('option', { name: /^Outcome/ }).click();
    await page.getByRole('option', { name: 'Outcome: Suppressed' }).click();

    // The choice becomes a chip.
    await expect(page.getByText('Outcome: Suppressed')).toBeVisible();

    // And it actually narrows the data.
    const totalAfter = await totalRows(page);
    expect(totalAfter).toBeLessThan(totalBefore);
    expect(totalAfter).toBeGreaterThan(0);
    await expect(page.locator('tr[data-row]').first().getByText('no offer')).toBeVisible();

    // Dismissing restores the full set.
    await page.getByRole('button', { name: /Remove filter Outcome: Suppressed/ }).click();
    expect(await totalRows(page)).toBe(totalBefore);
  });

  test('accepts a typed facet query', async ({ page }) => {
    const box = page.getByRole('combobox', { name: 'Search and filter' });
    await box.fill('channel:sms');
    await page.keyboard.press('Enter');

    await expect(page.getByText('Channel: SMS')).toBeVisible();
    await expect(page.locator('tr[data-row]').first().getByText('sms')).toBeVisible();
  });

  test('removes the last chip on backspace in an empty box', async ({ page }) => {
    const box = page.getByRole('combobox', { name: 'Search and filter' });
    await box.fill('channel:sms');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Channel: SMS')).toBeVisible();

    await box.press('Backspace');
    await expect(page.getByText('Channel: SMS')).toHaveCount(0);
  });
});

test('breadcrumbs place a detail page in the hierarchy', async ({ page }) => {
  await login(page, ACCOUNTS.marcus);
  await page.goto('/decisions');
  await page.locator('tr[data-row]').first().click();

  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs).toBeVisible();
  await expect(crumbs.getByText('Decisioning')).toBeVisible();

  await crumbs.getByRole('link', { name: 'Decisions' }).click();
  await expect(page).toHaveURL(/\/decisions$/);
});
