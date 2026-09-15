import { test, expect, type Page } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * ADR-009 §4, step two. A model version is something a person publishes, and a
 * published version cannot change.
 *
 * A score node has pinned `{ id, version }` since the compiler first refused an
 * unpinned one, and until 2026-09-15 nothing held what the pin named — no
 * schema, no screen, no store. Setup is a sign-in; everything else is clicked.
 */

const dialog = (page: Page) => page.getByRole('dialog');

async function openModels(page: Page) {
  await page.goto('/models');
  await expect(page.getByRole('heading', { level: 1, name: 'Models', exact: true })).toBeVisible({ timeout: 20_000 });
}

async function publish(page: Page, version: string) {
  // The header's. An empty list repeats the same action in its empty state, so
  // the name alone matches two buttons whenever there is nothing published yet.
  await page.getByRole('button', { name: 'New model version', exact: true }).first().click();
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: 'New model version' })).toBeVisible();
  await d.getByLabel('Name', { exact: true }).fill('Accept propensity');
  await d.getByLabel('Version', { exact: true }).fill(version);
  await d.getByLabel('Kind', { exact: true }).selectOption('propensity');
  await d.getByLabel('Declared p95 (ms)').fill('6');
  await d.getByRole('button', { name: 'Add feature' }).click();
  // The first path the data model offers, whatever it is: the type comes with it.
  await d.getByLabel('Path for feature 1').selectOption({ index: 1 });
  await d.getByLabel('Owner', { exact: true }).fill('data-science@telco.example');
  await d.getByLabel('Trained through').fill('2026-08-31');
  await d.getByLabel('Weights hash').fill('a'.repeat(64));
  await d.getByRole('button', { name: 'Publish version' }).click();
  await expect(d).toHaveCount(0);
}

test.describe('publishing a model version @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  // covers: publishModel
  test('a version published from the screen is listed with the cost and inputs it declares', async ({ page }) => {
    await openModels(page);
    await expect(page.getByText('No models published', { exact: true })).toBeVisible();

    await publish(page, '1.0.0');

    const row = page.getByRole('option').filter({ hasText: 'accept_propensity' });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('1.0.0')).toBeVisible();
    await expect(row.getByText('6 ms')).toBeVisible();
    await expect(row.getByText('1 feature')).toBeVisible();
  });

  test('a published version cannot change under the same number, and a new number publishes', async ({ page }) => {
    await openModels(page);
    await publish(page, '1.0.0');

    const row = page.getByRole('option').filter({ hasText: 'accept_propensity' });
    await row.click();
    await page.getByRole('button', { name: /Edit model version Accept propensity/ }).click();
    const d = dialog(page);
    await d.getByLabel('Declared p95 (ms)').fill('9');
    await d.getByRole('button', { name: 'Publish as new version' }).click();

    // Refused on the field that has to change, with the remedy.
    await expect(d.getByText(/publish the change as a new version/)).toBeVisible();

    await d.getByLabel('Version', { exact: true }).fill('1.1.0');
    await d.getByRole('button', { name: 'Publish as new version' }).click();
    await expect(d).toHaveCount(0);

    // Both are things a flow can pin, so both are listed.
    await expect(page.getByRole('option').filter({ hasText: 'accept_propensity' })).toHaveCount(2);
  });
});
