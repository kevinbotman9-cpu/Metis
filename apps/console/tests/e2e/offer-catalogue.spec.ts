import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, ACCOUNTS } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * The offer catalogue, as one list–detail screen (§4.1).
 *
 * It replaced three surfaces on 2026-09-13: a table, a drawer over it, and a
 * detail page reached by leaving the list. What those tests proved still has to
 * hold — a summary figure and the rows behind it agree, which offer is open is
 * in the address, and an offer's reach is accounted for per channel — so each
 * is asserted again against the screen that now carries it.
 */

const list = (page: Page) => page.getByRole('listbox', { name: 'Offers', exact: true });
const option = (page: Page, name: string) => list(page).getByRole('option').filter({ hasText: name });
const detailHeading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name, exact: true });

test.describe('the offer catalogue', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/offers');
    await expect(page.getByRole('heading', { level: 1, name: 'Offers', exact: true })).toBeVisible();
    // The heading renders before the catalogue does, and a facet counts an
    // empty list until it arrives. Reading a figure before this measures the
    // loading state.
    await expect(list(page).getByRole('option').first()).toBeVisible();
  });

  test('a derived facet keeps exactly the offers its count promised', async ({ page }) => {
    const facet = page.getByLabel('Deliverable', { exact: true });
    const labels = await facet.locator('option').allInnerTexts();
    const counted = (label: string) => Number(label.match(/\((\d+)\)\s*$/)?.[1] ?? 0);
    // Whichever value counts something. Resting this on a value that happens
    // to be populated in one tenant is what broke its predecessor (G-096).
    const index = labels.findIndex((label, i) => i > 0 && counted(label) > 0);
    expect(index, 'no value of the facet counts anything; the assertion below would prove nothing').toBeGreaterThan(0);

    await facet.selectOption({ index });
    await expect(list(page).getByRole('option')).toHaveCount(counted(labels[index]));
    await expect(page).toHaveURL(/[?&]f\.reach=/);
  });

  test('selecting an offer opens it beside the list, at the offer’s own address', async ({ page }) => {
    await option(page, '5G Home Ultimate').click();

    await expect(detailHeading(page, '5G Home Ultimate')).toBeVisible();
    await expect(page).toHaveURL(/\/offers\/off_5g_home_ultimate$/);
    // No page navigation: the list is still there, and still the list.
    await expect(list(page)).toBeVisible();
  });

  test('that address opens the same offer on its own, and after a reload', async ({ page }) => {
    await page.goto('/offers/off_5g_home_ultimate');
    await expect(detailHeading(page, '5G Home Ultimate')).toBeVisible();
    await expect(option(page, '5G Home Ultimate')).toHaveAttribute('aria-selected', 'true');

    await page.reload();
    await expect(detailHeading(page, '5G Home Ultimate')).toBeVisible();
  });

  test('j moves to the next offer without leaving the screen', async ({ page }) => {
    await list(page).getByRole('option').first().click();
    const first = page.url();
    await list(page).press('j');

    await expect(page).not.toHaveURL(first);
    await expect(page).toHaveURL(/\/offers\/[^/?]+$/);
    await expect(list(page).getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('an offer that can reach a customer says so, per channel', async ({ page }) => {
    // Netflix has web and email content and nothing on the other channels, so
    // the table has to say both things rather than only the good half — and it
    // must not claim the offer is undeliverable, because it is not. The
    // populated warning is not covered by any fixture (G-096), and inventing a
    // broken offer to cover it would be inventing catalogue content.
    await option(page, 'Netflix').first().click();
    // Opened first: a tab chosen while the address is still moving to the
    // offer is chosen on the page being left, and the navigation is lost.
    await expect(detailHeading(page, 'Netflix')).toBeVisible();
    await page.getByRole('tab', { name: 'Reach', exact: true }).click();

    const reach = page.getByRole('tabpanel');
    await expect(reach.getByText('Web', { exact: true })).toBeVisible();
    await expect(reach.getByText(/Netflix — web/)).toBeVisible();
    await expect(reach.getByText('no creative').first()).toBeVisible();
    await expect(reach.getByText('This offer cannot reach a customer.')).toBeHidden();
  });

  test('the catalogue, and an offer open beside it, are free of violations', async ({ page }) => {
    const bare = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(bare.violations.map((v) => `${v.id}: ${v.help}`), 'catalogue').toEqual([]);

    await option(page, '5G Home Ultimate').click();
    await expect(detailHeading(page, '5G Home Ultimate')).toBeVisible();
    const open = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(open.violations.map((v) => `${v.id}: ${v.help}`), 'offer open').toEqual([]);
  });
});
