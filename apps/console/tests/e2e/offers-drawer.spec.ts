import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, ACCOUNTS } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('offer catalogue', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/offers');
    await expect(page.getByRole('heading', { level: 1, name: 'Offers' })).toBeVisible();
    // The heading renders before the catalogue query resolves, and the filter
    // blocks count an empty array until it does. Reading a figure before this
    // point measures the loading state, which is how the first version of the
    // test below "proved" the seed had no undeliverable offer.
    await expect(page.locator('tr[data-row]').first()).toBeVisible();

  });

  test.describe('the summary is the filter', () => {
    test('selecting a block narrows the table to the rows behind the number', async ({ page }) => {
      const group = page.getByRole('radiogroup', { name: 'Filter the catalogue' });
      const blocked = group.getByRole('radio', { name: /Cannot be delivered/ });

      // The figure has to be real before filtering to it means anything.
      const count = Number((await blocked.innerText()).match(/\b(\d+)\b/)?.[1]);
      expect(count, 'the seed should contain an undeliverable offer').toBeGreaterThan(0);

      await blocked.click();
      await expect(blocked).toHaveAttribute('aria-checked', 'true');

      // Every surviving row is one the number was counting.
      const rows = page.getByRole('row').filter({ hasNot: page.getByRole('columnheader') });
      await expect(rows).toHaveCount(count);
      await expect(page.getByText('none', { exact: true }).first()).toBeVisible();
    });

    test('arrow keys move between blocks, as a radio group should', async ({ page }) => {
      const group = page.getByRole('radiogroup', { name: 'Filter the catalogue' });
      await group.getByRole('radio', { name: /Offers/ }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(group.getByRole('radio', { name: /Selectable/ })).toHaveAttribute(
        'aria-checked',
        'true'
      );
    });
  });

  test.describe('the detail drawer', () => {
    test.beforeEach(async ({ page }) => {
      // Narrow to the offer these tests are about. The seeded tenant holds 251
      // offers, so a named one is not on the first page — and this describe is
      // about the drawer, not about where a row falls in a sorted list.
      // Filtering is what a person does to find one offer among hundreds.
      await page.getByLabel('Search offers').fill('5G Unlimited');
      await expect(page.getByRole('row').filter({ hasText: '5G Unlimited 24mo' }).first()).toBeVisible();
    });

    test('a row opens the drawer without leaving the list', async ({ page }) => {
      await page.getByRole('row').filter({ hasText: '5G Unlimited 24mo' }).first().click();

      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('heading', { name: '5G Unlimited 24mo' })).toBeVisible();

      // Still on the catalogue, so the filter and scroll position survive.
      // The heading is not asserted while the drawer is open: Radix marks the
      // rest of the page aria-hidden for a modal dialog, so it is correctly
      // absent from the accessibility tree. Closing brings it back, which is
      // the real proof that the list was never left.
      await expect(page).toHaveURL(/\/offers\?/);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { level: 1, name: 'Offers' })).toBeVisible();
    });

    test('which offer is open lives in the URL, so it can be linked and gone back from', async ({
      page,
    }) => {
      await page.getByRole('row').filter({ hasText: '5G Unlimited 24mo' }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page).toHaveURL(/[?&]offer=/);

      // A reload of that URL reopens the same record rather than the bare list.
      await page.reload();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(
        page.getByRole('dialog').getByRole('heading', { name: '5G Unlimited 24mo' })
      ).toBeVisible();
    });

    test('Escape closes it and the URL goes back to the plain list', async ({ page }) => {
      await page.getByRole('row').filter({ hasText: '5G Unlimited 24mo' }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page).not.toHaveURL(/[?&]offer=/);
    });

    test('paging walks the list without closing', async ({ page }) => {
      await page.getByRole('row').filter({ hasText: '5G Unlimited 24mo' }).first().click();
      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();

      // The paging control names its action, not just its destination, so it
      // can be found by what it does. Writing this test is what surfaced that:
      // the accessible name used to be the bare offer name.
      const next = drawer.getByRole('button', { name: /^Next offer: / });
      const nextName = ((await next.getAttribute('aria-label')) ?? '').replace(
        /^Next offer: /,
        ''
      );
      await next.click();

      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('heading', { name: nextName })).toBeVisible();
    });

    test('an undeliverable offer says what will happen, not just that it is empty', async ({
      page,
    }) => {
      await page
        .getByRole('radiogroup', { name: 'Filter the catalogue' })
        .getByRole('radio', { name: /Cannot be delivered/ })
        .click();
      await page.getByRole('row').filter({ hasNot: page.getByRole('columnheader') }).first().click();

      const drawer = page.getByRole('dialog');
      await expect(drawer.getByText('This offer cannot reach a customer.')).toBeVisible();
      await expect(drawer.getByText('NO_DELIVERABLE_CREATIVE')).toBeVisible();
      // The channel table is the evidence for the claim above it.
      await expect(drawer.getByText('no creative').first()).toBeVisible();
    });

    test('the full record is still reachable, so nothing is only in the drawer', async ({
      page,
    }) => {
      await page.getByRole('row').filter({ hasText: '5G Unlimited 24mo' }).first().click();
      await page.getByRole('dialog').getByRole('link', { name: 'Open the full record' }).click();
      await expect(page).toHaveURL(/\/offers\/[^/?]+$/);
    });
  });

  test('the catalogue and the open drawer are both free of violations', async ({ page }) => {
    const list = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(
      list.violations.map((v) => `${v.id}: ${v.help}`),
      'catalogue list'
    ).toEqual([]);

    // Filtered first: with 251 offers a named row is not on the first page.
    await page.getByLabel('Search offers').fill('5G Unlimited');
    await page.getByRole('row').filter({ hasText: '5G Unlimited 24mo' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const open = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(
      open.violations.map((v) => `${v.id}: ${v.help}`),
      'drawer open'
    ).toEqual([]);
  });
});
