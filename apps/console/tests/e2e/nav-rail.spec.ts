import { test, expect } from '@playwright/test';
import { login, ACCOUNTS, openAccountPanel } from './helpers';

/**
 * @screen-only
 *
 * The rail, walked the way a person walks it. Setup is a sign-in through the
 * real form and nothing else: no API calls, no seeding, no fixtures beyond the
 * accounts every spec uses. Everything asserted here was reached by clicking
 * or by keyboard, which is the point — if the rail needed an API call to get
 * into position, the rail would have a hole.
 */

const nav = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Main' });

test.describe('navigation rail @screen-only', () => {
  test('a group the user holds no permission inside is hidden, not disabled', async ({ page }) => {
    await login(page, ACCOUNTS.priya);
    const rail = nav(page);

    await expect(rail.getByRole('button', { name: 'Evidence', exact: true })).toBeVisible();

    // Hidden means absent. A disabled group would still be here to find.
    // Journeys is tagged marketer and none of its screens exist yet, so there
    // is nothing to admit her on. Operations is the same for the operator.
    await expect(rail.getByRole('button', { name: 'Journeys', exact: true })).toHaveCount(0);
    await expect(rail.getByRole('button', { name: 'Operations', exact: true })).toHaveCount(0);

    // Policy was this assertion until 2026-09-10, and it was asserting a bug.
    // Priya holds `edit:policies` and authors the qualification model; the rail
    // hid the screens from the one account entitled to change them, because
    // they declared no permission for the "a granted permission outranks a
    // persona tag" rule to act on. Now they do, and she sees them.
    await expect(rail.getByRole('button', { name: 'Policy', exact: true })).toBeVisible();
  });

  test('a permission on a screen opens its group for a persona the spec does not name', async ({ page }) => {
    // Priya is compliance only, but holds view:offers.
    await login(page, ACCOUNTS.priya);
    const rail = nav(page);

    await rail.getByRole('button', { name: 'Catalogue', exact: true }).click();
    await expect(rail.getByRole('link', { name: 'Offers', exact: true })).toBeVisible();
    await rail.getByRole('link', { name: 'Offers', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Offers' })).toBeVisible();
  });

  test('one group is open at a time, and arriving on a page opens its group', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    const rail = nav(page);
    const overview = rail.getByRole('button', { name: 'Overview', exact: true });
    const evidence = rail.getByRole('button', { name: 'Evidence', exact: true });

    await expect(overview).toHaveAttribute('aria-expanded', 'true');
    await evidence.click();
    await expect(evidence).toHaveAttribute('aria-expanded', 'true');
    await expect(overview).toHaveAttribute('aria-expanded', 'false');

    await rail.getByRole('link', { name: 'Audit log', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
    await expect(evidence).toHaveAttribute('aria-expanded', 'true');
    await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
  });

  test('reaches a third-level screen by clicking, and the rail says where you are', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    const rail = nav(page);

    await rail.getByRole('button', { name: 'Administration', exact: true }).click();
    // Data is a heading, not a link; Intake sits beneath it.
    await expect(rail.getByText('Data', { exact: true })).toBeVisible();
    await rail.getByRole('link', { name: 'Intake', exact: true }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Intake' })).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Intake', exact: true })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
  });

  test('is 240px comfortable, 200px compact, and 48px collapsed', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    const rail = nav(page);

    expect((await rail.boundingBox())?.width).toBe(240);

    await openAccountPanel(page, /Marcus Webb/);
    await page.getByRole('group', { name: 'Density' }).getByText('compact').click();
    await page.keyboard.press('Escape');
    expect((await rail.boundingBox())?.width).toBe(200);

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    expect((await rail.boundingBox())?.width).toBe(48);

    // The icon rail still gets you somewhere: a group's icon is a link to its
    // first screen, named for the screen reader by the group.
    await rail.getByRole('link', { name: 'Evidence', exact: true }).click();
    await expect(page).toHaveURL(/\/decisions$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Decisions' })).toBeVisible();

    // Restore, so the persisted density does not leak into the next spec.
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await openAccountPanel(page, /Marcus Webb/);
    await page.getByRole('group', { name: 'Density' }).getByText('comfy').click();
  });

  test('the keyboard path: a group opens on Enter and Tab lands on its first screen', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    const rail = nav(page);
    const releases = rail.getByRole('button', { name: 'Releases', exact: true });

    await releases.focus();
    await expect(releases).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(releases).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('href', '/approvals');

    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: 'Approvals' })).toBeVisible();
  });

  test('the icons are at group level only', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    const rail = nav(page);
    await rail.getByRole('button', { name: 'Evidence', exact: true }).click();

    // Every group button carries one glyph; no link does.
    const groups = rail.getByRole('button');
    for (const g of await groups.all()) await expect(g.locator('svg').first()).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Decisions', exact: true }).locator('svg')).toHaveCount(0);
  });
});
