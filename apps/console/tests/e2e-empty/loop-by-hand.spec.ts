import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS } from '../e2e/helpers';

/**
 * The whole loop, driven by hand, on a tenant that starts with no history.
 *
 * G-143 measured what clicking through the storefront made of an empty tenant:
 * every stage full down to Seen, and nothing past it, because the page sent no
 * acceptance and nothing it did could make an offer undeliverable. So a person
 * could not reach realised value, could not see Deliverable separate from
 * Offered, and read four equal stages as a broken join. This drives each of
 * those from the storefront and reads the result on `/performance`.
 *
 * **Runs after `empty-tenant.spec.ts`, and must.** It writes decisions, and that
 * file asserts there are none. Playwright runs this suite's files in name order
 * on its one worker (`playwright.empty.config.ts`: `workers: 1`,
 * `fullyParallel: false`), so the name is load-bearing — renaming this to sort
 * first fails the other file, loudly, at its first assertion.
 */

const rail = (page: Page) => page.getByRole('navigation', { name: 'The loop', exact: true });
const deliverable = (page: Page) => rail(page).getByRole('button', { name: /^Deliverable: / });

async function openPanel(page: Page) {
  const panel = page.locator('#panel');
  if (!(await panel.evaluate((el) => el.classList.contains('open')))) {
    await page.getByRole('button', { name: 'Decided by METIS', exact: true }).click();
  }
}

test.describe.serial('a loop made by hand @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test('accepting an offer reaches realised value, at the value typed, and Deliverable passes through', async ({ page }) => {
    await page.goto('/storefront/index.html');
    const hero = page.locator('#slot-homepage_hero');
    const accept = hero.getByRole('button', { name: 'Accept', exact: true });
    await expect(accept).toBeVisible({ timeout: 20_000 });
    // The grid holds three offers from one decision, and an outcome cannot say
    // which card it was for (ADR-020 §4), so it offers no Accept.
    await expect(page.locator('#slot-homepage_grid').getByRole('button', { name: 'Email this offer' }).first()).toBeVisible();
    await expect(page.locator('#slot-homepage_grid').getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);

    await openPanel(page);
    await page.getByLabel('Value of an acceptance (USD)').fill('75');
    await accept.click();
    await expect(hero.getByRole('button', { name: 'Accepted · $75.00' })).toBeVisible();

    await page.goto('/performance');
    await expect(rail(page)).toBeVisible({ timeout: 20_000 });
    const realised = page.getByText('Realised value', { exact: true }).locator('..');
    await expect(realised).toContainText('$75.00');
    await expect(realised).toContainText('from 1 acted on');

    // Web delivers and nothing else offered, so Deliverable cannot drop: a
    // pass-through that says why, not a full bar.
    await expect(deliverable(page)).toHaveAttribute('aria-label', /Nothing offered can drop here/);
    // Seen could have dropped and did not; it keeps its bar and says nothing extra.
    await expect(rail(page).getByRole('button', { name: /^Seen: / })).not.toHaveAttribute('aria-label', /can drop/);
    // And the flow draws the equal stages as one column.
    await expect(page.getByRole('img', { name: /^The loop as volume/ })).toHaveAttribute('aria-label', /drawn as one column/);
  });

  test('asking for an email separates Deliverable from Offered, and the rail says where', async ({ page }) => {
    // A day on, so yesterday's contacts leave the daily cap's window (ADR-021).
    await page.goto('/storefront/index.html?day=1');
    const email = page.locator('#slot-homepage_hero').getByRole('button', { name: 'Email this offer' });
    await expect(email).toBeVisible({ timeout: 20_000 });
    await openPanel(page);
    await email.click();
    const note = page.locator('#email-note');
    await expect(note).toContainText('Her weekly email was decided to carry');
    await expect(note).toContainText('counts as offered and not deliverable');

    await page.goto('/performance');
    await expect(deliverable(page)).toBeVisible({ timeout: 20_000 });
    await expect(deliverable(page)).toHaveAttribute('aria-label', /won a slot on a channel nothing delivers — Email/);
    await expect(deliverable(page)).not.toHaveAttribute('aria-label', /Nothing offered can drop here/);
  });
});
