import { test, expect, type Page } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * ADR-013 phase one. Deciding and delivering are separate questions, and both
 * are answerable from a screen.
 *
 * Placements were fixture-authored until 2026-09-10: three of the five slots
 * the seeded corpus decides for were not in the registry at all, and the one
 * boolean that governed the other two — `active` — was answering both questions
 * at once. Every decision this ADR describes meant editing TypeScript and
 * redeploying.
 *
 * Setup is a sign-in. Everything else these tests reason about, they create by
 * clicking.
 */

const dialog = (page: Page) => page.getByRole('dialog');

async function openPlacements(page: Page) {
  await page.goto('/placements');
  await expect(page.getByRole('heading', { level: 1, name: 'Placements' })).toBeVisible({
    timeout: 20_000,
  });
}

async function createPlacement(page: Page, name: string, deliveredBy?: string) {
  await page.getByRole('button', { name: 'New placement' }).click();
  const d = dialog(page);
  await expect(d.getByRole('heading', { name: 'New placement' })).toBeVisible();
  await d.getByLabel('Name').fill(name);
  await d.getByLabel('Channel').selectOption('sms');
  await d.getByLabel('Decision flow').selectOption({ index: 1 });
  if (deliveredBy) await d.getByLabel('Delivered by').selectOption(deliveredBy);
  await d.getByRole('button', { name: 'Create placement' }).click();
  await expect(d).toHaveCount(0);
}

test.describe('configuring a slot @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  // covers: createPlacement
  test('a new slot decides and is delivered by nothing, which is the honest default', async ({
    page,
  }) => {
    await openPlacements(page);
    await createPlacement(page, 'Winback SMS');

    const row = page.getByRole('row').filter({ hasText: 'winback_sms' });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('yes')).toBeVisible();
    await expect(row.getByText('nothing')).toBeVisible();
  });

  // covers: updatePlacement
  test('deciding and delivering are separately settable', async ({ page }) => {
    // The whole point of the split. `active` could not express a slot that
    // refuses requests and still has a deliverer, or one that decides and has
    // none — and the seeded tenant is full of the second.
    await openPlacements(page);
    await createPlacement(page, 'Winback SMS', 'caller');

    const row = page.getByRole('row').filter({ hasText: 'winback_sms' });
    await expect(row.getByText('Whoever asked')).toBeVisible();

    await row.click();
    await page.getByRole('button', { name: /Edit placement Winback SMS/ }).click();
    await dialog(page).getByLabel('Decide for this slot').selectOption('false');
    await dialog(page).getByRole('button', { name: 'Save placement' }).click();
    await expect(dialog(page)).toHaveCount(0);

    // Refuses requests, and still delivered by whoever asks. One boolean could
    // not have said that.
    await expect(row.getByText('refuses')).toBeVisible();
    await expect(row.getByText('Whoever asked')).toBeVisible();
  });

  test('a slot that decides and delivers nothing is named, not hidden', async ({ page }) => {
    await openPlacements(page);
    await expect(page.getByText(/decide, nothing delivers/)).toBeVisible();
    await expect(page.getByText(/blocked on W-008/)).toBeVisible();
  });

  test('the key is locked once the slot exists, because a decision request carries it', async ({
    page,
  }) => {
    await openPlacements(page);
    await createPlacement(page, 'Winback SMS');

    await page.getByRole('row').filter({ hasText: 'winback_sms' }).click();
    await page.getByRole('button', { name: /Edit placement Winback SMS/ }).click();
    await expect(dialog(page).getByLabel('Key')).toBeDisabled();
  });

  test('the shape is asked for on web and on nothing else', async ({ page }) => {
    // An email placement has no equivalent of a hero, so it carries none rather
    // than a value that means nothing.
    await openPlacements(page);
    await page.getByRole('button', { name: 'New placement' }).click();
    const d = dialog(page);

    await d.getByLabel('Channel').selectOption('web');
    await expect(d.getByLabel('Shape')).toBeVisible();
    await d.getByLabel('Channel').selectOption('email');
    await expect(d.getByLabel('Shape')).toHaveCount(0);
  });
});

test.describe('the coverage denominator counts what can be delivered @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  test('switching a channel’s delivery on changes what coverage is measured against', async ({
    page,
  }) => {
    // The correction ADR-013 §2 is about, driven from the screen that causes
    // it. Until 2026-09-10 coverage counted content against every *decidable*
    // channel, so it reported 38 offers with nothing to send where the number
    // that could actually reach a customer was 127.
    /**
     * `allInnerTexts` does not auto-wait — it returns `[]` on a page that has
     * not rendered yet, and two empty arrays compare equal, so the assertion
     * below would have passed for the wrong reason.
     */
    const channelColumns = async (): Promise<string[]> => {
      await page.goto('/creatives?view=coverage');
      await expect(page.getByRole('heading', { name: 'Content coverage' })).toBeVisible({
        timeout: 20_000,
      });
      const head = page.getByRole('table').locator('thead th');
      await expect(head.first()).toBeVisible();
      return head.allInnerTexts();
    };

    const before = await channelColumns();
    expect(before.length).toBeGreaterThan(0);

    // Give email a deliverer, by clicking.
    await page.goto('/placements');
    await page.getByRole('row').filter({ hasText: 'weekly_offers_send' }).click();
    await page.getByRole('button', { name: /Edit placement Weekly offers email/ }).click();
    await page.getByRole('dialog').getByLabel('Delivered by').selectOption('caller');
    await page.getByRole('dialog').getByRole('button', { name: 'Save placement' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const after = await channelColumns();

    // One more column, because one more channel can now reach somebody.
    expect(after.length).toBe(before.length + 1);
    expect(after.join(' ')).toContain('Email');
    expect(before.join(' ')).not.toContain('Email');
  });
});
