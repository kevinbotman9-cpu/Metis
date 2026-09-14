import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * A rule that asks about the offer it judges. ADR-017, G-075.
 *
 * covers: getProfileSchema
 * covers: createTargetingPolicy
 *
 * Until ADR-017 every condition read the request, so a suitability rule gave the
 * same answer for every offer in a decision and "does this offer lower this
 * customer's bill" could not be written at all. The one a tenant once wrote read
 * a single request-level number and refused or passed every retention offer
 * together.
 *
 * Everything here is done by clicking: the rule is authored from the policy
 * list, and reopened from it to see that what was saved is a comparison with the
 * customer's field and not a number someone typed.
 */

const NAME = 'Lowers the customer bill';

test.describe('a condition that reads the offer', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test('@screen-only a rule compares each offer with the customer, and keeps the comparison', async ({ page }) => {
    await page.goto('/targeting-policies');
    await page.getByRole('button', { name: 'New policy', exact: true }).click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Name', { exact: true }).fill(NAME);
    await dialog.getByLabel('Field for condition 1', { exact: true }).selectOption('offer.financials.price.amount');
    await dialog.getByLabel('Operator for condition 1', { exact: true }).selectOption('lt');

    // Money is offered only money to compare with, so the customer's spend is
    // there and their age is not.
    const compare = dialog.getByLabel('Compare condition 1 with', { exact: true });
    await expect(compare.locator('option[value="customer.monthly_spend"]')).toHaveCount(1);
    await expect(compare.locator('option[value="customer.age"]')).toHaveCount(0);

    await compare.selectOption('customer.monthly_spend');
    // A comparison with a field asks for no typed number.
    await expect(dialog.getByLabel('Value for condition 1', { exact: true })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Create policy', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(NAME, { exact: true })).toBeVisible();

    // Reopened, it is still a comparison with the customer's field: the server
    // accepted a path value and stored it as one.
    // Every row's button is named "Edit"; the row is what says which policy.
    await page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: NAME, exact: true }) })
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    const edit = page.getByRole('dialog');
    await expect(edit.getByLabel('Field for condition 1', { exact: true })).toHaveValue('offer.financials.price.amount');
    await expect(edit.getByLabel('Compare condition 1 with', { exact: true })).toHaveValue('customer.monthly_spend');

    await resetStore(page);
  });

  test('the data model declares the offer as the candidate root', async ({ page }) => {
    await page.goto('/data-model');
    await expect(page.getByText('candidate root', { exact: true })).toBeVisible();

    await page.getByLabel('View', { exact: true }).selectOption('paths');
    await expect(page.getByText('offer.financials.price.amount', { exact: true })).toBeVisible();
    // The request-level fact that stood in for it is still a different path.
    await expect(page.getByText('context.offer.monthly_delta', { exact: true })).toBeVisible();
    await expect(page.getByText('Model problems', { exact: true }).locator('..')).toContainText('0');
  });
});
