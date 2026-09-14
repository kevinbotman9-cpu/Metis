import { test, expect, type Page } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * Arbitration you can feel: move a weight and the ranking reorders under the
 * hand, with the movement marked, and nothing publishes until a change set is
 * raised.
 *
 * `@screen-only`: a signed-in account and the seeded tenant, and everything
 * else reached by clicking. The tie is this tenant's own — FIOS Gigabit, 5G Home
 * Ultimate and Gaming Plus Bundle have the same expected margin and are kept
 * apart only by the boosts on the first two — so dropping the boost weight to
 * zero leaves nothing between them and the engine orders them by key.
 */

const ranking = (page: Page) => page.getByRole('list', { name: 'Ranking', exact: true });
const row = (page: Page, name: string) => ranking(page).getByRole('listitem').filter({ hasText: name });

test.describe('@screen-only arbitration, live', () => {
  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  test('dropping the boost weight reorders the ranking, warns of the tie, and raises a change set that publishes nothing', async ({
    page,
  }) => {
    await login(page, ACCOUNTS.marcus);
    const nav = page.getByRole('navigation', { name: 'Main', exact: true });
    await nav.getByRole('button', { name: 'Decisioning', exact: true }).click();
    await nav.getByRole('link', { name: 'Arbitration & boosts' }).click();

    // Live: FIOS first on its boost, nothing moved, and no tie to warn about.
    await expect(ranking(page).getByRole('listitem').first()).toContainText('FIOS Gigabit');
    await expect(page.getByText('unchanged from live', { exact: true })).toBeVisible();
    await expect(page.getByText(/share a priority/)).toHaveCount(0);

    const boost = page.getByRole('slider', { name: 'Boost weight', exact: true });
    await boost.focus();
    await page.keyboard.press('Home');
    await expect(boost).toHaveAttribute('aria-valuenow', '0');

    // Reordered under the hand, with the movement marked.
    await expect(ranking(page).getByRole('listitem').first()).toContainText('5G Home Ultimate');
    await expect(row(page, '5G Home Ultimate')).toContainText('up 1');
    await expect(row(page, 'FIOS Gigabit')).toContainText('down 1');
    await expect(row(page, 'Gaming Plus Bundle')).toContainText('no change');
    await expect(page.getByText('2 offers moved from live', { exact: true })).toBeVisible();

    // The tie, named from the numbers.
    await expect(
      page.getByText('3 offers share a priority: 5G Home Ultimate, FIOS Gigabit and Gaming Plus Bundle.', { exact: true })
    ).toBeVisible();

    // Raised, and nothing published.
    await page.getByRole('button', { name: 'Raise a change set' }).click();
    await expect(page.getByText(/Nothing is published until it is approved/)).toBeVisible();
    const raised = page.getByRole('link', { name: /^cr_/ });
    const id = (await raised.textContent())!.trim();

    await page.reload();
    await expect(page.getByRole('slider', { name: 'Boost weight', exact: true })).toHaveAttribute('aria-valuenow', '1');
    await expect(ranking(page).getByRole('listitem').first()).toContainText('FIOS Gigabit');
    await expect(page.getByText(/share a priority/)).toHaveCount(0);

    // And it waits in the queue for somebody to approve. Approvals is a screen
    // in the Releases group, so the group opens first.
    await nav.getByRole('button', { name: 'Releases', exact: true }).click();
    await nav.getByRole('link', { name: 'Approvals' }).click();
    const queued = page.getByRole('listbox', { name: 'Change sets' }).getByRole('option', { name: new RegExp(id) });
    await queued.click();
    // Pending, from the row itself: "Status: Pending" is part of its name.
    await expect(queued).toHaveAccessibleName(new RegExp(`${id}.*Status: Pending`));
    await expect(
      page.getByRole('heading', { level: 2, name: 'Arbitration weights: boost 1.00 → 0.00', exact: true })
    ).toBeVisible();
  });
});
