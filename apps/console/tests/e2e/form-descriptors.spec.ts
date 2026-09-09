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

/**
 * Creative is the harder entity: five content shapes on one form, chosen by
 * the channel. These drive that from the screen, on an offer this suite makes
 * by clicking.
 */
test.describe('the declared creative form @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  async function addCreativeTo(page: import('@playwright/test').Page, name: string) {
    await createOffer(page, name);
    await page.getByRole('button', { name: 'Add creative' }).first().click();
    await expect(dialog(page).getByRole('heading', { name: 'Add creative' })).toBeVisible();
  }

  test('shows one channel’s fields and none of another’s', async ({ page }) => {
    await addCreativeTo(page, 'Channel Switch Offer');
    const d = dialog(page);

    await d.getByLabel('Channel').selectOption('web');
    await expect(d.getByLabel('Headline', { exact: true })).toBeVisible();
    await expect(d.getByLabel('Message')).toHaveCount(0);

    await d.getByLabel('Channel').selectOption('sms');
    await expect(d.getByLabel('Message')).toBeVisible();
    await expect(d.getByLabel('Sender id')).toBeVisible();
    // The web fields are gone, not merely hidden — so nothing from the channel
    // somebody switched away from can be sent.
    await expect(d.getByLabel('Headline', { exact: true })).toHaveCount(0);

    await d.getByLabel('Channel').selectOption('email');
    await expect(d.getByLabel('Subject')).toBeVisible();
    await expect(d.getByLabel('Message')).toHaveCount(0);
  });

  test('offers only the slots on the chosen channel, and suggests the shape', async ({ page }) => {
    await addCreativeTo(page, 'Placement Offer');
    const d = dialog(page);
    await d.getByLabel('Channel').selectOption('web');

    const placement = d.getByLabel('Placement', { exact: true });
    const type = d.getByLabel('Placement type');
    await expect(type).toHaveValue('');

    await placement.selectOption({ index: 1 });
    // The slot declares a shape, and choosing the slot fills it in.
    await expect(type).not.toHaveValue('');
  });

  test('creates a creative through the declared form and it delivers', async ({ page }) => {
    await addCreativeTo(page, 'Declared Creative Offer');
    const d = dialog(page);

    await d.getByLabel('Name').fill('Hero — declared');
    await d.getByLabel('Channel').selectOption('web');
    await d.getByLabel('Headline', { exact: true }).fill('Unlimited 5G, £35 a month');
    await d.getByLabel('Delivery').selectOption({ label: 'Active' });
    await d.getByRole('button', { name: 'Add creative' }).click();

    await expect(d).toHaveCount(0);
    await expect(page.getByText('Hero — declared')).toBeVisible();
  });

  test('locks the channel when editing, because the content shape is its', async ({ page }) => {
    await addCreativeTo(page, 'Locked Channel Offer');
    const d = dialog(page);
    await d.getByLabel('Name').fill('SMS — declared');
    await d.getByLabel('Channel').selectOption('sms');
    await d.getByLabel('Message').fill('Come back to unlimited 5G.');
    await d.getByLabel('Sender id').fill('TELCO');
    await d.getByRole('button', { name: 'Add creative' }).click();
    await expect(d).toHaveCount(0);

    // By name, not by position. This used to be `.last()` over every Edit on
    // the page, which is the offer's as well as each creative's — so the
    // assertion depended on how many creatives existed, which depended on what
    // other specs had left behind. G-003.
    await page.getByRole('button', { name: 'Edit creative SMS — declared' }).click();
    const edit = dialog(page);
    await expect(edit.getByLabel('Channel')).toBeDisabled();
    // The content came back, and the discriminant still went with it — the
    // server refuses a creative whose content declares a different channel.
    await expect(edit.getByLabel('Sender id')).toHaveValue('TELCO');
  });

  /**
   * The same proof as Offer, on the harder entity. `reviewNote` was added by
   * editing the OpenAPI schema and the descriptor, and nothing else.
   */
  test('a field declared in the descriptor renders, validates and saves', async ({ page }) => {
    await addCreativeTo(page, 'Review Note Offer');
    const d = dialog(page);

    const note = d.getByLabel('Review note');
    await expect(note, 'the descriptor field never reached the screen').toBeVisible();
    await expect(note).toHaveAttribute('maxlength', '500');

    await d.getByLabel('Name').fill('Reviewed hero');
    await d.getByLabel('Channel').selectOption('web');
    await d.getByLabel('Headline', { exact: true }).fill('Claims checked');
    await note.fill('Ofcom speed claim substantiated 2026-09-01, ref LEG-4471.');
    await d.getByRole('button', { name: 'Add creative' }).click();
    await expect(d).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit creative Reviewed hero' }).click();
    await expect(dialog(page).getByLabel('Review note')).toHaveValue(
      'Ofcom speed claim substantiated 2026-09-01, ref LEG-4471.'
    );
  });
});
