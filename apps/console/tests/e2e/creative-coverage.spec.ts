import { test, expect, type Page } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * ADR-012 §B3. Whoever owns the catalogue can see what it cannot deliver.
 *
 * Two guards were meant to stop an offer going active with nothing to send and
 * both were channel-blind, so the state they were meant to prevent was reachable
 * in bulk and visible on exactly one surface: the storefront, rendering *"won
 * this slot, and has no web creative for it"* to whoever happened to be watching
 * a demo. The person who could fix it had no way to ask.
 *
 * Since 2026-09-14 the screen is a Cascade (§4.7): active offers, written for a
 * channel that delivers, switched on, every delivering channel. The four filter
 * blocks it replaced were a partition; the rail is a decomposition, so what is
 * asserted changed with it — each stage within the one above, and a stage
 * showing exactly the offers that fell out there.
 *
 * Setup is a sign-in. The screen is reached by clicking, and every number on it
 * is checked against the rows behind it rather than against a constant.
 */

const coverage = (page: Page) => page.getByRole('table').filter({ hasText: 'Offer' });
const rail = (page: Page) => page.getByRole('navigation', { name: 'Coverage, by stage', exact: true });
const STAGES = ['Active offers', 'Written for a channel that delivers', 'Switched on', 'Every delivering channel'];

/** A stage's figure, from its accessible name: "Label: 1,234, note…". */
async function figure(page: Page, label: string): Promise<number> {
  const button = rail(page).getByRole('button', { name: new RegExp(`^${label}: `) });
  await expect(button).toBeVisible();
  const name = (await button.getAttribute('aria-label')) ?? '';
  return Number(name.slice(label.length + 2).split(',')[0].replace(/[^0-9]/g, '') || 'NaN');
}

async function openCoverage(page: Page) {
  await page.goto('/creatives');
  await page.getByRole('button', { name: 'Coverage', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Content coverage', exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('content coverage @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  test('reaches the coverage view by clicking, and puts it in the URL', async ({ page }) => {
    await openCoverage(page);
    // Linkable rather than a mode somebody has to be talked into. The back
    // button returns to the library rather than leaving the screen.
    await expect(page).toHaveURL(/\/creatives\?view=coverage/);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Content coverage', exact: true })).toHaveCount(0);
  });

  test('the stages nest, and a stage shows exactly the offers that fell out there', async ({ page }) => {
    await openCoverage(page);

    const counted = [];
    for (const label of STAGES) counted.push(await figure(page, label));

    // Not vacuous: a seed that stopped reaching this screen would fail here
    // rather than pass with four zeroes.
    expect(counted[0]).toBeGreaterThan(0);
    for (let i = 1; i < counted.length; i++) {
      expect(counted[i], `${STAGES[i]} within ${STAGES[i - 1]}`).toBeLessThanOrEqual(counted[i - 1]);
    }

    // First paint has no selection, so the table holds every active offer.
    await expect(coverage(page)).toContainText(`${counted[0]} of ${counted[0]}`);

    for (let i = 1; i < STAGES.length; i++) {
      await rail(page).getByRole('button', { name: new RegExp(`^${STAGES[i]}: `) }).click();
      const fell = counted[i - 1] - counted[i];
      if (fell === 0) {
        // Nothing fell out here, and the screen says so rather than rendering a
        // table with no rows under it.
        await expect(coverage(page)).toHaveCount(0);
      } else {
        await expect(coverage(page)).toContainText(`${fell} of ${counted[0]}`);
        expect(await coverage(page).locator('tbody tr').count()).toBe(fell);
      }
      // Selecting again clears it, back to the whole.
      await rail(page).getByRole('button', { name: new RegExp(`^${STAGES[i]}: `) }).click();
    }
  });

  test('an offer with nothing on any served channel says so in every column', async ({ page }) => {
    // Skipped rather than softened: `telco-us` declares no offer that can
    // reach nobody, so there is no row for this to read. The column logic it
    // covers is still in the screen and still unproven. Re-enabling it is part
    // of G-096, the warning-state fixture, scheduled after the demo lands.
    test.skip(true, 'no offer in telco-us has nothing to send — G-096');
    await openCoverage(page);
    await rail(page).getByRole('button', { name: /^Written for a channel that delivers: / }).click();

    const row = coverage(page).locator('tbody tr').first();
    await expect(row).toBeVisible();

    // "Cannot send: N of N" is the claim; the cells are the evidence.
    const cannot = await row.locator('td').last().innerText();
    const [missing, served] = cannot.split(' of ').map((n) => Number(n.trim()));
    expect(missing).toBe(served);
    await expect(row.getByText('live')).toHaveCount(0);
  });

  test('measures against the channels that can deliver, not the ones that decide', async ({ page }) => {
    await openCoverage(page);
    const columns = await coverage(page).locator('thead th').allInnerTexts();

    // A channel with a `delivery` mode is a column; one that merely decides is
    // not. This read `active` until 2026-09-10 and counted content against four
    // channels with nothing that sends. ADR-013 §2.
    const placements = (await (await page.request.get('/api/placements/telco-us')).json())
      .placements as { decidable: boolean; delivery: unknown; channel: string }[];
    const deliverable = new Set(placements.filter((p) => p.delivery).map((p) => p.channel));
    const decidable = new Set(placements.filter((p) => p.decidable).map((p) => p.channel));

    expect(decidable.size).toBeGreaterThan(deliverable.size);
    expect(columns.length).toBe(deliverable.size + 2); // offer, the channels, cannot-send
  });

  test('every offer on it reaches the offer it counts', async ({ page }) => {
    // The definition of done: a displayed number links to its source or says
    // why it cannot.
    await openCoverage(page);
    const first = coverage(page).locator('tbody tr').first().getByRole('link').first();
    const name = await first.innerText();
    await first.click();
    await expect(page).toHaveURL(/\/offers\/[^/?]+/);
    await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
  });

  test('explains its three states without needing a mouse', async ({ page }) => {
    // A `title` reaches a hover and nothing else, which is the defect W-055
    // tracks. The legend is text on the page.
    await openCoverage(page);
    for (const meaning of [
      'an active creative exists for this channel',
      'content exists and every copy of it is switched off',
      'nothing is written for this channel',
    ]) {
      await expect(page.getByText(meaning, { exact: true })).toBeVisible();
    }
  });
});
