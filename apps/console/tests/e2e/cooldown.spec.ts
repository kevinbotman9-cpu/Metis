import { test, expect } from '@playwright/test';

/**
 * Saying no, and being left alone about it.
 *
 * The journey the rest period exists for, done entirely by clicking: a visitor
 * is offered something, declines it, and is not offered it again while the
 * policy's window is open. Until 2026-09-11 the second half never happened —
 * `cooldownDaysAfterReject` was authored on every catalogue, rendered on
 * `/frequency-policy`, hashed into every decision, and read by neither engine
 * (G-086).
 *
 * `@screen-only`: no API call, no seeding, no fixture beyond the page itself.
 * The visitor is anonymous, so there is not even a login — which is the point.
 * If this needed a request to get into position, the customer would have no way
 * to decline anything either.
 */

const STOREFRONT = '/storefront/index.html';

/** The offer the hero is currently showing, by the key the engine ranks on. */
const heroOffer = (page: import('@playwright/test').Page) =>
  page.locator('#slot-homepage_hero .decline').first();

test.describe('@screen-only a declined offer stops being offered', () => {
  test('declining the hero offer replaces it, and clearing brings it back', async ({ page }) => {
    await page.goto(STOREFRONT);

    // Whatever the catalogue happens to rank first. The test never names an
    // offer: pinning one here would make a catalogue edit look like a cooldown
    // regression, and the claim is about any declined offer, not that one.
    const declineButton = heroOffer(page);
    await expect(declineButton).toBeVisible();
    const declined = await declineButton.getAttribute('data-offer-key');
    expect(declined, 'the hero offer must name the key it would be declined by').toBeTruthy();

    await declineButton.click();

    // The slot re-decides. It may show a different offer or nothing at all —
    // both are correct, and which one depends on what else qualifies. What must
    // not happen is the same offer coming back.
    await expect
      .poll(
        async () =>
          (await page.locator('#slot-homepage_hero .decline').first().getAttribute('data-offer-key').catch(() => null)) ??
          'nothing offered',
        { message: `${declined} was declined and came back` }
      )
      .not.toBe(declined);

    // The panel says the rest period is running, in words, naming the offer.
    await page.getByRole('button', { name: 'Decided by METIS' }).click();
    await expect(page.locator('#declines-note')).toContainText(declined!);
    await expect(page.locator('#declines-note')).toContainText('rest period');

    // And it is a rest, not a deletion: clear the decline and the offer is
    // eligible again. A cooldown that never lifts is a different bug wearing
    // the same clothes, and nothing else here would tell the two apart.
    await page.getByRole('button', { name: 'Clear declines' }).click();
    await expect
      .poll(
        async () =>
          (await page.locator('#slot-homepage_hero .decline').first().getAttribute('data-offer-key').catch(() => null)) ??
          'nothing offered',
        { message: `${declined} did not return after the decline was cleared` }
      )
      .toBe(declined);
  });
});
