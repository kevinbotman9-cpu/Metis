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

/**
 * The key of the offer the hero shows now, or "nothing offered" — read without
 * waiting. `getAttribute` waits for its element, so reading a hero that shows
 * nothing blocked until the poll around it gave up, and the poll's message said
 * the declined offer "came back" when the hero was empty. Nothing offered is
 * one of the two answers this spec accepts. It failed CI twice on 2026-09-19:
 * after a decline, the hero and the grid re-decide for the day's last slot in
 * arrival order (ADR-021 §10), and when the grid took it the hero was capped.
 */
async function heroOfferKey(page: import('@playwright/test').Page): Promise<string> {
  const button = page.locator('#slot-homepage_hero .decline');
  if ((await button.count()) === 0) return 'nothing offered';
  return (await button.first().getAttribute('data-offer-key', { timeout: 1000 }).catch(() => null)) ?? 'nothing offered';
}

test.describe('@screen-only a declined offer stops being offered', () => {
  test('declining the hero offer replaces it, and clearing brings it back', async ({ page }) => {
    // A day of its own, for the reason `brief-scenarios.spec.ts` gives: the
    // platform caps each customer's web slots per day, and the presets' one
    // customer is shared by every storefront spec.
    await page.goto(`${STOREFRONT}?day=210`);

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
        () => heroOfferKey(page),
        { message: `${declined} was declined and came back` }
      )
      .not.toBe(declined);

    // The panel says the rest period is running, in words, naming the offer.
    await page.getByRole('button', { name: 'Decided by METIS', exact: true }).click();
    await expect(page.locator('#declines-note')).toContainText(declined!);
    await expect(page.locator('#declines-note')).toContainText('rest period');

    // And it is a rest, not a deletion: clear the decline and the offer is
    // eligible again. A cooldown that never lifts is a different bug wearing
    // the same clothes, and nothing else here would tell the two apart.
    // A day on first. The load and the decline have spent her day's web cap,
    // so clearing on the same day would find the offer capped rather than
    // cooling. A day later the rest period still holds it — it is thirty days.
    await page.getByRole('button', { name: 'Next day', exact: true }).click();
    await expect(page.locator('#visit-note')).toContainText('211 days ahead');
    await expect
      .poll(
        () => heroOfferKey(page),
        { message: `${declined} came back a day later, inside its rest period` }
      )
      .not.toBe(declined);

    await page.getByRole('button', { name: 'Clear declines', exact: true }).click();
    await expect
      .poll(
        () => heroOfferKey(page),
        { message: `${declined} did not return after the decline was cleared` }
      )
      .toBe(declined);
  });

  test('a decline is one customer’s, and another customer is not held to it', async ({ page }) => {
    // Found driving the storefront with its six other customers on 2026-09-18:
    // the page kept one list of declines, so Eva's "no" to Fios went out as
    // Diego's `rejects` and held it back from him for thirty days.
    await page.goto(`${STOREFRONT}?day=220`);
    const declineButton = heroOffer(page);
    await expect(declineButton).toBeVisible();
    const declined = await declineButton.getAttribute('data-offer-key');
    await declineButton.click();
    await page.getByRole('button', { name: 'Decided by METIS', exact: true }).click();
    await expect(page.locator('#declines-note')).toContainText(declined!);

    // Someone else visits. What the page asks the platform about them carries
    // no decline of hers, and the panel says they have declined nothing.
    const asked = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().includes('/placements/') && (r.postData() ?? '').includes('"cust_diego"')
    );
    await page.getByLabel('Customer', { exact: true }).selectOption({ label: 'Diego — no internet yet, fiber at his address' });
    const body = JSON.parse((await asked).postData()!);
    expect(body.request.contactHistory.rejects, 'Eva’s decline was sent as Diego’s').toBeUndefined();
    await expect(page.locator('#declines-note')).toContainText('Nothing declined');

    // And hers is still hers: back to Eva, and it is still running.
    await page.getByLabel('Customer', { exact: true }).selectOption({ label: 'Eva — fiber available at her address' });
    await expect(page.locator('#declines-note')).toContainText(declined!);
  });
});
