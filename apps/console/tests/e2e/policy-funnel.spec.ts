import { test, expect, type Locator, type Page } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * The policy funnel: where candidates fall out of decisions, summed.
 *
 * Nothing here names a figure or a rule from the seeded corpus. The corpus is a
 * fact about one tenant; what this screen promises is structure — the stages
 * nest, a stage no flow asks removes nothing, the rules add up to their stage,
 * and every rule's count opens a decision it came from. Those hold for any
 * tenant, so they are what is asserted (G-096 is what happens otherwise).
 */

const rail = (page: Page) => page.getByRole('navigation', { name: 'Where candidates fall out' });

/** A rail stage's figure and removals, read from the name the rail gives it. */
async function readStage(button: Locator) {
  const name = (await button.getAttribute('aria-label')) ?? '';
  const figure = /^[^:]+: ([\d,]+),/.exec(name);
  const removed = /, ([\d,]+) removed here/.exec(name);
  const toNumber = (m: RegExpExecArray | null) => (m ? Number(m[1].replace(/,/g, '')) : 0);
  return { name, value: toNumber(figure), removed: toNumber(removed), notAsked: name.includes('not asked by these flows') };
}

test.describe('the policy funnel @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/targeting-policies');
    await page.getByRole('button', { name: 'Funnel' }).click();
    await expect(page).toHaveURL(/view=funnel/);
    await expect(rail(page)).toBeVisible();
  });

  test('the stages nest, from the candidates that entered to the ones offered', async ({ page }) => {
    const buttons = rail(page).getByRole('button');
    await expect(buttons).toHaveCount(8);

    const stages = [];
    for (const b of await buttons.all()) stages.push(await readStage(b));
    expect(stages[0].name).toMatch(/^Candidates entered: /);
    expect(stages[0].value).toBeGreaterThan(0);

    for (let i = 1; i < stages.length; i += 1) {
      // Each stage is what the stage above left, less what this one removed.
      expect(stages[i].value, stages[i].name).toBe(stages[i - 1].value - stages[i].removed);
      // A stage no flow asks cannot have removed anything.
      if (stages[i].notAsked) expect(stages[i].removed, stages[i].name).toBe(0);
    }
  });

  test('an architect finds the rule that removed the most, and opens a decision it removed', async ({ page }) => {
    const buttons = await rail(page).getByRole('button').all();
    const stages = await Promise.all(buttons.map(readStage));
    const most = stages.reduce((best, s, i) => (s.removed > stages[best].removed ? i : best), 1);
    expect(stages[most].removed, 'some stage removed something').toBeGreaterThan(0);

    await buttons[most].click();
    await expect(buttons[most]).toHaveAttribute('aria-current', 'step');
    await expect(page).toHaveURL(/stage=/);

    const table = page.getByRole('table', { name: /^Rules that removed candidates at / });
    const rows = table.locator('tbody tr');
    const removedByRule: number[] = [];
    for (const row of await rows.all()) {
      removedByRule.push(Number(((await row.locator('td').nth(2).textContent()) ?? '').replace(/,/g, '')));
    }
    // Largest first, and together they are the whole stage.
    expect(removedByRule).toEqual([...removedByRule].sort((a, b) => b - a));
    expect(removedByRule.reduce((a, b) => a + b, 0)).toBe(stages[most].removed);

    const open = rows.first().getByRole('link', { name: /^Open a decision / });
    const href = (await open.getAttribute('href')) ?? '';
    expect(href).toMatch(/^\/decisions\/dec_/);
    await open.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(href.split('/').pop()!);
  });

  test('a stage is linkable, and the policies view is one click back', async ({ page }) => {
    const current = page.url();
    await page.goto(`${current}&stage=eligibility`);
    await expect(rail(page).getByRole('button', { name: /^Eligibility: / })).toHaveAttribute('aria-current', 'step');

    await page.getByRole('button', { name: 'Policies' }).click();
    await expect(page).not.toHaveURL(/view=funnel/);
    await expect(page.getByRole('heading', { name: 'All policies' })).toBeVisible();
  });
});
