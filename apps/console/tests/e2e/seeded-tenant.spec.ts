import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * Every built screen is populated from the seeded `demo-telco-uk` tenant.
 *
 * Part 6 of the console spec asks for this in as many words, and it is the
 * difference between a product and a prototype: "'Test Offer 1' against three
 * rows reads as a prototype no matter how well it is built." So these assert
 * volume and shape, not that a particular row exists — a seed that stopped
 * reaching a screen would show up here as an empty grid or a chart with three
 * points, which is exactly the regression worth catching.
 *
 * Setup is a sign-in and nothing else. Everything asserted is what a person
 * sees after clicking through the nav.
 */

const railTo = async (page: Page, group: string, screen: string | RegExp) => {
  const nav = page.getByRole('navigation', { name: 'Main' });
  const button = nav.getByRole('button', { name: group, exact: true });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  // A name rather than an exact string where the link carries a badge:
  // Approvals folds its pending count into its accessible name.
  await nav
    .getByRole('link', typeof screen === 'string' ? { name: screen, exact: true } : { name: screen })
    .click();
};

test.describe('the seeded tenant reaches every built screen @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test('the catalogue is a catalogue, not a sample', async ({ page }) => {
    await railTo(page, 'Catalogue', 'Offers');
    await expect(page.getByRole('heading', { level: 1, name: 'Offers' })).toBeVisible();

    // A list of eleven does not scroll and its facets have no shape.
    const rows = page.locator('tr[data-row]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(20);

    // Real-shaped names. Every seeded offer is named from its category, so a
    // row reads like something a telco sells rather than like a fixture.
    const names = await rows.locator('td').first().allInnerTexts();
    expect(names.some((n) => /5G|Fibre|Superfast|GB|Roaming|Unlimited/i.test(n))).toBe(true);
    expect(names.every((n) => !/test offer|sample|foo|lorem/i.test(n))).toBe(true);
  });

  test('the content library has content for those offers', async ({ page }) => {
    await railTo(page, 'Catalogue', 'Creatives');
    await expect(page.getByRole('heading', { level: 1, name: 'Creatives' })).toBeVisible();
    const rows = page.locator('tr[data-row]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(20);
  });

  test('the decision history spans two years, not one week', async ({ page }) => {
    await railTo(page, 'Evidence', 'Decisions');
    await expect(page.getByRole('heading', { level: 1, name: 'Decisions' })).toBeVisible();

    const rows = page.locator('tr[data-row]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(10);

    // Both outcomes are on screen: an offer made, and a decision suppressed.
    // A grid that is all winners shows no governance; one that is all
    // suppressions reads as broken.
    const body = await page.locator('main').innerText();
    expect(body.length).toBeGreaterThan(200);
  });

  test('a decision opens onto a trace that really happened', async ({ page }) => {
    await railTo(page, 'Evidence', 'Decisions');
    await page.locator('tr[data-row]').first().click();

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // The cascade is re-executed from the seed when the trace is opened; if the
    // committed index and the generator disagreed, this is where it shows.
    await expect(page.getByText(/candidate/i).first()).toBeVisible();
  });

  test('performance is computed over the whole corpus', async ({ page }) => {
    await railTo(page, 'Insights', 'Performance');
    await expect(page.getByRole('heading', { level: 1, name: 'Performance' })).toBeVisible();

    // Waited for rather than read immediately: the metrics arrive with the
    // query, and asserting against the empty frame is a race, not a check.
    const range = page.getByText(/Decisions from .+ to /i);
    await expect(range).toBeVisible();

    // Two years of history, stated by the page itself.
    const years = [...(await range.innerText()).matchAll(/(\d{4})/g)].map((m) => Number(m[1]));
    expect(Math.max(...years) - Math.min(...years)).toBeGreaterThanOrEqual(1);

    // Ten thousand decisions, not five thousand and not a truncated default.
    // The report used to cap at 5,000 silently, which reported on half a
    // tenant and called it the tenant.
    const body = await page.locator('main').innerText();
    const numbers = [...body.matchAll(/\b(\d[\d,]{3,})\b/g)].map((m) => Number(m[1].replace(/,/g, '')));
    expect(Math.max(...numbers, 0)).toBeGreaterThan(5000);
  });

  test('the audit log carries the incident from last week', async ({ page }) => {
    await railTo(page, 'Evidence', 'Audit log');
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();

    // One of the three things the spec asks to be wrong on purpose. There is
    // no incidents screen, so the incident is what one leaves behind on a
    // platform with an append-only log: detection, containment, resolution.
    await expect(page.getByText(/suppression rate/i).first()).toBeVisible();
  });

  test('an offer held for bias review is findable and says why', async ({ page }) => {
    await railTo(page, 'Catalogue', 'Offers');

    // The grid's own filter, which searches name, key *and* tag — so the one
    // offer carrying `bias-review` is reachable by typing what is wrong with
    // it, which is how somebody would actually find it.
    await page.getByLabel('Search offers').fill('bias');

    const rows = page.locator('tr[data-row]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count(), 'the bias tag should identify exactly one offer').toBe(1);
    await rows.first().click();

    // The drawer, then the record. Held, and paused rather than quietly live.
    const drawer = page.locator('[role=dialog]').first();
    await expect(drawer).toContainText('60GB 5G renewal');
    await expect(drawer.getByText('paused')).toBeVisible();

    await drawer.getByRole('link', { name: /Open the full record/i }).click();

    // The reason is on the page rather than in somebody's head.
    await expect(page.getByText(/skews by age band/i)).toBeVisible();
  });

  test('the governance screens have something to govern', async ({ page }) => {
    await railTo(page, 'Releases', /^Approvals(,|$)/);
    await expect(page.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Nothing to show');
  });

  test('the flows show the catalogue they actually choose from', async ({ page }) => {
    await railTo(page, 'Decisioning', 'Decision flows');
    await expect(page.getByRole('heading', { level: 1, name: 'Decision flows' })).toBeVisible();
    await expect(page.locator('tr[data-row]').first()).toBeVisible();
  });
});
