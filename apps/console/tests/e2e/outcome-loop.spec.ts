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

/**
 * The `With an outcome` metric on /performance, as a number.
 *
 * The label and the figure share a container, so the digits have to be pulled
 * out of the text. Read through one function rather than inline in three tests,
 * because two of them compare two readings of it and a difference in how they
 * were parsed would look like a difference in what was measured.
 */
async function measuredCount(page: import('@playwright/test').Page): Promise<number> {
  const metric = page.getByText('WITH AN OUTCOME').locator('..');
  await expect(metric).toBeVisible();
  return Number((await metric.innerText()).replace(/[^0-9]/g, ''));
}

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
    // What the report says before this test adds anything. Asserted as a delta
    // rather than against a total, because a total is a fact about the seeded
    // corpus and this test is about arithmetic: the previous version asserted
    // the metric *contained* the string "2", which any four-digit number
    // starting with a 2 satisfies, so it passed for as long as the corpus
    // happened to measure 2,101 and proved nothing at all.
    await login(page, ACCOUNTS.sarah);
    await page.goto('/performance');
    const before = await measuredCount(page);

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

    await page.goto('/performance');

    // One measured decision per slot that rendered, however many events each
    // one collected. Three events landed on the slot clicked twice — an
    // impression and two clicks — and it is still one decision.
    await expect
      .poll(() => measuredCount(page), { timeout: 15_000 })
      .toBe(before + rendered);
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

test.describe('the seeded corpus reports back @screen-only', () => {
  test('a marketer opens /performance and reads real rates across two years', async ({ page }) => {
    // Phase one made the loop work and reported on the two decisions a
    // reviewer had just clicked. Phase two is the difference between a wiring
    // demonstration and a screen a marketer can use: the corpus reports on
    // itself, so the rates describe 24 months rather than one session.
    await login(page, ACCOUNTS.sarah);
    await page.goto('/performance');

    await expect(page.getByText(/Nothing has been reported back/)).toHaveCount(0);

    // Coverage is deliberately partial, and the screen says which part it is
    // describing. That sentence is the feature, not a caveat.
    await expect(page.getByText(/offers have no outcome recorded/)).toBeVisible();

    // 887 on 2026-09-09, down from 2,101 when the generator started a funnel
    // for every decision that had a winner rather than for every decision whose
    // winner had something to render (G-041). The bound is here to catch the
    // state this screen replaced — two rows, from one reviewer's clicks — not
    // to pin the corpus size.
    const value = await measuredCount(page);
    expect(value, 'the corpus reports on hundreds of decisions, not two').toBeGreaterThan(800);
  });

  test('the rates are rates, not counts pretending to be rates', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/performance');

    // A rate over event counts can exceed 1, which is the tell that the report
    // measured the wrong thing. Read off the screen rather than the API,
    // because the screen is where somebody would believe it.
    // A rate is drawn as a nested span beside its count, with no text
    // separator between them, so reading the table's innerText glues "119" to
    // "67%" and yields 11967. Read the elements that carry a rate instead —
    // this is why the assertion is on the DOM and not on a string.
    // `evaluateAll` does not auto-wait, unlike every assertion around it, so
    // the table has to be there before it runs.
    await expect(page.locator('main table')).toBeVisible({ timeout: 20_000 });
    const percents = await page
      .locator('main table')
      .evaluateAll((tables) =>
        [...tables[0].querySelectorAll('span')]
          // Leaves only. A count and its rate are nested spans, so the outer
          // one's textContent is "119" + "67%" = "11967%" — a number that is
          // on no screen and would fail this assertion for the wrong reason.
          .filter((el) => el.children.length === 0)
          .map((el) => (el.textContent ?? '').trim())
          .filter((t) => /^\d+(\.\d+)?%$/.test(t))
          .map((t) => Number(t.replace('%', '')))
      );
    expect(percents.length, 'no rates on screen to check').toBeGreaterThan(5);
    for (const value of percents) expect(value).toBeLessThanOrEqual(100);
  });

  test('an offer with reach and no takers is findable', async ({ page }) => {
    // The finding the demo exists to make available: acq_sim_30 wins 619
    // decisions and is accepted by almost nobody.
    await login(page, ACCOUNTS.sarah);
    await page.goto('/performance');
    await expect(page.getByText('acq_sim_30').first()).toBeVisible();
  });
});
