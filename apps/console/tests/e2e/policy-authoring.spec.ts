import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * Authoring an eligibility rule against the data model.
 *
 * covers: getProfileSchema
 * covers: createTargetingPolicy
 * covers: updateTargetingPolicy
 *
 * The point of the picker is not convenience. `PolicyCondition.field` was a
 * free-text dotted path with no model behind it, and one character wrong in a
 * leaf did not error — it decided, moving a winner from `acq_fibre_900` to
 * `acq_sim_30` while the trace reported `ELIGIBILITY_FAILED` against a real
 * policy id.
 *
 * So these assert that the wrong thing cannot be *expressed*, not merely that
 * it is rejected: the field is a list, the operators narrow to the type, and an
 * enum offers its members.
 */

test.describe('the data model', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/data-model');
  });

  test('shows what a decision can read, and what it cannot', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Data model' })).toBeVisible();

    // The root entity is what a request carries; the rest hang off it.
    await expect(page.getByText('DecisionInput')).toBeVisible();
    await expect(page.getByText('Customer').first()).toBeVisible();

    // Personal data is marked, because retention needs to know.
    await expect(page.getByText('special category').first()).toBeVisible();
  });

  test('lists every path a policy may reference', async ({ page }) => {
    await page.getByLabel('View').selectOption('paths');

    await expect(page.getByText('customer.credit_status')).toBeVisible();
    // Twice on the page by design: once in the list, once in the card that
    // explains what a rollup is and how it is computed. `.first()` rather than
    // a looser matcher, so a path vanishing from the list would still fail.
    await expect(page.getByText('accounts.worst_arrears_days').first()).toBeVisible();
    await expect(page.getByText('rollup').first()).toBeVisible();

    // A rollup is the only way to read across a one-to-many, so the raw path
    // must not be offered — it would promise something the engine cannot do.
    await expect(page.getByText('customer.accounts.arrears_days')).toHaveCount(0);
  });

  test('reports no structural problems with the seeded model', async ({ page }) => {
    // A guard on the fixture: a model that names an entity it does not define
    // would make every assertion below meaningless.
    await expect(page.getByText('Model problems').locator('..')).toContainText('0');
  });
});

test.describe('authoring a policy', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/targeting-policies');
  });

  test('the field is a list, never a text box', async ({ page }) => {
    await page.getByRole('button', { name: 'New policy' }).click();
    const dialog = page.getByRole('dialog');

    const field = dialog.getByLabel('Field for condition 1');
    await expect(field).toBeVisible();
    // The defect made unrepresentable: there is nowhere to type a path.
    await expect(dialog.locator('input[name="field"]')).toHaveCount(0);
    await expect(field.locator('option')).not.toHaveCount(0);
  });

  test('the operators narrow to the type of the chosen field', async ({ page }) => {
    await page.getByRole('button', { name: 'New policy' }).click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Field for condition 1').selectOption('customer.age');
    const operator = dialog.getByLabel('Operator for condition 1');
    await expect(operator.locator('option[value="gte"]')).toHaveCount(1);
    // `contains` on a number is always false, which reads as a rule that
    // refused rather than one that could not run.
    await expect(operator.locator('option[value="contains"]')).toHaveCount(0);

    await dialog.getByLabel('Field for condition 1').selectOption('customer.credit_status');
    await expect(operator.locator('option[value="gte"]')).toHaveCount(0);
    await expect(operator.locator('option[value="in"]')).toHaveCount(1);
  });

  test('an enum offers its members rather than a text box', async ({ page }) => {
    // `passed` for `pass` reads correctly, matches nothing, and suppresses
    // every candidate. A dropdown makes it unwritable.
    await page.getByRole('button', { name: 'New policy' }).click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Field for condition 1').selectOption('customer.credit_status');
    const value = dialog.getByLabel('Value for condition 1');
    await expect(value.locator('option')).toContainText(['Choose…', 'pass', 'refer', 'fail']);
  });

  test('an existence check asks for no value', async ({ page }) => {
    await page.getByRole('button', { name: 'New policy' }).click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Field for condition 1').selectOption('customer.age');
    await dialog.getByLabel('Operator for condition 1').selectOption('exists');
    await expect(dialog.getByText('no value needed')).toBeVisible();
  });

  test('creates a policy and shows it in the list', async ({ page }) => {
    await page.getByRole('button', { name: 'New policy' }).click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Name').fill('Over 21 only');
    await dialog.getByLabel('Field for condition 1').selectOption('customer.age');
    await dialog.getByLabel('Operator for condition 1').selectOption('gte');
    await dialog.getByLabel('Value for condition 1').fill('21');
    await dialog.getByRole('button', { name: 'Create policy' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Over 21 only')).toBeVisible();

    await resetStore(page);
  });

  test('a second condition can be added and removed', async ({ page }) => {
    await page.getByRole('button', { name: 'New policy' }).click();
    const dialog = page.getByRole('dialog');

    await dialog.getByRole('button', { name: 'Add condition' }).click();
    await expect(dialog.getByLabel('Field for condition 2')).toBeVisible();

    await dialog.getByRole('button', { name: 'Remove condition 2' }).click();
    await expect(dialog.getByLabel('Field for condition 2')).toHaveCount(0);
  });

  test('edits an existing policy', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit' }).first().click();
    const dialog = page.getByRole('dialog');

    await expect(dialog.getByRole('heading', { name: 'Edit policy' })).toBeVisible();
    // The form arrives populated, or an edit silently becomes a rewrite.
    await expect(dialog.getByLabel('Name')).not.toHaveValue('');

    await dialog.getByLabel('Name').fill('Renamed by a test');
    await dialog.getByRole('button', { name: 'Save policy' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Renamed by a test')).toBeVisible();

    await resetStore(page);
  });

  test('offers no authoring control to an account that cannot author policies', async ({
    page,
  }) => {
    // Sarah authors offers and flows; policies are compliance's. The console
    // must not show a control that would answer 403.
    await page.evaluate(() => localStorage.clear());
    await login(page, ACCOUNTS.sarah);
    await page.goto('/targeting-policies');

    await expect(page.getByRole('button', { name: 'New policy' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });
});
