import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, ACCOUNTS, openAccountPanel } from './helpers';

/**
 * WCAG 2.2 AA, per the definition of done. Runs against real rendered pages in
 * both themes, because a contrast regression only shows in one of them.
 */

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/propositions', name: 'propositions' },
  { path: '/propositions/prop_5g_unlimited_24', name: 'proposition detail' },
  { path: '/engagement-policies', name: 'engagement policies' },
  { path: '/contact-policy', name: 'contact policy' },
  { path: '/arbitration', name: 'arbitration' },
  { path: '/strategies', name: 'strategies' },
  { path: '/decisions', name: 'decisions' },
  { path: '/integrations', name: 'integrations' },
  { path: '/approvals', name: 'approvals' },
  { path: '/approvals/cr_0042', name: 'change request' },
  { path: '/agentic', name: 'agentic' },
  { path: '/audit', name: 'audit' },
  { path: '/settings', name: 'settings' },
  { path: '/simulations', name: 'simulations' },
];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('accessibility', () => {
  test('login page has no violations', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test.describe('signed in', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, ACCOUNTS.marcus);
    });

    for (const target of PAGES) {
      test(`${target.name} has no violations`, async ({ page }) => {
        await page.goto(target.path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`)
        ).toEqual([]);
      });
    }

    test('dark theme has no contrast violations', async ({ page }) => {
      await openAccountPanel(page, /Marcus Webb/);
      await page.getByRole('group', { name: 'Colour scheme' }).getByText('Dark').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      for (const path of ['/', '/decisions', '/propositions', '/agentic']) {
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2aa'])
          .include('main')
          .analyze();
        expect(
          results.violations.map((v) => `${path} ${v.id}: ${v.help}`)
        ).toEqual([]);
      }
    });

    test('the decision grid is reachable and operable by keyboard', async ({ page }) => {
      await page.goto('/decisions');
      const firstRow = page.getByRole('row').nth(1);
      await firstRow.focus();
      await expect(firstRow).toBeFocused();

      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/decisions\/dec_/);
    });

    // One test per page, matching the axe loop above rather than visiting all
    // sixteen inside a single test. As one test it took 29.4s of a 30s budget
    // on a saturated machine — it was not slow, it was sixteen page visits
    // sharing the budget its neighbours each get for one. A CI runner slower
    // than this desktop would have failed it, and the failure would have named
    // the whole suite rather than the page at fault.
    for (const target of PAGES) {
      test(`${target.name} has exactly one h1`, async ({ page }) => {
        await page.goto(target.path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      });
    }
  });
});
