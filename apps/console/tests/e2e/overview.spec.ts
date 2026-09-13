import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * The Overview is the loop, read as a Cascade, under the product's thesis.
 * `docs/METIS_CONSOLE_SPEC.md` §4.7.
 *
 * It was a greeting over four doughnuts with the agent panels beneath them.
 * What this asserts is the arrangement that replaced it, and the rules the
 * pattern imposes: the proposals come before the loop; first paint selects no
 * stage and shows the loop whole; every stage is a subset of the one above;
 * selecting a stage changes the middle and right panes and never the rail.
 *
 * Setup is a sign-in. Everything else is reached by clicking.
 */

const rail = (page: Page) => page.getByRole('navigation', { name: 'The loop' });

/** The five stage figures, read from the rail's own accessible names. */
async function stageFigures(page: Page): Promise<number[]> {
  const buttons = rail(page).getByRole('button');
  await expect(buttons).toHaveCount(5);
  const labels = await buttons.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  return labels.map((l) => {
    const m = /^[^:]+:\s*([\d,]+)/.exec(l);
    if (!m) throw new Error(`no figure in the rail label "${l}"`);
    return Number(m[1].replace(/,/g, ''));
  });
}

test.describe('the Overview is the loop @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'The loop' })).toBeVisible();
  });

  test('puts what agents proposed above the loop they would change', async ({ page }) => {
    const proposals = page.getByRole('heading', { name: 'Proposed changes' });
    const activity = page.getByRole('heading', { name: 'Agent activity' });
    await expect(proposals).toBeVisible();
    await expect(activity).toBeVisible();
    await expect(rail(page)).toBeVisible();

    const railTop = (await rail(page).boundingBox())!.y;
    expect((await proposals.boundingBox())!.y).toBeLessThan(railTop);
    expect((await activity.boundingBox())!.y).toBeLessThan(railTop);

    // And the four doughnuts it replaced are gone rather than moved.
    await expect(page.getByText('Flow compilation')).toHaveCount(0);
  });

  test('first paint selects nothing and shows the loop whole', async ({ page }) => {
    expect(new URL(page.url()).searchParams.get('stage')).toBeNull();
    await expect(page.getByText('Realised value', { exact: true })).toBeVisible();
    await expect(page.getByText('Expected, at the ceiling', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'From decision to outcome' })).toBeVisible();
    for (const trend of ['Decisions per day', 'Deliverable share']) {
      await expect(page.getByText(trend, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/^Seen per day · /)).toBeVisible();
  });

  test('every stage is within the one above it', async ({ page }) => {
    const figures = await stageFigures(page);
    for (let i = 1; i < figures.length; i++) {
      expect(figures[i], `stage ${i + 1} exceeds stage ${i}`).toBeLessThanOrEqual(figures[i - 1]);
    }
  });

  test('selecting a stage changes the middle and the evidence, never the rail', async ({ page }) => {
    const before = await stageFigures(page);

    await rail(page).getByRole('button', { name: /^Deliverable: / }).click();
    await expect(page).toHaveURL(/[?&]stage=deliverable/);
    await expect(page.getByRole('heading', { name: /could be delivered$/ })).toBeVisible();
    await expect(page.getByText('Realised value', { exact: true })).toHaveCount(0);

    expect(await stageFigures(page)).toEqual(before);
  });

  test('a proposal opens onto the change set a person approves', async ({ page }) => {
    const first = page.locator('a[href^="/approvals/cr_"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/approvals\/cr_/);
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  });
});
