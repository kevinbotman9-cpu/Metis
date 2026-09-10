import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * G-046. `/performance` showed undeliverable and delivered decisions with the
 * same marker.
 *
 * Four figures in a row — decisions, offered, offered nothing, with an outcome —
 * and a table of rates under them. Nothing on it distinguished a decision that
 * reached a customer from one that won a slot on a channel with no sender, and
 * 2,687 of the 3,426 that offered something are the second kind. A marketer read
 * "3,426 offered" and a click rate underneath it, and both were true and the
 * pair was a lie.
 *
 * Rebuilt on Cascade (`docs/METIS_CONSOLE_SPEC.md` §4.7): five stages, each a
 * subset of the one above, and the break where the loop stops drawn rather than
 * smoothed.
 *
 * Setup is a sign-in. Every number is checked against the ones beside it rather
 * than against a constant — a test that hard-codes 739 passes until somebody
 * edits a fixture and says nothing about whether the screen counted correctly.
 */

const STAGES = ['Decisions made', 'Offered something', 'Deliverable', 'Seen', 'Acted on'] as const;

const rail = (page: Page) => page.getByRole('navigation', { name: 'The loop' });

/**
 * The figure on one rail stage, read from the button's accessible name.
 *
 * Matched as a group rather than split on the separators: the figures are
 * grouped — `Offered something: 3,426, 33% of decisions` — so splitting on the
 * comma yields 3, and every nesting assertion below then passes or fails on the
 * first digit of each stage rather than on the stage.
 */
async function stage(page: Page, label: string): Promise<number> {
  const button = rail(page).getByRole('button', { name: new RegExp(`^${label}: `) });
  await expect(button).toBeVisible({ timeout: 20_000 });
  const name = (await button.getAttribute('aria-label')) ?? '';
  const match = /: ([\d,]+),/.exec(name);
  expect(match, `no figure in "${name}"`).not.toBeNull();
  return Number(match![1].replace(/,/g, ''));
}

async function open(page: Page) {
  await page.goto('/performance');
  await expect(page.getByRole('heading', { level: 1, name: 'Performance' })).toBeVisible();
  await expect(rail(page)).toBeVisible({ timeout: 20_000 });
}

test.describe('performance reads as a cascade @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
  });

  test('the rail is the loop, and every stage is a subset of the one above it', async ({
    page,
  }) => {
    await open(page);

    const values: number[] = [];
    for (const label of STAGES) values.push(await stage(page, label));

    // The property the pattern rests on. A stage larger than the one above it
    // means the two counted different populations — which is exactly the defect
    // G-041 left behind one level out, where 887 impressions sat under 738
    // deliverable decisions and nobody noticed for a week.
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i], `${STAGES[i]} exceeds ${STAGES[i - 1]}`).toBeLessThanOrEqual(values[i - 1]);
    }
    expect(values[0], 'the seeded corpus decided something').toBeGreaterThan(0);
  });

  test('the break is stated on the stage, with the count that fell out of it', async ({ page }) => {
    await open(page);

    const offered = await stage(page, 'Offered something');
    const deliverable = await stage(page, 'Deliverable');
    const lost = offered - deliverable;

    // The whole point of the rebuild: the number is on the screen, in words,
    // attached to the stage it happened at. Read from the rail rather than from
    // anywhere on the page, so a sentence elsewhere cannot satisfy it.
    const broken = rail(page).getByRole('button', { name: /^Deliverable: / });
    await expect(broken).toContainText(`${lost.toLocaleString('en-GB')} decisions won a slot`);
    await expect(broken).toContainText('reached nobody');

    // And it names the channels, because "some channels" is not actionable.
    const label = (await broken.getAttribute('aria-label')) ?? '';
    expect(label).toMatch(/SMS|Email|Push|Outbound call/);
  });

  test('every rate below the break says which channel it describes', async ({ page }) => {
    await open(page);

    // Not a caveat in a footnote. The rail's own foot carries it, and so does
    // the sentence over the rates. A percentage computed on one delivered
    // channel of five is not a rate for the product, and this is the line that
    // stops somebody quoting it as one.
    await expect(rail(page)).toContainText(/every figure below Deliverable describes/i);
    await expect(page.getByText(/Every rate below the break describes/)).toContainText('Web only');
  });

  test('selecting a stage keeps the rail and puts the choice in the URL', async ({ page }) => {
    await open(page);

    await rail(page).getByRole('button', { name: /^Deliverable: / }).click();
    await expect(page).toHaveURL(/\/performance\?stage=deliverable/);

    // Losing the rail on selection turns a decomposition into a drill-down and
    // the reader loses their place in the whole. §4.7.
    for (const label of STAGES) {
      await expect(rail(page).getByRole('button', { name: new RegExp(`^${label}: `) })).toBeVisible();
    }
    await expect(
      rail(page).getByRole('button', { name: /^Deliverable: / })
    ).toHaveAttribute('aria-current', 'step');

    // And clicking the open stage closes it. A rail that can only be entered
    // leaves the reader on a drill-down with no way back to the shape except
    // the browser, and the shape is the thing this screen is for.
    await rail(page).getByRole('button', { name: /^Deliverable: / }).click();
    await expect(page).toHaveURL(/\/performance$/);
    await expect(page.getByText('From decision to outcome')).toBeVisible();
  });

  test('the rail is operable from the keyboard alone', async ({ page }) => {
    await open(page);

    // The definition of done asks for a full keyboard path with visible focus.
    // Worth its own check rather than a manual pass: the rail is five buttons
    // carrying a sparkline and three nested spans each, and it would be easy to
    // reach for a div with an onClick and lose this without noticing.
    const broken = rail(page).getByRole('button', { name: /^Deliverable: / });
    await broken.focus();
    await expect(broken).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/stage=deliverable/);
    await expect(broken).toHaveAttribute('aria-current', 'step');

    // Space closes it again, and focus stays where the reader put it rather
    // than being thrown to the top of the pane that just changed.
    await page.keyboard.press(' ');
    await expect(page).toHaveURL(/\/performance$/);
    await expect(broken).toBeFocused();
  });

  test('first paint shows the value realised, the value forgone and the loop as volume', async ({
    page,
  }) => {
    await open(page);

    await expect(page.getByText('Realised value')).toBeVisible();
    await expect(page.getByText('Never had the chance')).toBeVisible();

    // Both expectation figures are ceilings — expected margin is what an offer
    // is worth if it is taken, and there is no propensity in a decision record
    // to weight it by. Putting £2.6m beside £3.4k without saying so is the same
    // class of true-numbers-false-impression this screen was rebuilt to stop,
    // so the qualifier is asserted rather than trusted to survive an edit.
    await expect(page.getByText(/a bound, not a forecast/)).toBeVisible();
    await expect(page.getByText(/the same ceiling over the/)).toBeVisible();

    // The flow diagram draws the drop-outs as volume leaving. Its accessible
    // name has to carry the same five figures the rail does, or a reader who
    // cannot see it gets a different report from one who can.
    const flow = page.getByRole('img', { name: /^The loop as volume/ });
    await expect(flow).toBeVisible();
    const described = (await flow.getAttribute('aria-label')) ?? '';
    for (const label of STAGES) {
      const value = await stage(page, label);
      expect(described).toContain(`${label} ${value.toLocaleString('en-GB')}`);
    }
  });

  test('the middle pane holds the stage and the right pane holds its evidence', async ({
    page,
  }) => {
    await open(page);
    await rail(page).getByRole('button', { name: /^Seen: / }).click();

    const seen = await stage(page, 'Seen');
    // Middle: what the stage is.
    await expect(
      page.getByRole('heading', { name: `${seen.toLocaleString('en-GB')} were seen` })
    ).toBeVisible();

    // Right: the evidence. The per-channel breakdown has to sum to the stage,
    // or the two panes are describing different things.
    // `exact` because the middle pane's own heading is "416 were seen", and a
    // substring match on "Seen" finds both panes.
    const evidence = page
      .getByRole('heading', { level: 2, name: 'Seen', exact: true })
      .locator('..');
    // The definition list's values, not every number in the pane: filtering the
    // pane's digits by "not equal to the stage total" silently drops the
    // channel that happens to carry all of it, which on this tenant is web and
    // is every one of the 416.
    const perChannel = (await evidence.locator('dd').allInnerTexts()).map((t) =>
      Number(t.replace(/[^0-9]/g, ''))
    );
    expect(perChannel.length, 'the evidence pane broke the stage down').toBeGreaterThan(1);
    expect(perChannel.reduce((a, b) => a + b, 0)).toBe(seen);
  });

  test('a decision on a channel nothing sends gets no rate at all', async ({ page }) => {
    await open(page);
    await rail(page).getByRole('button', { name: /^Acted on: / }).click();

    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 20_000 });

    // The defect, stated as a check. A row on an undeliverable channel is
    // marked as such and reports an em dash rather than 0.0% — zero would claim
    // the offer was shown and ignored, when nothing sent it.
    const undeliverable = table.locator('tbody tr').filter({ hasText: 'SMS' }).first();
    await expect(undeliverable).toBeVisible();
    const cells = await undeliverable.locator('td').allInnerTexts();
    expect(cells.some((c) => c.trim() === '—')).toBe(true);
    expect(cells.every((c) => !/%$/.test(c.trim()))).toBe(true);
  });
});
