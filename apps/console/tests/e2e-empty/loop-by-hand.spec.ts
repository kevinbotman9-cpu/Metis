import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS, expectFunnelShows } from '../e2e/helpers';

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
    // One acceptance is one valued decision: drawn, counted, and said to be thin
    // (ADR-023). The click before it is acted on and carries no value.
    await expect(realised).toContainText('from 1 valued outcome, of 1 acted on');
    await expect(realised).toContainText('too few to read as a return');

    // Web delivers and nothing else offered, so Deliverable cannot drop: a
    // pass-through that says why, not a full bar.
    await expect(deliverable(page)).toHaveAttribute('aria-label', /Nothing offered can drop here/);
    // Seen could have dropped and did not; it keeps its bar and says nothing extra.
    await expect(rail(page).getByRole('button', { name: /^Seen: / })).not.toHaveAttribute('aria-label', /can drop/);
    // And the flow still draws five columns: equal stages were merged into one
    // until 2026-09-18, which is where the funnel disappeared at low volume.
    await expect(page.getByRole('img', { name: /^The loop as volume/ }).locator('g[data-part="column"]')).toHaveCount(5);
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

  /**
   * The Overview fits a hand-made tenant, which is the case the seeded check
   * cannot see.
   *
   * `overview.spec.ts` pins the seeded tenant at 1680x1000. That tenant's rail
   * carries shorter text than this one's: at a dozen decisions the Offered
   * stage names what suppressed them and Deliverable says why nothing can drop,
   * so the rail — the tallest column, and the page's floor — is taller here than
   * where the check was looking. The product owner read a scrolling page off
   * this state while the seeded check was green (2026-09-17).
   *
   * Two sizes, two different claims:
   *
   * - **1440x900: the page fits.** Nothing scrolls.
   * - **1280x720: the loop fits, and the proposals card is what scrolls.** The
   *   rail and the funnel are wholly above the fold. The arithmetic does not
   *   allow more: the rail alone is taller than half of a 720px window, and the
   *   proposals card is another 252px. Asserting no scroll at 1280 would mean
   *   taking the proposals card off a page the product owner wants it on, so
   *   what is asserted is which part scrolls.
   */
  test('the Overview fits at 1440x900, and at 1280x720 only the proposals scroll', async ({ page }) => {
    // The marketer's Overview is the loop; an administrator lands on the
    // architect's, which is panels, and switches with the control in the chrome
    // (`lib/persona.ts`).
    await page.goto('/');
    await page.getByRole('group', { name: 'Overview persona', exact: true })
      .getByRole('button', { name: 'Marketer', exact: true })
      .click();
    await expect(rail(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Realised value', { exact: true })).toBeVisible();

    const geometry = () =>
      page.evaluate(() => {
        const scroller = [...document.querySelectorAll<HTMLElement>('main')].find((n) =>
          ['auto', 'scroll'].includes(getComputedStyle(n).overflowY)
        );
        if (!scroller) throw new Error('no scroll container on the page');
        const box = scroller.getBoundingClientRect();
        const bottomOf = (sel: string) => {
          const n = document.querySelector(sel);
          if (!n) throw new Error(`no ${sel}`);
          return n.getBoundingClientRect().bottom - box.top;
        };
        return {
          overflow: scroller.scrollHeight - scroller.clientHeight,
          fold: scroller.clientHeight,
          loopBottom: Math.max(bottomOf('nav[aria-labelledby]'), bottomOf('svg[role="img"]')),
        };
      });

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(rail(page)).toBeVisible();
    const wide = await geometry();
    expect(wide.overflow, `the Overview scrolls at 1440x900 by ${wide.overflow}px`).toBeLessThanOrEqual(0);
    // Fitting is not enough: the funnel fitted on 2026-09-17 as a band, four
    // names over one bar, and this test was green.
    await expectFunnelShows(page, { tallest: 88 });

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(rail(page)).toBeVisible();
    const narrow = await geometry();
    expect(
      narrow.loopBottom,
      `the loop runs past the fold at 1280x720 by ${Math.round(narrow.loopBottom - narrow.fold)}px`
    ).toBeLessThanOrEqual(narrow.fold);
  });
});
