import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * The Overview is a landing page per persona. `lib/persona.ts`.
 *
 * - The marketer's is the loop, read as a Cascade, under the product's thesis
 *   (`METIS_CONSOLE_SPEC.md` §4.7). Sarah is a marketer as well as an architect,
 *   so she lands there.
 * - The decision architect's is the change pipeline, as panels (§4.5). Marcus is
 *   an administrator and an architect, so he lands there.
 * - An account that can see both chooses with the switch in the chrome, and the
 *   choice survives a reload. An account with neither persona gets the loop and
 *   no switch.
 *
 * Setup is a sign-in. Everything else is reached by clicking.
 */

const rail = (page: Page) => page.getByRole('navigation', { name: 'The loop', exact: true });
const personaSwitch = (page: Page) => page.getByRole('group', { name: 'Overview persona', exact: true });
/** A panel of the architect's Overview: the card holding a heading of that name. */
const panel = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

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

test.describe("the marketer's Overview is the loop @screen-only", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'The loop', exact: true })).toBeVisible();
  });

  test('puts what agents proposed above the loop they would change', async ({ page }) => {
    const proposals = page.getByRole('heading', { name: 'Proposed changes', exact: true });
    const activity = page.getByRole('heading', { name: 'Agent activity', exact: true });
    await expect(proposals).toBeVisible();
    await expect(activity).toBeVisible();
    await expect(rail(page)).toBeVisible();

    const railTop = (await rail(page).boundingBox())!.y;
    expect((await proposals.boundingBox())!.y).toBeLessThan(railTop);
    expect((await activity.boundingBox())!.y).toBeLessThan(railTop);

    // And the four doughnuts it replaced are gone rather than moved.
    await expect(page.getByText('Flow compilation', { exact: true })).toHaveCount(0);
  });

  test('first paint selects nothing and shows the loop whole', async ({ page }) => {
    expect(new URL(page.url()).searchParams.get('stage')).toBeNull();
    await expect(page.getByText('Realised value', { exact: true })).toBeVisible();
    await expect(page.getByText('Expected, at the ceiling', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'From decision to outcome', exact: true })).toBeVisible();
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

  test('a proposal opens onto its change set', async ({ page }) => {
    const first = page.locator('a[href^="/approvals/cr_"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/approvals\/cr_/);
    // Sarah cannot approve — that is `approve:changes`, which Marcus holds and she
    // does not — so this asserts the change set opened, not a control she is not given.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe("the architect's Overview is the change pipeline @screen-only", () => {
  const PANELS = ['Proposed', 'Simulated', 'Released', 'Flows', 'What the engines are held to'];

  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'The change pipeline', exact: true })).toBeVisible();
  });

  test('is panels, not a rail: its counts are of different things', async ({ page }) => {
    for (const title of PANELS) await expect(panel(page, title)).toBeVisible();
    await expect(rail(page)).toHaveCount(0);
  });

  test('every panel says the window it covers and links to the screen that owns it', async ({ page }) => {
    for (const title of PANELS) {
      const card = panel(page, title);
      // The window sits under the title, in the card's header.
      await expect(card.locator('header p').first(), `${title}: a window`).not.toBeEmpty();
      const owner = card.locator('header a').first();
      await expect(owner, `${title}: a link`).toBeVisible();
      expect(await owner.getAttribute('href'), `${title}: to a screen`).toMatch(/^\/[a-z-]+$/);
    }
  });

  test('a panel is as tall as what it holds, not as tall as the panel beside it', async ({ page }) => {
    const proposed = panel(page, 'Proposed');
    const simulated = panel(page, 'Simulated');
    await expect(proposed.locator('a[href^="/approvals/cr_"]').first()).toBeVisible();
    await expect(simulated.getByRole('row').nth(1)).toBeVisible();
    const p = (await proposed.boundingBox())!;
    const s = (await simulated.boundingBox())!;
    // Side by side, and the simulation table is the longer of the two.
    expect(Math.abs(p.y - s.y)).toBeLessThan(2);
    expect(p.height).toBeLessThan(s.height - 40);
  });

  test('says who can approve in words, and reads each bias ratio against its limit', async ({ page }) => {
    await expect(panel(page, 'Proposed').getByText(/waiting for someone who can approve changes\.$/)).toBeVisible();
    await expect(page.getByText(/approve:changes/)).toHaveCount(0);
    // cr_0039's simulation failed on bias, and its scope resolves the tenant's 1.20.
    const failed = panel(page, 'Simulated').getByRole('row').filter({ hasText: 'failed' });
    await expect(failed).toContainText('1.38');
    await expect(failed).toContainText('limit 1.20');
  });

  test('a proposal opens onto the change set a person approves', async ({ page }) => {
    const first = panel(page, 'Proposed').locator('a[href^="/approvals/cr_"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/approvals\/cr_/);
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  });

  test('says which flows compile, and opens each one', async ({ page }) => {
    const flows = panel(page, 'Flows').locator('a[href^="/decision-flows/"]');
    await expect(flows.first()).toBeVisible();
    for (const row of await flows.all()) {
      await expect(row).toContainText(/compiles|does not compile|not compiled/);
    }
  });

  test('names what holds each engine to the corpora, and never claims the checks passed', async ({ page }) => {
    const card = panel(page, 'What the engines are held to');
    await expect(card.getByText('kotlin-conformance', { exact: true })).toBeVisible();
    await expect(card.getByText('The conformance corpus matches the reference', { exact: true })).toBeVisible();
    // This screen cannot run either check, so a claim that they passed would be invented.
    await expect(card.getByText(/\b(passed|agree[sd]?|byte-identical)\b/i)).toHaveCount(0);
  });
});

test.describe('choosing a persona @screen-only', () => {
  test('an account that is both switches, and the choice survives a reload', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'The loop', exact: true })).toBeVisible();
    await expect(personaSwitch(page).getByRole('button', { name: 'Marketer' })).toHaveAttribute('aria-pressed', 'true');

    await personaSwitch(page).getByRole('button', { name: 'Architect' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'The change pipeline', exact: true })).toBeVisible();
    await expect(personaSwitch(page).getByRole('button', { name: 'Architect' })).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'The change pipeline', exact: true })).toBeVisible();

    await personaSwitch(page).getByRole('button', { name: 'Marketer' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'The loop', exact: true })).toBeVisible();
  });

  test('an account with neither persona lands on the loop and is offered no switch', async ({ page }) => {
    await login(page, ACCOUNTS.priya);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'The loop', exact: true })).toBeVisible();
    await expect(personaSwitch(page)).toHaveCount(0);
  });
});
