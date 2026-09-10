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
 * Setup is a sign-in. The screen is reached by clicking, and every number on it
 * is checked against the rows behind it rather than against a constant — a test
 * that hard-codes 38 passes for as long as nobody edits a fixture and teaches
 * nothing about whether the screen counted correctly.
 */

const coverage = (page: Page) => page.getByRole('table').filter({ hasText: 'Offer' });

/**
 * The figure on one of the four blocks at the top.
 *
 * Read from the block's second line rather than by stripping non-digits from
 * the whole thing: the third line is prose, and "on any channel served" is one
 * fixture edit away from containing a number of its own.
 *
 * Addressed by its accessible name, which is the label as authored — the
 * uppercase on screen is CSS, and a locator matching what the eye reads would
 * find nothing.
 */
async function block(page: Page, label: string): Promise<number> {
  const el = page.getByRole('radio', { name: new RegExp(`^${label}`) });
  await expect(el).toBeVisible();
  const lines = (await el.innerText()).split(/\r?\n/);
  return Number(lines[1].replace(/[^0-9]/g, ''));
}

async function openCoverage(page: Page) {
  await page.goto('/creatives');
  await page.getByRole('button', { name: 'Coverage' }).click();
  await expect(page.getByRole('heading', { name: 'Content coverage' })).toBeVisible({
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
    await expect(page.getByRole('heading', { name: 'Content coverage' })).toHaveCount(0);
  });

  test('counts the offers that can reach nobody, and they are the rows it shows', async ({
    page,
  }) => {
    await openCoverage(page);

    const undeliverable = await block(page, 'Nothing to send');
    // The demo tenant has some. A screen whose headline finding is zero on the
    // seeded data is a screen nobody would learn anything from.
    expect(undeliverable).toBeGreaterThan(0);

    await page.getByRole('radio', { name: /Nothing to send/ }).click();
    // The caption states what it filtered to, and it has to agree with the
    // block that was clicked.
    await expect(coverage(page)).toContainText(`${undeliverable} of`);
  });

  test('an offer with nothing on any served channel says so in every column', async ({ page }) => {
    await openCoverage(page);
    await page.getByRole('radio', { name: /Nothing to send/ }).click();

    const row = coverage(page).locator('tbody tr').first();
    await expect(row).toBeVisible();

    // "Cannot send: N of N" is the claim; the cells are the evidence. Read from
    // the row rather than assumed, so a miscount in either shows up here.
    const cannot = await row.locator('td').last().innerText();
    const [missing, served] = cannot.split(' of ').map((n) => Number(n.trim()));
    expect(missing).toBe(served);
    await expect(row.getByText('live')).toHaveCount(0);
  });

  test('measures against the channels that can deliver, not the ones that decide', async ({
    page,
  }) => {
    await openCoverage(page);
    const columns = await coverage(page).locator('thead th').allInnerTexts();

    // A channel with a `delivery` mode is a column; one that merely decides is
    // not. This read `active` until 2026-09-10 and counted content against four
    // channels with nothing that sends, reporting 38 offers with nothing to
    // send where the number that can reach a customer is 127. ADR-013 §2.
    const placements = (await (await page.request.get('/api/placements/telco-uk')).json())
      .placements as { decidable: boolean; delivery: unknown; channel: string }[];
    const deliverable = new Set(placements.filter((p) => p.delivery).map((p) => p.channel));
    const decidable = new Set(placements.filter((p) => p.decidable).map((p) => p.channel));

    // The demo tenant decides on more channels than it can deliver on, which is
    // the whole reason the two sets have to be told apart here.
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
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name.slice(0, 20));
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
      await expect(page.getByText(meaning)).toBeVisible();
    }
  });
});
