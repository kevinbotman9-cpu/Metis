import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login, ACCOUNTS, openAccountPanel } from './helpers';

/**
 * WCAG 2.2 AA, per the definition of done. Runs against real rendered pages in
 * both themes, because a contrast regression only shows in one of them.
 */

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/objectives', name: 'objectives' },
  { path: '/offers', name: 'offers' },
  { path: '/creatives', name: 'creatives' },
  { path: '/creatives?view=coverage', name: 'creative coverage' },
  { path: '/offers/prop_5g_unlimited_24', name: 'offer detail' },
  { path: '/targeting-policies', name: 'targeting policies' },
  { path: '/frequency-policy', name: 'frequency policy' },
  { path: '/arbitration', name: 'arbitration' },
  { path: '/decision-flows', name: 'flows' },
  { path: '/placements', name: 'placements' },
  // The detail routes were outside this sweep entirely until 2026-09-06,
  // which meant the compile report, the flow canvas, the registry panel and
  // the shadow panel had never been scanned.
  { path: '/decision-flows/next-best-action', name: 'flow detail' },
  { path: '/decisions', name: 'decisions' },
  { path: '/performance', name: 'performance' },
  // The Cascade's stage panes are separate renders reached by a query
  // parameter, and the first paint scan says nothing about them. `deliverable`
  // is the break — the one pane whose whole job is contrast against a
  // background — and `acted` is the only one carrying a table.
  { path: '/performance?stage=deliverable', name: 'performance, the break' },
  { path: '/performance?stage=acted', name: 'performance, acted on' },
  { path: '/experiments', name: 'experiments' },
  { path: '/data-model', name: 'data model' },
  { path: '/data-model/intake', name: 'intake' },
  { path: '/integrations', name: 'integrations' },
  { path: '/integrations/traffic', name: 'inbound traffic' },
  { path: '/approvals', name: 'approvals' },
  { path: '/approvals/cr_0042', name: 'change set' },
  { path: '/agentic', name: 'agentic' },
  { path: '/audit', name: 'audit' },
  { path: '/settings', name: 'settings' },
  { path: '/simulations', name: 'simulations' },
];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * The decision trace, reached by clicking rather than by a hardcoded id.
 *
 * Decision ids are generated, so there is no stable path to put in PAGES —
 * and this page is the design north star, so leaving it unscanned because the
 * URL was awkward was the wrong trade.
 */
async function openFirstTrace(page: import('@playwright/test').Page) {
  await page.goto('/decisions');
  await page.locator('tr[data-row]').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

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

    test('the decision trace has no violations', async ({ page }) => {
      await openFirstTrace(page);

      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`)
      ).toEqual([]);
    });

    test('dark theme has no contrast violations', async ({ page }) => {
      await openAccountPanel(page, /Marcus Webb/);
      await page.getByRole('group', { name: 'Colour scheme' }).getByText('Dark').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      for (const path of ['/', '/decisions', '/offers', '/agentic']) {
        await page.goto(path);
        // `goto` resolves before React has rendered, and axe throws "No
        // elements found for include" rather than failing an assertion — a
        // scan that never ran, reported as a violation nobody can read.
        await expect(page.locator('main')).toBeVisible();
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
