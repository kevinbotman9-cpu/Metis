import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, ACCOUNTS } from '../e2e/helpers';

/**
 * Route bundle budgets.
 *
 * The definition of done has said "route bundle size within budget (checked in
 * CI)" since the beginning and nothing checked it. This is that check.
 *
 * It measures what a browser actually transfers on a cold load of a production
 * build, rather than reading Next's build output. Two reasons: `next build`
 * stopped printing size columns in 16.x, and the manifests underneath it are
 * undocumented internals that move between versions — a check built on those
 * would break on an upgrade and tell us nothing about the product. What the
 * browser downloads is what the budget is about, and it survives the bundler
 * being replaced.
 *
 * Runs against `next start`, not `next dev`: dev serves unminified modules
 * with HMR attached, so its numbers are meaningless as a budget.
 */

interface Budgets {
  default: number;
  routes: Record<string, number>;
}

const budgets: Budgets = JSON.parse(
  readFileSync(resolve(__dirname, '../../bundle-budgets.json'), 'utf8')
);

const KB = 1024;

/** Routes worth a budget: the heaviest, plus one cheap page as a control. */
const ROUTES = Object.keys(budgets.routes);

test.describe('route bundle budgets', () => {
  for (const route of ROUTES) {
    test(`${route} is within budget`, async ({ page }) => {
      let jsBytes = 0;

      // Measured from the body, not from `content-length`: Next serves these
      // chunked, the header is absent, and reading it gave 0 kB for every
      // route — eight green tests measuring nothing.
      const pending: Promise<void>[] = [];
      page.on('response', (res) => {
        const url = res.url();
        if (!url.includes('/_next/static/') || !url.endsWith('.js')) return;
        pending.push(
          res
            .body()
            .then((b) => {
              jsBytes += b.length;
            })
            // A response whose body is gone by the time we ask is not a reason
            // to fail the build; it is a reason not to count it.
            .catch(() => {})
        );
      });

      // Every route but /login is behind auth, and logging in first would warm
      // the cache and hide the cost. Authenticate, then load cold.
      if (route !== '/login') {
        await login(page, ACCOUNTS.marcus);
        await page.context().clearCookies({ name: '__never' }).catch(() => {});
      }

      jsBytes = 0;
      pending.length = 0;
      await page.goto(route, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await Promise.all(pending);

      // A route that ships no JavaScript at all is not a pass, it is a broken
      // measurement — which is precisely how this check first shipped.
      expect(jsBytes, `measured 0 bytes for ${route}; the check is not measuring`).toBeGreaterThan(0);

      const budget = budgets.routes[route] ?? budgets.default;
      const actual = Math.round((jsBytes / KB) * 10) / 10;

      // Reported on every run, pass or fail: a budget nobody sees the headroom
      // on is a budget that gets raised in a hurry the first time it trips.
      // eslint-disable-next-line no-console
      console.log(`${route}: ${actual} kB of ${budget} kB`);

      expect(
        actual,
        `${route} ships ${actual} kB of JavaScript against a ${budget} kB budget. ` +
          'Either trim it or raise the budget deliberately in bundle-budgets.json, ' +
          'saying in the commit message what got bigger and why it earns its place.'
      ).toBeLessThanOrEqual(budget);
    });
  }
});
