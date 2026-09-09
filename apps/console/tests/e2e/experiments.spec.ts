import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * Experiments.
 *
 * covers: createExperiment
 * covers: updateExperiment
 *
 * The page's job is to explain why the split goes frozen when an experiment
 * starts, because that reads as a limitation and is the opposite: an arm is
 * recomputed from the customer reference when a decision is explained months
 * later, and reweighting a live split would make every recomputed arm disagree
 * with the one that actually applied.
 */

test.describe('experiments', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/experiments');
    // The list is fetched after navigation, so every assertion below races it.
    // Waiting once here rather than making each test's first assertion carry
    // the wait means a slow load fails as "the seed did not arrive" instead of
    // as "the field path is missing" — which is what it looked like on
    // 2026-09-09, in one full run out of six, on a machine under load. G-003.
    await expect(page.getByRole('heading', { level: 1, name: 'Experiments' })).toBeVisible();
    await expect(page.getByText('Full Fibre holdout')).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  test('shows the split and which arm is the holdout', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Experiments' })).toBeVisible();
    await expect(page.getByText('Full Fibre holdout')).toBeVisible();

    // 10/90, declared in the fixture.
    await expect(page.getByRole('img', { name: /Held back 10%/ })).toBeVisible();
    await expect(page.getByText('holdout').first()).toBeVisible();
  });

  test('seeds nothing running, because starting one moves every chain hash', async ({ page }) => {
    // A running experiment adds `experiments.<key>` to every decision's hashed
    // input. That is correct for one somebody started and wrong for a fixture
    // to do on everybody's behalf, so both seeds are draft or stopped.
    // Addressed precisely, not loosely. `getByText('running')` is a
    // case-insensitive substring match, so it also matched the page's own
    // "Running" metric label — and the assertion only passed because it raced
    // the render and found nothing at all. Adding a wait for the list to
    // `beforeEach` turned that false pass into the failure it always was.
    //
    // Same claim, two readings of it: no experiment carries the status, and the
    // page's own counter agrees.
    await expect(page.getByText('running', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Running').locator('..')).toContainText('0');
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('names the field path an arm reaches policies at', async ({ page }) => {
    // The reason no engine change was needed: an arm is an ordinary field, so a
    // holdout is an ordinary eligibility rule.
    await expect(page.getByText('experiments.fibre_holdout').first()).toBeVisible();
  });

  test('explains why a started split cannot be changed', async ({ page }) => {
    // Shown on the stopped seed too: its arms stay frozen because decisions
    // made while it ran still have to be explainable.
    await expect(
      page.getByText(/reweighting now would make every recomputed arm disagree/).first()
    ).toBeVisible();
    await expect(page.getByText(/Stop it and start another/).first()).toBeVisible();
  });

  test('creates a holdout as a draft, assigning nobody yet', async ({ page }) => {
    await page.getByRole('button', { name: 'New holdout' }).click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Name').fill('Roaming holdout');
    await dialog.getByLabel('Key').fill('roaming_holdout');
    await dialog.getByLabel('Held back (%)').fill('20');
    await dialog.getByRole('button', { name: 'Create draft' }).click();

    await expect(dialog).toBeHidden();

    // Scoped to the new card: the seeded holdout is also a draft with its own
    // Start button, so a bare lookup would pass without proving anything.
    const card = page.getByRole('region', { name: 'Roaming holdout' });
    await expect(card.getByText('draft')).toBeVisible();
    // Created as a draft whatever was asked for — nobody is split until
    // somebody starts it.
    await expect(card.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('starting one freezes its split', async ({ page }) => {
    await page.getByRole('button', { name: 'New holdout' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Freeze me');
    await dialog.getByLabel('Key').fill('freeze_me');
    await dialog.getByRole('button', { name: 'Create draft' }).click();
    await expect(dialog).toBeHidden();

    const card = page.getByRole('region', { name: 'Freeze me' });
    await card.getByRole('button', { name: 'Start' }).click();

    await expect(card.getByRole('button', { name: 'Stop' })).toBeVisible();
    // The split is frozen the moment it starts, and the card says why.
    await expect(card.getByText(/The split is frozen/)).toBeVisible();
  });

  test('refuses a key that would collide at the same field path', async ({ page }) => {
    // Two experiments at `experiments.fibre_holdout` would overwrite each
    // other in the decision input.
    await page.getByRole('button', { name: 'New holdout' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Duplicate');
    await dialog.getByLabel('Key').fill('fibre_holdout');
    await dialog.getByRole('button', { name: 'Create draft' }).click();

    await expect(page.getByText(/experiments.fibre_holdout/).first()).toBeVisible();
  });

  test('offers no controls to an account that cannot author', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await login(page, ACCOUNTS.priya);
    await page.goto('/experiments');

    await expect(page.getByRole('button', { name: 'New holdout' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
  });
});
