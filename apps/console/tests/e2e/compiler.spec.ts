import { test, expect } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * The compiler is only useful if its findings reach the person who can act on
 * them. These assert the verdict is visible, specific, and tells them what to do.
 */

test.describe('compiler output in the console', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test('flags a flow that fails to compile in the list', async ({ page }) => {
    await page.goto('/decision-flows');

    const row = page.getByRole('row').filter({ hasText: 'entertainment-cross-sell' });

    // The visible summary, and the glyph's accessible name for anyone who
    // cannot see the colour.
    // One error, not two. The flow that used to sit here failed on both a
    // missing arbitrate node and an undeliverable candidate; this one fails on
    // the first alone, which is the clearer subject for a test about the list
    // reporting a count.
    await expect(row.getByText('1 error', { exact: true })).toBeVisible();
    await expect(row.getByText('1 compile error')).toBeAttached();

    // The health ring reports the same thing at the top of the page.
    await expect(page.getByText('Compilation', { exact: true })).toBeVisible();
    await expect(page.getByText('blocked', { exact: true })).toBeVisible();
  });

  test('shows why it fails, and what to do about it', async ({ page }) => {
    await page.goto('/decision-flows/entertainment-cross-sell');

    await expect(page.getByText('Blocked. These errors would produce wrong or undeliverable decisions.', { exact: true })).toBeVisible();

    // The specific defect, not a generic failure. Exact, because the registry
    // log on the same page also names the codes in its refusal summary — which
    // is the compilation gate working, not a duplicate.
    await expect(page.getByText('NO_ARBITRATION', { exact: true })).toBeVisible();
    await expect(
      page.getByText('The flow has no arbitrate node, so it can never select a winner.', { exact: true })
    ).toBeVisible();

    // A remedy, phrased for someone who is not the compiler author.
    // The remedy's whole line, label included: the report renders it as "Fix: <remedy>".
    await expect(page.getByText('Fix: Add an arbitrate node as the final step.', { exact: true })).toBeVisible();

    // `NO_DELIVERABLE_CREATIVE` used to be asserted here too, because the flow
    // that used to fail failed on both. This one has a deliverable candidate
    // set and fails only on arbitration. That check is exercised against its
    // own constructed case in `tests/unit/compile-context.test.ts`, which
    // judges the live flow against a channel this tenant has no content for —
    // a stronger place for it than a fixture that happened to be broken.
  });

  test('shows a passing flow with its pinned versions and cost', async ({ page }) => {
    await page.goto('/decision-flows/next-best-action');

    await expect(page.getByText('passing', { exact: true })).toBeVisible();
    await expect(page.getByText('Validated against the catalogue. Safe to publish.', { exact: true })).toBeVisible();

    // Pinning is the reason replay works, so it has to be visible.
    await expect(page.getByText('Pinned at compile time', { exact: true })).toBeVisible();
    await expect(page.getByText(/@metis\/nodes-core@1\.4\.0/)).toBeVisible();
    await expect(page.getByText(/@metis\/core@2\.1\.0/)).toBeVisible();
    // No model version, because this tenant's flow runs no scoring node: P and
    // C are the approved defaults and the trace records that. A model pin
    // asserted here would be asserting a node the flow does not have.

    // Critical path against budget, not the sum of every node — and it
    // includes the connectors the source node waits on, which is why it is
    // tens of milliseconds rather than the ~9ms the nodes themselves cost.
    // 33.2ms here: `conn_serviceability` declares 45ms p95 and dominates,
    // which is also why this flow carries a LATENCY_NEAR_BUDGET warning.
    await expect(page.getByText('Critical path', { exact: true })).toBeVisible();
    await expect(page.getByText(/33\.2ms \/ 50ms/)).toBeVisible();
  });

  test('surfaces the missing-score warning that made a flow return nothing', async ({
    page,
  }) => {
    await page.goto('/decision-flows/next-best-action');

    await expect(page.getByText('ARBITRATION_MISSING_SCORE', { exact: true }).first()).toBeVisible();
    // Once in the compile report, and once for each published version, which
    // each kept the warning it shipped with. All of them should say it — a
    // version that shipped with a warning is a different thing to explain
    // later than one that shipped clean, and that is a fact about the version,
    // not about the flow.
    //
    // Two: the compile report, and the one published version. It was five when
    // the flow had four of them. The count is deliberately exact rather than
    // "at least one" — the point is that *every* version says it, and a
    // `toBeVisible` on the first would pass while later versions silently
    // dropped the warning they shipped with.
    //
    // And the warning is now permanent rather than incidental. This tenant's
    // flow has no scoring node by design: the customer's brief ranks on an
    // adaptive model this platform does not have, so propensity and context are
    // the flow's approved defaults and arbitration says so on every decision.
    const versions = 1;
    await expect(page.getByText(/no scoring node runs before it/)).toHaveCount(1 + versions);
  });
});
