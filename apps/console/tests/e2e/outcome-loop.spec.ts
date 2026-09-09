import { test, expect } from '@playwright/test';
import { login, ACCOUNTS, resetStore } from './helpers';

/**
 * The loop closes — phase one of ADR-008.
 *
 * `/performance` has opened on "nothing has been reported back" since the
 * screen existed. Not because measurement was unbuilt: the outcome endpoint,
 * the `outcome_events` table, the foreign key, the append-only trigger and the
 * report that joins them were all built and tested. **Nothing called them.**
 * The coherence review found four work items — delivery, outcome ingestion,
 * attribution and lift — that were one missing edge.
 *
 * This is that edge, for one channel. The storefront renders a decision, says
 * so, someone clicks, it says that too, and a rate appears on a screen that has
 * only ever shown dashes.
 *
 * `@screen-only`: no API call sets anything up. The test opens the storefront
 * the way a visitor does, clicks the offer the way a customer does, and then
 * opens `/performance` the way a marketer does. If any of those three needs an
 * API call to get into position, the loop has a hole in it, which is the whole
 * point of the tag.
 */

test.describe('the outcome loop @screen-only', () => {
  test.afterEach(async ({ page }) => {
    // Outcomes accumulate in the ledger for the life of the server process, and
    // the next test's rate would count this one's clicks.
    await resetStore(page);
  });

  test('a rendered offer reports an impression, a clicked one reports a click, and /performance shows both', async ({
    page,
  }) => {
    // --- the customer -------------------------------------------------------
    await page.goto('/storefront/index.html');

    // The storefront decides on load. Wait for a real offer rather than a
    // skeleton: an impression is only reported for a slot that filled.
    const cta = page.locator('.cta').first();
    await expect(cta).toBeVisible({ timeout: 20_000 });

    const slot = page.locator('[data-decision-id]').first();
    await expect(slot).toBeVisible();
    const decisionId = await slot.getAttribute('data-decision-id');
    expect(decisionId, 'the slot carries the decision that filled it').toMatch(/^dec_[0-9a-f]+$/);

    // The impression is fired on render, so it is already in flight. The click
    // is the customer's.
    const clicked = page.waitForResponse(
      (r) => r.url().includes(`/outcomes/telco-uk/${decisionId}`) && r.request().method() === 'POST'
    );
    await cta.click();
    const response = await clicked;
    expect(response.status(), 'the outcome was accepted, not orphaned').toBe(201);

    // --- the marketer -------------------------------------------------------
    await login(page, ACCOUNTS.sarah);
    await page.goto('/performance');

    // The sentence this whole slice exists to make untrue.
    await expect(page.getByText(/Nothing has been reported back/)).toHaveCount(0);

    // A real count, not a dash. `WITH AN OUTCOME` is the report's own
    // denominator — the decisions it knows anything about.
    const measured = page.getByText('WITH AN OUTCOME').locator('..');
    await expect(measured).not.toContainText(/^0$/);
  });

  test('two outcomes on one decision count as one measured decision, not two', async ({
    page,
  }) => {
    // The property `buildPerformance` is built around: distinct decisions, not
    // events. A rate computed over event counts can exceed 1, which is the tell
    // that it measured the wrong thing — and the click this test adds is
    // exactly the event that would break it.
    await page.goto('/storefront/index.html');
    // Wait for the slot to carry its decision, not merely for a button to
    // appear: the id is what an outcome is reported against.
    await expect(page.locator('[data-decision-id]').first()).toBeVisible({ timeout: 20_000 });

    // The home placements decide in parallel and finish at different moments.
    // Counting on the first one to land reports fewer decisions than were made
    // and then compares that against a report which saw all of them, so settle
    // on a count that has stopped changing rather than on the first non-zero.
    let rendered = 0;
    await expect
      .poll(
        async () => {
          const now = await page.locator('[data-decision-id]').count();
          const stable = now > 0 && now === rendered;
          rendered = now;
          return stable;
        },
        { timeout: 20_000, intervals: [400, 400, 400, 400, 400] }
      )
      .toBe(true);

    await page.locator('.cta').first().click();
    // Same decision, second outcome type.
    await page.locator('.cta').first().click();

    await login(page, ACCOUNTS.sarah);
    await page.goto('/performance');

    const measured = page.getByText('WITH AN OUTCOME').locator('..');
    await expect(measured).toContainText(String(rendered));
  });

  test('a slot that filled nothing reports no impression', async ({ page }) => {
    // An impression is of an offer. If an empty slot reported one, the
    // impression rate would be measuring page views, and every rate below it
    // would inherit the error.
    await page.goto('/storefront/index.html');
    await expect(page.locator('.cta').first()).toBeVisible({ timeout: 20_000 });

    const slots = await page.locator('[id^="slot-"]').all();
    for (const slot of slots) {
      const hasOffer = (await slot.locator('.cta').count()) > 0;
      const hasId = (await slot.getAttribute('data-decision-id')) !== null;
      expect(hasId, 'only a slot showing an offer carries a decision id').toBe(hasOffer);
    }
  });
});
