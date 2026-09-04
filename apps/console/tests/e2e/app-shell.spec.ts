import { test, expect } from '@playwright/test';
import { login, openAccountPanel, ACCOUNTS } from './helpers';

/**
 * The header band and the global tools that live on it.
 *
 * These are the things that apply on every page — search, notifications,
 * tenant, environment — so a regression here is a regression everywhere.
 */

test.describe('header band', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
  });

  test('states the environment and the tenant permanently', async ({ page }) => {
    const header = page.getByRole('banner');
    await expect(header.getByText('Development')).toBeVisible();

    await header.getByRole('button', { name: /telco/ }).click();
    await expect(page.getByText('Only one tenant is provisioned')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByText('Only one tenant is provisioned')).toBeHidden();
  });

  test('every header panel closes on Escape', async ({ page }) => {
    await page.getByRole('button', { name: /Notifications/ }).click();
    const notifications = page.getByRole('group', { name: 'Needs attention' });
    await expect(notifications).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(notifications).toBeHidden();

    await openAccountPanel(page, /Sarah Chen/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'Colour scheme' })).toBeHidden();
  });

  test('collapsing the sidebar hides navigation and is reversible', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Decisions', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(nav.getByRole('link', { name: 'Decisions', exact: true })).toBeHidden();

    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(nav.getByRole('link', { name: 'Decisions', exact: true })).toBeVisible();
  });

  test('appearance controls persist from the account panel', async ({ page }) => {
    await openAccountPanel(page, /Sarah Chen/);
    await page.getByRole('group', { name: 'Colour scheme' }).getByText('Light').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('command palette', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
  });

  test('opens on the keyboard shortcut and closes on Escape', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('jumps to a page without touching the sidebar', async ({ page }) => {
    await page.getByRole('button', { name: /Search propositions/ }).click();
    await page.getByRole('combobox').fill('arbitration');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 1, name: 'Arbitration & levers' })).toBeVisible();
  });

  test('finds a proposition by name and opens its detail page', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox').fill('5G Unlimited');

    const option = page.getByRole('option', { name: /5G Unlimited/ }).first();
    await expect(option).toBeVisible();
    await option.click();

    await expect(page).toHaveURL(/\/propositions\/prop_/);
    await expect(page.getByRole('heading', { level: 1, name: /5G Unlimited/ })).toBeVisible();
  });

  test('reaches a decision by id, which is otherwise URL-only', async ({ page }) => {
    // Take a real id from the grid rather than inventing one, so this stays
    // honest if the fixture seed changes.
    await page.goto('/decisions');
    const raw = await page.locator('tr[data-row] td').first().innerText();
    const id = raw.trim();
    expect(id).toMatch(/^dec_/);

    await page.keyboard.press('ControlOrMeta+k');
    // The decisions page has its own search box, so name the palette's input.
    await page.getByRole('combobox', { name: /Search propositions/ }).fill(id);

    const option = page.getByRole('option', { name: new RegExp(id) }).first();
    await expect(option).toBeVisible();
    await option.click();

    await expect(page).toHaveURL(new RegExp(`/decisions/${id}`));
  });

  test('says so when nothing matches', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox').fill('zzzznotathing');
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
  });
});

test.describe('notifications', () => {
  test('surfaces pending approvals and links to the queue', async ({ page }) => {
    await login(page, ACCOUNTS.priya);

    const bell = page.getByRole('button', { name: /Notifications/ });
    await expect(bell).toBeVisible();
    await bell.click();

    const panel = page.getByRole('group', { name: 'Needs attention' });
    await expect(panel).toBeVisible();

    await panel.getByRole('link', { name: 'All approvals' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible();
  });

  test('the badge count matches the number of items listed', async ({ page }) => {
    await login(page, ACCOUNTS.priya);

    // There are pending change requests in the seed, so the badge must show a
    // number. Waiting for it also avoids reading the label mid-fetch.
    const bell = page.getByRole('button', { name: /needing attention/ });
    await expect(bell).toBeVisible();

    const label = (await bell.getAttribute('aria-label')) ?? '';
    const expected = Number(label.match(/(\d+) needing attention/)?.[1]);
    expect(expected).toBeGreaterThan(0);

    await bell.click();
    const panel = page.getByRole('group', { name: 'Needs attention' });
    await expect(panel.getByRole('link', { name: 'All approvals' })).toBeVisible();
    await expect(panel.locator('ul > li')).toHaveCount(expected);
  });
});
