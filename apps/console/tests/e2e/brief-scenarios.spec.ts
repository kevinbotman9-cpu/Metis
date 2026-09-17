import { test, expect, type Page } from '@playwright/test';

/**
 * The customer's three scenarios, done by clicking.
 *
 * One person, Eva, at two addresses, and then again after she accepts. The
 * brief's own ranking for each is asserted here, because the ranking is the
 * thing being pitched: if the demo shows a different order from the deck the
 * customer wrote, the pitch is arguing with its own evidence.
 *
 * `@screen-only`: no API call, no seeding, no fixture beyond the page. Eva is
 * not signed in by this test — the storefront is somebody else's website and
 * the presets are its own controls, which is the whole point of it being
 * outside the console.
 *
 * Every position in these three lists is a declared decision. Value alone ties
 * FIOS, 5G Home and Gaming Plus at business value 100, so `lev_fiber_first`
 * and `lev_line_before_addon` break both ties with an owner and a reason. Until
 * the second boost existed the engine settled 5G against Gaming by sorting
 * keys, and in the no-fiber scenario that alphabetical accident chose the
 * headline slot.
 */

const STOREFRONT = '/storefront/index.html';

/**
 * The storefront on a day of this test's own.
 *
 * The platform counts each preset customer's contacts against
 * `cpol_web_daily` — three web slots a day — and a page load decides two, the
 * grid's read counting the hero's (ADR-021). Tests sharing a day would spend each other's cap, so each starts
 * on its own day, ten apart, and moves a day forward with the panel's Next day
 * when it needs more than a day holds. Advancing time rather than resetting the
 * store: the cap is part of what the page does, not something to clear away.
 */
const onDay = (day: number) => `${STOREFRONT}?day=${day}`;

/** The grid's current decision id, from the panel. */
const gridDecision = (page: Page) =>
  page
    .locator('#decisions details.decision', { hasText: 'homepage_grid' })
    .first()
    .locator('dl.facts dt:text-is("decision") + dd')
    .textContent()
    .catch(() => null);

/** The panel's Next day, and the re-decision it causes. */
async function nextDay(page: Page) {
  const panel = page.locator('#panel');
  if (!(await panel.evaluate((el) => el.classList.contains('open')))) {
    await page.getByRole('button', { name: 'Decided by METIS', exact: true }).click();
  }
  const before = await gridDecision(page);
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect.poll(() => gridDecision(page), { message: 'Next day did not re-decide' }).not.toBe(before);
}

/**
 * The slate as the panel shows it: each rank, its offer key and its priority.
 *
 * Parsed a line at a time rather than by scanning for a pattern. Scanning went
 * wrong twice in one sitting and both ways are worth the warning: a pattern
 * loose enough to match an offer key also matched the decimal priority beside
 * it (`0.183334` read as rank 0 of an offer named `183334`), and tightening it
 * to require a leading letter then dropped `5g_home_ultimate`, whose key
 * starts with a digit. One line, one entry, all three fields together.
 */
async function slate(page: Page): Promise<{ key: string; priority: number }[]> {
  const panel = page.locator('#decisions details.decision', { hasText: 'homepage_grid' }).first();
  // Only if it is shut. Clicking an open `<details>` closes it, which hid the
  // slate on the second read inside one test.
  if (!(await panel.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await panel.locator('summary').click();
  }
  const dd = panel.locator('dl.facts dt:text-is("slate") + dd');
  await expect(dd).toBeVisible();
  return (await dd.innerText())
    .split('\n')
    .map((line) => line.trim().match(/^\d+\.\s+(\S+)\s+([\d.]+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ key: m[1], priority: Number(m[2]) }));
}

/** The offer keys the grid is showing, in the order it shows them. */
const ranked = async (page: Page) => (await slate(page)).map((e) => e.key);

/**
 * The priorities, in slate order.
 *
 * Read because the ranking alone cannot tell a decision from an accident. FIOS,
 * 5G Home and Gaming Plus are level on business value, so with no boost the
 * engine breaks the tie by sorting keys — and `5g_home_ultimate` sorts before
 * `gaming_plus_bundle`, which is the order the brief happens to want. Every
 * assertion about the order therefore passed whether or not
 * `lev_line_before_addon` existed: verified by setting it to 1.0, which left
 * all five tests green. Distinct priorities are what make each position a
 * decision somebody made, so that is what is asserted.
 */
const priorities = async (page: Page) => (await slate(page)).map((e) => e.priority);

async function choose(page: Page, label: string) {
  // Only if it is shut. The toggle sits behind the open panel, so clicking it
  // a second time waits forever for an element the panel is covering.
  const panel = page.locator('#panel');
  if (!(await panel.evaluate((el) => el.classList.contains('open')))) {
    await page.getByRole('button', { name: 'Decided by METIS', exact: true }).click();
  }
  // Which decision the grid is showing now, so the wait below can tell a new
  // answer from the old one still on screen.
  const decisionId = async () =>
    page
      .locator('#decisions details.decision', { hasText: 'homepage_grid' })
      .first()
      .locator('dl.facts dt:text-is("decision") + dd')
      .textContent()
      .catch(() => null);
  const before = await decisionId();

  await page.locator('#preset').selectOption({ label });

  // The page re-decides on change, and the previous card stays on screen while
  // it does. Waiting for the card to be visible therefore proves nothing: the
  // first version of this read the old slate and compared it to itself, and the
  // "same customer, one field apart" test passed by finding no difference.
  await expect(
    page.locator('#decisions details.decision', { hasText: 'homepage_grid' }).first()
  ).toBeVisible();
  await expect.poll(decisionId, { message: 'the grid never re-decided' }).not.toBe(before);

  // Then a day on, and read that. A home-page load decides the hero and the
  // grid, and the grid's read already counts the hero, so a day holds one
  // full decide: the choice above lands capped, and the next day decides the
  // chosen preset on a day it has not used (ADR-021).
  await nextDay(page);
}

test.describe('@screen-only the brief’s three scenarios', () => {
  test('fiber at her address: FIOS, 5G Home, Gaming Plus', async ({ page }) => {
    await page.goto(onDay(110));
    await choose(page, 'Eva — fiber available at her address');

    expect(await ranked(page)).toEqual([
      'fios_gigabit',
      '5g_home_ultimate',
      'gaming_plus_bundle',
    ]);

    // And every position is a decision, not a tie the engine settled by
    // sorting keys. Neutralise either boost and this fails; the order alone
    // does not, because the alphabet agrees with the brief by luck.
    const p = await priorities(page);
    expect(p).toHaveLength(3);
    expect(new Set(p).size, `two offers share a priority: ${p.join(', ')}`).toBe(3);
    expect(p[0]).toBeGreaterThan(p[1]);
    expect(p[1]).toBeGreaterThan(p[2]);
  });

  test('no fiber at the new address: FIOS is refused by name, 5G Home leads', async ({ page }) => {
    await page.goto(onDay(120));
    await choose(page, 'Eva — moved, no fiber at the new address');

    expect(await ranked(page)).toEqual([
      '5g_home_ultimate',
      'gaming_plus_bundle',
      'disney_plus',
    ]);

    // The sharp part of the scenario, and the reason a connector supplies the
    // field: the refusal names the rule, so "why was I not offered fiber" is
    // answerable from the record rather than from somebody's memory.
    const panel = page.locator('#decisions details.decision', { hasText: 'homepage_grid' }).first();
    await expect(panel.locator('.denial', { hasText: 'fios_gigabit' })).toContainText(
      'ELIGIBILITY_FAILED'
    );
    await expect(panel.locator('.denial', { hasText: 'fios_gigabit' })).toContainText(
      'pol_fios_serviceable'
    );
  });

  test('after accepting 5G Home: both broadband offers go, the cross-sell opens', async ({
    page,
  }) => {
    await page.goto(onDay(130));
    await choose(page, 'Eva — after accepting 5G Home');

    expect(await ranked(page)).toEqual(['gaming_plus_bundle', 'disney_plus', 'netflix']);

    // Suppressed from what she now holds, not from the interaction log — the
    // platform records no acceptance of its own, and the demo must not imply
    // it does. `pol_not_on_5g_home` is a relevance rule over her profile.
    const panel = page.locator('#decisions details.decision', { hasText: 'homepage_grid' }).first();
    await expect(panel.locator('.denial', { hasText: '5g_home_ultimate' })).toContainText(
      'pol_not_on_5g_home'
    );
  });

  test('the same customer, one field apart', async ({ page }) => {
    // The claim the first two scenarios rest on. If the presets differed by
    // more than the address, the demo would be showing two customers and
    // calling it one — which is what it did until 2026-09-12, when every
    // preset carried its own id and the address sat one level too flat to be
    // read at all (G-094).
    await page.goto(onDay(140));

    await choose(page, 'Eva — fiber available at her address');
    const withFiber = await ranked(page);

    await choose(page, 'Eva — moved, no fiber at the new address');
    const withoutFiber = await ranked(page);

    expect(withFiber).not.toEqual(withoutFiber);
    expect(withFiber[0]).toBe('fios_gigabit');
    expect(withoutFiber).not.toContain('fios_gigabit');
    // And everything else she qualifies for is still there, in the same order.
    expect(withoutFiber.slice(0, 2)).toEqual(withFiber.slice(1, 3));
  });
});
