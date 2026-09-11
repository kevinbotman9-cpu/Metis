import { test, expect, type Page } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * Spine 1, step 1: the marketer creates an objective and a category under it.
 *
 * This is the step that had no screen. Objectives and categories were
 * fixture-authored, so the first thing the marketer does in
 * `docs/JOURNEY_SPINES.md` needed `apps/console/mocks/fixtures/catalogue.ts`
 * edited and the console redeployed — while steps 2, 3, 4, 8, 9 and 10 all
 * worked from the screen. Six working screens with a hole in front of them.
 *
 * Setup is a sign-in and nothing else. Everything these tests reason about,
 * they create by clicking, which is the whole point of the tag: if any of it
 * needed an API call to get into position, the journey would still have the
 * hole.
 *
 * The last test is the one that matters. Creating an objective is only worth
 * anything if an offer can then be filed under it, so it walks the chain from
 * an empty objective to a category to the Offer form's two selects — the join
 * that makes the taxonomy a taxonomy rather than two lists.
 */

const dialog = (page: Page) => page.getByRole('dialog');

async function createObjective(page: Page, name: string) {
  await page.goto('/objectives');
  await page.getByRole('button', { name: 'New objective' }).click();
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: 'New objective' })).toBeVisible();
  await d.getByLabel('Name').fill(name);
  await d.getByRole('button', { name: 'Create objective' }).click();
  await expect(d).toHaveCount(0);
  // The detail pane opens on what was just made, which is how the next step
  // knows which objective a category is being added to.
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

async function createCategory(page: Page, name: string) {
  await page.getByRole('button', { name: 'New category' }).click();
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: 'New category' })).toBeVisible();
  await d.getByLabel('Name').fill(name);
  await d.getByRole('button', { name: 'Create category' }).click();
  await expect(d).toHaveCount(0);
}

test.describe('authoring the taxonomy @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  // The store is process-wide, so an objective one test creates by clicking
  // would otherwise be in the list the next one counts.
  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  // covers: createObjective
  test('creates an objective from the screen and opens on it', async ({ page }) => {
    await createObjective(page, 'Win Back');

    // Addressed by its own row rather than by position: other tests grow this
    // list, and a new objective sorts to the end.
    // A listbox option: the list–detail pattern's list selects, it does not navigate.
    const row = page.getByRole('option').filter({ hasText: 'win_back' });
    await expect(row).toHaveCount(1);
    await expect(page.getByText('No categories under this objective')).toBeVisible();
  });

  test('suggests the key from the name and locks it once the objective exists', async ({
    page,
  }) => {
    await page.goto('/objectives');
    await page.getByRole('button', { name: 'New objective' }).click();
    await dialog(page).getByLabel('Name').fill('Win Back');
    await expect(dialog(page).getByLabel('Key')).toHaveValue('win_back');
    await dialog(page).getByRole('button', { name: 'Create objective' }).click();
    await expect(dialog(page)).toHaveCount(0);

    // Everything below an objective is filed under its key, so an edit cannot
    // move it. The descriptor says `immutableAfterCreate`; this is that,
    // rendered.
    await page.getByRole('button', { name: 'Edit objective Win Back' }).click();
    await expect(dialog(page).getByLabel('Key')).toBeDisabled();
    await expect(dialog(page).getByLabel('Key')).toHaveValue('win_back');
  });

  test('refuses a key that is already in the taxonomy, and says which', async ({ page }) => {
    await createObjective(page, 'Win Back');

    await page.getByRole('button', { name: 'New objective' }).click();
    const d = dialog(page);
    await d.getByLabel('Name').fill('Win Back Again');
    await d.getByLabel('Key').fill('win_back');
    await d.getByRole('button', { name: 'Create objective' }).click();

    await expect(d.getByText(/already uses the key 'win_back'/)).toBeVisible();
    // Still open, with what they typed in it. A refusal that closes the form
    // and loses the work is a refusal nobody can act on.
    await expect(d.getByLabel('Name')).toHaveValue('Win Back Again');
  });

  test('will not accept a key the pattern forbids', async ({ page }) => {
    // The pattern reaches the browser as an HTML `pattern` attribute, which is
    // compiled with the `v` flag — where an unescaped hyphen at the end of a
    // character class is a syntax error and the attribute is dropped silently.
    // This asserts the browser is actually enforcing it, which is the thing
    // that was broken and which `new RegExp(pattern)` could not see.
    await page.goto('/objectives');
    await page.getByRole('button', { name: 'New objective' }).click();
    const key = dialog(page).getByLabel('Key');
    await dialog(page).getByLabel('Name').fill('Win Back');
    await key.fill('Not A Key!');
    expect(await key.evaluate((el: HTMLInputElement) => el.checkValidity())).toBe(false);
  });

  // covers: createCategory
  test('files a category under the objective it was created from', async ({ page }) => {
    await createObjective(page, 'Win Back');
    await createCategory(page, 'Lapsed Mobile');

    await expect(page.getByText('lapsed_mobile')).toBeVisible();
    await expect(page.getByText('No categories under this objective')).toHaveCount(0);

    // The objective was not asked for again: the click that opened the form
    // answered it. Re-open the category to read back what was stored.
    await page.getByRole('button', { name: 'Edit category Lapsed Mobile' }).click();
    await expect(dialog(page).getByLabel('Objective')).toHaveValue(/win_back/);
  });

  // covers: updateObjective
  test('edits an objective and the change is on the screen and in the audit log', async ({
    page,
  }) => {
    await createObjective(page, 'Win Back');

    await page.getByRole('button', { name: 'Edit objective Win Back' }).click();
    await dialog(page).getByLabel('Description').fill('Bring lapsed customers back.');
    await dialog(page).getByRole('button', { name: 'Save objective' }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByText('Bring lapsed customers back.')).toBeVisible();

    await page.goto('/audit');
    await expect(page.getByText('ObjectiveUpdated').first()).toBeVisible();
  });

  // covers: updateCategory
  test('edits a category and keeps it under its objective', async ({ page }) => {
    await createObjective(page, 'Win Back');
    await createCategory(page, 'Lapsed Mobile');

    await page.getByRole('button', { name: 'Edit category Lapsed Mobile' }).click();
    await dialog(page).getByLabel('Name').fill('Lapsed Mobile & Broadband');
    await dialog(page).getByRole('button', { name: 'Save category' }).click();
    await expect(dialog(page)).toHaveCount(0);

    await expect(page.getByText('Lapsed Mobile & Broadband')).toBeVisible();
    await page.goto('/audit');
    await expect(page.getByText('CategoryUpdated').first()).toBeVisible();
  });

  test('the whole taxonomy step, and an offer filed under what it made', async ({ page }) => {
    await createObjective(page, 'Win Back');
    await createCategory(page, 'Lapsed Mobile');

    // Step 2 of the spine, reached from step 1 without a reload, a fixture or
    // an API call. This is the join that makes the previous two tests worth
    // anything: an objective nothing can be filed under is a row in a table.
    await page.goto('/offers');
    await page.getByRole('button', { name: 'New offer' }).click();
    const d = dialog(page);

    await d.getByLabel('Name').fill('Come Back 20GB');
    await d.getByLabel('Objective').selectOption({ label: 'Win Back' });

    const category = d.getByLabel('Category');
    await expect(category).toBeEnabled();
    // Only the category that was just made, because it is the only one under
    // this objective — the descriptor's filter, over data authored by clicking.
    await expect(category.locator('option')).toHaveText(['Choose…', 'Lapsed Mobile']);

    await category.selectOption({ label: 'Lapsed Mobile' });
    await d.getByLabel('Price / month').fill('12.00');
    await d.getByRole('button', { name: 'Create offer' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: /Come Back 20GB/ })
    ).toBeVisible();

    // And the count on the taxonomy screen followed it, which is the loop
    // closing: the objective now has an offer beneath it.
    // Read off the category, in the open tab. The objective's own row in the
    // list counts the same offer, so an unscoped '1 offer' would match twice.
    await page.goto('/objectives?objective=iss_win_back');
    await expect(page.getByRole('tabpanel').getByText('1 offer', { exact: true })).toBeVisible();
  });
});
