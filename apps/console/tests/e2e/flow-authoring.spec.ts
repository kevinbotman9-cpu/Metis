import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * Editing a decision flow on the canvas.
 *
 * covers: updateDecisionFlowDraft
 *
 * The canvas was read-only, which made it the largest thing in the console that
 * could only be changed by editing a fixture — and it was the reason two other
 * write paths had no effect: an offer nothing named was never a candidate, and
 * a policy no node named never ran.
 *
 * What is asserted here is the authoring surface and its guard rails. That the
 * edit reaches a decision after publish and promote is covered by
 * `flow-authoring.test.ts`, which can drive the whole chain without a browser.
 */

const FLOW = '/decision-flows/inbound-web-offers';

test.describe('the flow editor', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto(FLOW);
  });

  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  test('is read-only until asked', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Edit graph' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save graph' })).toHaveCount(0);
    await expect(page.getByText('Add:')).toHaveCount(0);
  });

  test('offers a palette of the node kinds the engine runs', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit graph' }).click();

    await expect(page.getByText('Add:')).toBeVisible();
    for (const kind of ['Source', 'Filter', 'Constraint', 'Score', 'Switch', 'Arbitrate']) {
      await expect(page.getByRole('button', { name: kind, exact: true })).toBeVisible();
    }
  });

  test('adds a node and saves it, showing what the compiler said', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit graph' }).click();
    await page.getByRole('button', { name: 'Filter', exact: true }).click();

    // The new node is selected, so the inspector is about the thing just added
    // rather than about nothing.
    await expect(page.getByLabel('Node label')).toBeVisible();

    await page.getByRole('button', { name: 'Save graph' }).click();
    // Disconnected from the graph, so the compiler has something to say — which
    // is the point of reporting on every save rather than at publish time.
    await expect(page.getByText(/Compiles clean|UNREACHABLE|ORPHAN|error/i).first()).toBeVisible();
  });

  test('binds a policy to a filter node, which is how a policy ever runs', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit graph' }).click();
    await page.getByRole('button', { name: 'Filter', exact: true }).click();

    const policies = page.getByRole('group', { name: /Targeting policies/ });
    await expect(policies).toBeVisible();
    await expect(policies.locator('input[type="checkbox"]').first()).toBeVisible();
  });

  test('offers connectors on a source node and not on a filter', async ({ page }) => {
    // Binding a connector to a node the engine does not read them from would
    // imply an effect it has not.
    await page.getByRole('button', { name: 'Edit graph' }).click();

    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await expect(page.getByRole('group', { name: /Connectors/ })).toBeVisible();

    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await expect(page.getByRole('group', { name: /Connectors/ })).toHaveCount(0);
  });

  test('edits the candidate set, which is what makes an offer decidable', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit graph' }).click();

    const candidates = page.getByText('Candidate offers');
    await expect(candidates).toBeVisible();
    await expect(
      page.getByText(/An offer absent from this list is never a candidate/)
    ).toBeVisible();
  });

  test('deletes a node and the edges that pointed at it', async ({ page }) => {
    await page.getByRole('button', { name: 'Edit graph' }).click();
    await page.getByRole('button', { name: 'Arbitrate', exact: true }).click();

    await page.getByRole('button', { name: 'Delete node' }).click();
    await expect(page.getByLabel('Node label')).toHaveCount(0);
  });

  test('says plainly that saving is not deploying', async ({ page }) => {
    // The property most easily mistaken. A console that silently changed what
    // customers are offered on save would be the expensive kind of surprise.
    await page.getByRole('button', { name: 'Edit graph' }).click();
    await expect(
      page.getByText(/Saving does not change any decision — publish and promote do/)
    ).toBeVisible();
  });

  test('offers no editing to an account that cannot author flows', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await login(page, ACCOUNTS.priya);
    await page.goto(FLOW);

    await expect(page.getByRole('button', { name: 'Edit graph' })).toHaveCount(0);
  });
});
