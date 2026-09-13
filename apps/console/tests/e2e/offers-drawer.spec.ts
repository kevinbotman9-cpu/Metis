import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, ACCOUNTS } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('offer catalogue', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/offers');
    await expect(page.getByRole('heading', { level: 1, name: 'Offers', exact: true })).toBeVisible();
    // The heading renders before the catalogue query resolves, and the filter
    // blocks count an empty array until it does. Reading a figure before this
    // point measures the loading state, which is how the first version of the
    // test below "proved" the seed had no undeliverable offer.
    await expect(page.locator('tr[data-row]').first()).toBeVisible();

  });

  test.describe('the summary is the filter', () => {
    test('selecting a block narrows the table to the rows behind the number', async ({ page }) => {
      const group = page.getByRole('radiogroup', { name: 'Filter the catalogue', exact: true });

      // Any block with rows behind it. This named "Cannot be delivered" and
      // asserted the count was above zero, which was true of a tenant carrying
      // 240 generated offers and is not true of one carrying the five a
      // customer asked for: all five are active, have content and are
      // deliverable. The property under test is that a block's number and the
      // rows it filters to agree — that holds for whichever block is populated,
      // and resting it on one that happens to be is what broke (G-096).
      const blocks = await group.getByRole('radio').all();
      let chosen: (typeof blocks)[number] | undefined;
      let count = 0;
      for (const b of blocks) {
        const n = Number((await b.innerText()).match(/\b(\d+)\b/)?.[1] ?? 0);
        if (n > 0) {
          chosen = b;
          count = n;
          break;
        }
      }
      expect(chosen, 'no summary block counts anything; the assertion below would prove nothing').toBeTruthy();

      await chosen!.click();
      await expect(chosen!).toHaveAttribute('aria-checked', 'true');

      // Every surviving row is one the number was counting.
      const rows = page.getByRole('row').filter({ hasNot: page.getByRole('columnheader') });
      await expect(rows).toHaveCount(count);
    });

    test('arrow keys move between blocks, as a radio group should', async ({ page }) => {
      const group = page.getByRole('radiogroup', { name: 'Filter the catalogue', exact: true });
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
      // No filtering. It used to narrow the table to one row, because the
      // tenant held 251 offers and a named one was not on the first page — and
      // that quietly broke paging the moment the tenant became five: with a
      // single row left there is no next offer, so the control's accessible
      // name loses its suffix and `/^Next offer: /` matches nothing. The test
      // read as a paging regression when it was really a filter that is no
      // longer needed.
      await expect(
        page.getByRole('row').filter({ hasText: '5G Home Ultimate' }).first()
      ).toBeVisible();
    });

    test('a row opens the drawer without leaving the list', async ({ page }) => {
      await page.getByRole('row').filter({ hasText: '5G Home Ultimate' }).first().click();

      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('heading', { name: '5G Home Ultimate' })).toBeVisible();

      // Still on the catalogue, so the filter and scroll position survive.
      // The heading is not asserted while the drawer is open: Radix marks the
      // rest of the page aria-hidden for a modal dialog, so it is correctly
      // absent from the accessibility tree. Closing brings it back, which is
      // the real proof that the list was never left.
      await expect(page).toHaveURL(/\/offers\?/);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('heading', { level: 1, name: 'Offers', exact: true })).toBeVisible();
    });

    test('which offer is open lives in the URL, so it can be linked and gone back from', async ({
      page,
    }) => {
      await page.getByRole('row').filter({ hasText: '5G Home Ultimate' }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page).toHaveURL(/[?&]offer=/);

      // A reload of that URL reopens the same record rather than the bare list.
      await page.reload();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(
        page.getByRole('dialog').getByRole('heading', { name: '5G Home Ultimate' })
      ).toBeVisible();
    });

    test('Escape closes it and the URL goes back to the plain list', async ({ page }) => {
      await page.getByRole('row').filter({ hasText: '5G Home Ultimate' }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page).not.toHaveURL(/[?&]offer=/);
    });

    test('paging walks the list without closing', async ({ page }) => {
      await page.getByRole('row').filter({ hasText: '5G Home Ultimate' }).first().click();
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

    test('an offer that can reach a customer says so, per channel', async ({
      page,
    }) => {
      // This opened the "Cannot be delivered" filter and asserted the drawer
      // explains `NO_DELIVERABLE_CREATIVE` — the console's most useful warning,
      // and one no offer in this tenant triggers: all five are active, have
      // content, and are deliverable on a channel the flow serves.
      //
      // So it asserts the other half of the same claim: the drawer accounts for
      // every channel, naming the ones this offer can reach and the ones it
      // cannot. That is the evidence the warning is computed from, and it is
      // testable against a healthy tenant.
      //
      // The populated warning is not covered by any fixture any more (G-096).
      // Inventing a broken offer here to keep it covered would be inventing
      // catalogue content, which is the thing this tenant exists not to do.
      await page.getByRole('row').filter({ hasText: 'Netflix' }).first().click();

      const drawer = page.getByRole('dialog');
      await expect(drawer).toBeVisible();

      // Netflix has web and email content and nothing on the other channels,
      // so the table has to say both things rather than only the good half.
      await expect(drawer.getByText('Web', { exact: true }).first()).toBeVisible();
      await expect(drawer.getByText(/Netflix — web/)).toBeVisible();
      await expect(drawer.getByText('no creative').first()).toBeVisible();
      // And it must not claim the offer is undeliverable, because it is not.
      await expect(drawer.getByText('This offer cannot reach a customer.')).toBeHidden();
    });

    test('the full record is still reachable, so nothing is only in the drawer', async ({
      page,
    }) => {
      await page.getByRole('row').filter({ hasText: '5G Home Ultimate' }).first().click();
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
    await page.getByLabel('Search offers', { exact: true }).fill('5G Home Ultimate');
    await page.getByRole('row').filter({ hasText: '5G Home Ultimate' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const open = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(
      open.violations.map((v) => `${v.id}: ${v.help}`),
      'drawer open'
    ).toEqual([]);
  });
});
