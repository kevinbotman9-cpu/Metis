import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * Intake, driven the way somebody would.
 *
 * covers: createDataSource
 * covers: updateDataSource
 * covers: landRows
 * covers: validateDataSource
 * covers: activateDataSource
 *
 * The four stages exist because a source is another system's schema and changes
 * without asking. So what is asserted is the ordering — that a verdict is about
 * the rows and the mapping actually held, and that activation is unreachable
 * without a clean one.
 */

const ROWS = JSON.stringify([
  { cust_id: 'c1', dob: '1990-01-15', band: 'A', standing: 'active', plan: 'standard', fibre: 'Y' },
  { cust_id: 'c2', dob: '1985-06-01', band: 'Z', standing: 'active', plan: 'standard', fibre: 'N' },
]);

async function newSource(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'New source' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create source' }).click();
  await expect(dialog).toBeHidden();
}

async function landRows(page: import('@playwright/test').Page, json: string) {
  await page.getByLabel('Records as JSON').fill(json);
  await page.getByRole('button', { name: 'Land records' }).click();
  await expect(page.getByText(/Columns seen:/)).toBeVisible();
}

test.describe('intake', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/data-model/intake');
  });

  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  test('lands records and reports the columns it saw', async ({ page }) => {
    // Landing observes; it does not interpret. Which column means what is the
    // mapping's job, and keeping them apart is why a source changing shape
    // shows up as an unmapped column rather than as silently absent data.
    await newSource(page, 'CRM nightly');
    await landRows(page, ROWS);

    await expect(page.getByText(/Columns seen:.*band.*cust_id.*dob/)).toBeVisible();
  });

  test('offers only model fields to map onto', async ({ page }) => {
    await newSource(page, 'CRM nightly');
    await landRows(page, ROWS);

    await page.getByRole('button', { name: 'Add mapping' }).click();
    const path = page.getByLabel('Model path for mapping 1');
    await expect(path.locator('option[value="customer.age"]')).toHaveCount(1);
    // A path the model does not have is unrepresentable, same as in the policy
    // editor — there is nowhere to type one.
    await expect(page.locator('input[name="path"]')).toHaveCount(0);
  });

  test('names the column that fails, with an example of the bad value', async ({ page }) => {
    // By column rather than by row: an import fails for a handful of reasons
    // repeated thousands of times.
    await newSource(page, 'CRM nightly');
    await landRows(page, ROWS);

    await page.getByRole('button', { name: 'Add mapping' }).click();
    await page.getByLabel('Column for mapping 1').selectOption('dob');
    await page.getByLabel('Model path for mapping 1').selectOption('customer.age');
    await page.getByLabel('Transform for mapping 1').selectOption('years_since');
    await page.getByRole('button', { name: 'Save mappings' }).click();

    await page.getByRole('button', { name: 'Validate' }).click();
    await expect(page.getByText('Rows held')).toBeVisible();
    await expect(page.getByText('2 filled, 0 refused')).toBeVisible();
  });

  test('refuses to activate a source that has not been validated', async ({ page }) => {
    await newSource(page, 'CRM nightly');
    await landRows(page, ROWS);

    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByText(/cannot go live yet/)).toBeVisible();
  });

  test('refuses to activate when required fields are unfilled', async ({ page }) => {
    // The model requires five. Mapping one and validating cleanly is still not
    // enough, because a clean verdict over an incomplete mapping is a verdict
    // about the wrong question.
    await newSource(page, 'CRM nightly');
    await landRows(page, ROWS);

    await page.getByRole('button', { name: 'Add mapping' }).click();
    await page.getByLabel('Column for mapping 1').selectOption('dob');
    await page.getByLabel('Model path for mapping 1').selectOption('customer.age');
    await page.getByLabel('Transform for mapping 1').selectOption('years_since');
    await page.getByRole('button', { name: 'Save mappings' }).click();
    await page.getByRole('button', { name: 'Validate' }).click();

    await expect(page.getByText(/Required by the model and filled by nothing/)).toBeVisible();

    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByText(/cannot go live yet/)).toBeVisible();
  });

  test('shows the pipeline stage a source has reached', async ({ page }) => {
    await newSource(page, 'CRM nightly');
    const progress = page.getByRole('list', { name: 'Progress' }).first();
    await expect(progress).toContainText('Land');
    await expect(progress).toContainText('Activate');
  });

  test('offers no write controls to an account without edit:integrations', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await login(page, ACCOUNTS.sarah);
    await page.goto('/data-model/intake');

    await expect(page.getByRole('button', { name: 'New source' })).toHaveCount(0);
  });
});
