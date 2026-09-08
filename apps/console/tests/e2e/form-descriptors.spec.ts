import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * The declared form, driven the way a person drives it. Setup is a sign-in
 * through the real form and nothing else — every offer this suite reasons
 * about, it creates by clicking.
 *
 * The test that matters most is the last one. `contractUrl` reached this
 * screen through a descriptor and an OpenAPI schema, and nothing under
 * `apps/console/app/` was touched to put it there. If someone hand-builds this
 * form again, that test is what goes red.
 */

const dialog = (page: import('@playwright/test').Page) => page.getByRole('dialog');

async function openNewOffer(page: import('@playwright/test').Page) {
  await page.goto('/offers');
  await page.getByRole('button', { name: 'New offer' }).click();
  await expect(dialog(page).getByRole('heading', { name: 'New offer' })).toBeVisible();
}

/** Make one by clicking, and land on it. Nothing here touches the API. */
async function createOffer(page: import('@playwright/test').Page, name: string) {
  await openNewOffer(page);
  const d = dialog(page);
  await d.getByLabel('Name').fill(name);
  await d.getByLabel('Objective').selectOption('iss_growth');
  await d.getByLabel('Category').selectOption('grp_data_upsell');
  await d.getByLabel('Price / month').fill('8.00');
  await d.getByRole('button', { name: 'Create offer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(name) })).toBeVisible();
}

test.describe('declared forms @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  // The store is process-wide, so an offer one test creates by clicking would
  // otherwise be there for the next one.
  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  test('suggests a key from the name, and stops once the key is edited', async ({ page }) => {
    await openNewOffer(page);
    const d = dialog(page);

    await d.getByLabel('Name').fill('Speed Boost 100Mb');
    await expect(d.getByLabel('Key')).toHaveValue('speed_boost_100mb');

    await d.getByLabel('Key').fill('my_own_key');
    await d.getByLabel('Name').fill('Speed Boost 200Mb');
    await expect(d.getByLabel('Key'), 'a suggestion overwrote a key somebody chose').toHaveValue(
      'my_own_key'
    );
  });

  test('offers no category until an objective is chosen, then only that objective’s', async ({
    page,
  }) => {
    await openNewOffer(page);
    const d = dialog(page);
    const category = d.getByLabel('Category');

    await expect(category).toBeDisabled();

    await d.getByLabel('Objective').selectOption({ label: 'Retention' });
    await expect(category).toBeEnabled();

    const retention = await category.locator('option').allInnerTexts();
    await d.getByLabel('Objective').selectOption({ label: 'Acquisition' });
    const acquisition = await category.locator('option').allInnerTexts();

    expect(retention).not.toEqual(acquisition);
    // The stale id is cleared rather than carried into a category that no
    // longer belongs to the chosen objective.
    await expect(category).toHaveValue('');
  });

  test('locks the key when editing, because a decision record names it', async ({ page }) => {
    await createOffer(page, 'Lockable Offer');

    await page.getByRole('button', { name: 'Edit' }).first().click();
    const d = dialog(page);
    await expect(d.getByLabel('Key')).toBeDisabled();
    await expect(d.getByLabel('Name')).toBeEnabled();
  });

  test('renders a server refusal, on the write rather than on a field', async ({ page }) => {
    // Made by clicking: the offer this one collides with is one this test
    // created a moment ago, not a fixture it had to know the name of.
    await createOffer(page, 'First Claim');

    await openNewOffer(page);
    const d = dialog(page);
    await d.getByLabel('Name').fill('Second Claim');
    await d.getByLabel('Key').fill('first_claim');
    await d.getByLabel('Objective').selectOption('iss_growth');
    await d.getByLabel('Category').selectOption('grp_data_upsell');
    await d.getByRole('button', { name: 'Create offer' }).click();

    // A duplicate key is a conflict about the whole write, so it belongs in the
    // banner. Per-field refusals are asserted in offer-authoring.spec.ts.
    await expect(d.getByRole('alert')).toContainText(/already uses the key/i);
  });

  /**
   * The whole point of the registry, as a test.
   *
   * `contractUrl` was added to `Offer` by editing two files: the OpenAPI schema
   * and `packages/ui-metadata/src/registry/offer.ts`. It renders here, carries
   * its declared validation, and round-trips through create and read — with no
   * change under `apps/console/app/`.
   */
  test('a field declared in the descriptor renders, validates and saves', async ({ page }) => {
    await openNewOffer(page);
    const d = dialog(page);

    const contract = d.getByLabel('Contract terms');
    await expect(contract, 'the descriptor field never reached the screen').toBeVisible();
    await expect(contract).toHaveAttribute('pattern', 'https://.+');
    await expect(contract).toHaveAttribute('maxlength', '300');
    // The group it declared came with it. Nothing under apps/console/app/
    // knows this group exists.
    await expect(d.getByText('Governance', { exact: true })).toBeVisible();

    await d.getByLabel('Name').fill('Descriptor proof offer');
    await d.getByLabel('Objective').selectOption('iss_growth');
    await d.getByLabel('Category').selectOption('grp_data_upsell');
    await d.getByLabel('Price / month').fill('12.50');
    await contract.fill('https://terms.telco.example/proof');
    await d.getByRole('button', { name: 'Create offer' }).click();

    await expect(page.getByRole('heading', { level: 1, name: /Descriptor proof offer/ })).toBeVisible();

    // Reopen it: the value came back from the server, so it was stored rather
    // than merely accepted by the form.
    await page.getByRole('button', { name: 'Edit' }).first().click();
    const edit = dialog(page);
    await expect(edit.getByLabel('Contract terms')).toHaveValue(
      'https://terms.telco.example/proof'
    );
    await expect(edit.getByLabel('Price / month')).toHaveValue('12.50');
  });
});
