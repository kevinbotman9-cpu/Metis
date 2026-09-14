import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * A client-side navigation never removes the document's title. G-130.
 *
 * Next renders a metadata title inside the router's per-route head, which is
 * keyed by route and remounted on every navigation, so the title was removed
 * and a new one mounted 14–37ms later. A screen reader announces a titleless
 * document in that window, and axe reported `document-title` whenever its scan
 * overlapped it — on the offer catalogue, whose detail heading paints before
 * the navigation commits, and on the decision trace. It was red on main and on
 * a pull request, on retry too.
 *
 * The check counts removals of a `<title>` node rather than sampling whether
 * one exists. A sample taken in the observer's callback runs after the whole
 * task, so a removal and re-insertion inside one task looks like no change at
 * all: the first version of this check sampled, and passed three attempts in
 * twelve with the gap present.
 */

async function watchTitle(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __titleRemovals: string[] };
    w.__titleRemovals = [];
    const removesTitle = (n: Node) =>
      n.nodeName === 'TITLE' || (n instanceof Element && n.querySelector('title') !== null);
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        if ([...m.removedNodes].some(removesTitle)) w.__titleRemovals.push(location.pathname);
      }
    }).observe(document, { subtree: true, childList: true });
  });
}

async function titleRemovals(page: Page) {
  // The navigation's head commits after the page's own content can paint; give
  // it longer than the gap ever lasted before reading the record.
  await page.waitForTimeout(1_000);
  return page.evaluate(() => (window as unknown as { __titleRemovals: string[] }).__titleRemovals);
}

test.describe('the document title', () => {
  test('survives opening an offer beside the catalogue', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/offers');
    const list = page.getByRole('listbox', { name: 'Offers', exact: true });
    await expect(list.getByRole('option').first()).toBeVisible();
    await expect(page).toHaveTitle('METIS Console');

    await watchTitle(page);
    await list.getByRole('option').filter({ hasText: '5G Home Ultimate' }).click();
    await expect(page).toHaveURL(/\/offers\/off_5g_home_ultimate$/);
    await expect(page.getByRole('heading', { level: 2, name: '5G Home Ultimate', exact: true })).toBeVisible();

    expect(await titleRemovals(page), 'a <title> was removed during the navigation').toEqual([]);
    await expect(page).toHaveTitle('METIS Console');
    expect(await page.locator('title').count(), 'exactly one <title>').toBe(1);
  });

  test('survives opening a trace from the decisions list', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/decisions');
    await expect(page.locator('tr[data-row]').first()).toBeVisible();
    await expect(page).toHaveTitle('METIS Console');

    await watchTitle(page);
    await page.locator('tr[data-row]').first().click();
    await expect(page).toHaveURL(/\/decisions\/dec_/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(await titleRemovals(page), 'a <title> was removed during the navigation').toEqual([]);
    await expect(page).toHaveTitle('METIS Console');
    expect(await page.locator('title').count(), 'exactly one <title>').toBe(1);
  });
});
