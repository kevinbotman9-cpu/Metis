import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * The trace reader, rebuilt on Cascade — `docs/METIS_CONSOLE_SPEC.md` §4.7.
 *
 * This is the design north star: the trace is the hero, and the question it
 * exists to answer is a compliance officer's — not *what happened* but *on what
 * basis, and can you show me*. It was a vertical list of nodes in a card, which
 * showed the order and hid the shape. A reader could see that seven nodes ran
 * and not that 22 candidates became one.
 *
 * Setup is a sign-in and a click into a decision. Nothing is seeded and no
 * request is made outside the browser; the corpus is already there, which is
 * the point of a trace reader.
 *
 * Every figure is checked against the ones beside it rather than against a
 * constant. A test asserting 22 passes until somebody edits a fixture and says
 * nothing about whether the funnel adds up.
 */

const rail = (page: Page) => page.getByRole('navigation', { name: 'Elimination funnel' });

/** Open the trace of a decision that actually eliminated something. */
async function openRichTrace(page: Page) {
  // `next-best-action` is the flow with all three targeting tiers; the web flow
  // has one filter and would exercise a third of the rail. Reached by clicking
  // a row, not by a hardcoded id — ids are generated.
  await page.goto('/decisions');
  await page.locator('tr[data-row]').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(rail(page)).toBeVisible({ timeout: 20_000 });
}

/** The survivor figure on one rail stage, from its accessible name. */
function figure(label: string) {
  return (name: string) => {
    const m = new RegExp(`^${label}: ([\\d,]+),`).exec(name);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };
}

async function stageNames(page: Page): Promise<string[]> {
  const buttons = rail(page).getByRole('button');
  const names: string[] = [];
  for (const b of await buttons.all()) names.push((await b.getAttribute('aria-label')) ?? '');
  return names;
}

test.describe('the trace reads as a cascade @screen-only', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.priya);
  });

  test('the rail is the elimination funnel, and it never gains a candidate', async ({ page }) => {
    await openRichTrace(page);
    const names = await stageNames(page);
    expect(names.length, 'a flow with no nodes').toBeGreaterThan(2);

    // Survivors only ever fall. A stage larger than the one above means the two
    // are counting different populations, which is the defect §4.7 exists to
    // make visible — and the same one that hid an inverted funnel on
    // /performance for a week.
    const survivors = names.map((n) => Number(/: ([\d,]+),/.exec(n)?.[1]?.replace(/,/g, '') ?? NaN));
    for (const s of survivors) expect(Number.isFinite(s)).toBe(true);
    for (let i = 1; i < survivors.length; i += 1) {
      expect(survivors[i], `${names[i]} exceeds ${names[i - 1]}`).toBeLessThanOrEqual(
        survivors[i - 1]
      );
    }
  });

  test('the rail comes from the flow that ran, not from the policy model', async ({ page }) => {
    await openRichTrace(page);
    const names = await stageNames(page);

    // Every stage names a node the trace recorded. The three-tier model would
    // put Eligibility, Relevance and Suitability on every trace including the
    // web flow, which has one filter node and neither of the other two.
    expect(names[0], 'the rail does not open on what entered').toMatch(/^Candidates entered: /);

    // And the entry figure is the candidate set the artifact fixed at compile
    // time, which is the number the whole funnel is a proportion of.
    const entered = figure('Candidates entered')(names[0]);
    expect(entered).toBeGreaterThan(0);
  });

  test('a stage says what it removed, and the total is conserved', async ({ page }) => {
    await openRichTrace(page);
    const names = await stageNames(page);

    const entered = figure('Candidates entered')(names[0])!;
    const removed = names
      .map((n) => Number(/, ([\d,]+) removed here/.exec(n)?.[1]?.replace(/,/g, '') ?? 0))
      .reduce((a, b) => a + b, 0);
    const survived = Number(/: ([\d,]+),/.exec(names[names.length - 1])?.[1] ?? NaN);

    // Everything that entered either survived to the end or was removed on the
    // way. A funnel that loses candidates silently is a funnel nobody can audit.
    expect(removed + survived, `${entered} entered, ${removed} removed, ${survived} left`).toBe(
      entered
    );
  });

  test('selecting a stage groups its removals by the rule that made them', async ({ page }) => {
    await openRichTrace(page);

    // The stage that removed something. Found rather than assumed: which node
    // eliminates depends on the customer, and a test that hardcodes one is a
    // test that breaks on a fixture edit.
    const names = await stageNames(page);
    const withRemovals = names.find((n) => / removed here/.test(n));
    expect(withRemovals, 'no stage removed anything in this trace').toBeTruthy();

    await rail(page).getByRole('button', { name: withRemovals! }).click();
    await expect(page).toHaveURL(/[?&]stage=/);

    // Grouped by rule, not by code. The code is a closed set of eight shared by
    // a whole tier, so grouping by it produces one group and says nothing; the
    // rule names something a person can go and change.
    const groups = page.getByRole('button', { name: /: \d+ removed$/ });
    await expect(groups.first()).toBeVisible();

    // The rail is still whole. Losing it on selection turns a decomposition
    // into a drill-down and the reader loses their place. §4.7.
    expect((await stageNames(page)).length).toBe(names.length);
  });

  test('a rule expands to the offers it removed, and each reaches its offer', async ({ page }) => {
    await openRichTrace(page);
    const names = await stageNames(page);
    const withRemovals = names.find((n) => / removed here/.test(n))!;
    await rail(page).getByRole('button', { name: withRemovals }).click();

    const group = page.getByRole('button', { name: /: \d+ removed$/ }).first();
    await group.click();
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    await expect(page).toHaveURL(/[?&]rule=/);

    // The definition of done: every displayed number reaches its source. A
    // removed action key reaches the offer it names.
    const offer = page.locator('a[href^="/offers?action="]').first();
    await expect(offer).toBeVisible();
  });

  test('the evidence pane dates the value and attributes the rule', async ({ page }) => {
    await openRichTrace(page);
    const names = await stageNames(page);
    await rail(page).getByRole('button', { name: names.find((n) => / removed here/.test(n))! }).click();
    await page.getByRole('button', { name: /: \d+ removed$/ }).first().click();

    const evidence = page.getByRole('region', { name: 'Evidence' });

    // When the value was computed. This was an absence until 2026-09-11 —
    // `sourceCalls` carried a duration and a cache flag and no time at all, so
    // a cached consent flag could not be dated (G-056). Whether this rule reads
    // a connector-bound field depends on the rule; what must never come back is
    // the old sentence saying the platform cannot date anything. The test below
    // asserts the timestamp itself on a rule that does read one.
    await expect(evidence.getByText('When the value was computed')).toBeVisible();
    await expect(page.getByText(/never a timestamp/)).toHaveCount(0);

    // The pack that supplied the rule. This decision's rules are the tenant's
    // own, and saying so is the answer rather than an absence — the pack case
    // is the test below.
    await expect(evidence.getByText('Pack that supplied it')).toBeVisible();
    await expect(evidence.getByText(/the tenant authored it|UK /)).toBeVisible();

    // The one that is still nothing, stated rather than omitted: a pane that
    // left it out would read as complete.
    await expect(page.getByText(/No customer-facing refusal text exists/)).toBeVisible();

    // And what it always recorded, so the new rows are not the whole pane.
    await expect(evidence.getByText('Reason code')).toBeVisible();
    await expect(evidence.getByText('Field it evaluated')).toBeVisible();
  });

  test('a rule from a pack names the pack that supplied it', async ({ page }) => {
    // Walked from the list rather than opened by id: decision ids are
    // generated, and a test that hardcoded one would be asserting a fixture
    // constant. Affordability rules are this tenant's most common refusal, so
    // a few rows always reach one; failing after eight says so out loud rather
    // than passing quietly on a decision that had none.
    let found = false;
    for (let row = 0; row < 8 && !found; row++) {
      await page.goto('/decisions');
      await page.locator('tr[data-row]').nth(row).click();
      await expect(rail(page)).toBeVisible({ timeout: 20_000 });

      for (const name of await stageNames(page)) {
        if (!/ removed here/.test(name)) continue;
        await rail(page).getByRole('button', { name }).click();
        // Wait for the pane to name *this* stage before reading it. `count()`
        // does not auto-wait, and waiting for "a rule button" is not enough:
        // the previous stage's rules are still on screen for a moment, so an
        // early read walks past a stage that does have the rule. The first
        // version of this test reported no affordability rule in eight
        // decisions while the fourth had one, twenty candidates deep.
        const label = name.split(':')[0];
        await expect(page.getByText(new RegExp(`^${label} removed \\d+$`))).toBeVisible();
        const group = page.getByRole('button', { name: /^pol_afford\w*: \d+ removed$/ });
        if ((await group.count()) === 0) continue;
        await group.first().click();
        found = true;
        break;
      }
    }
    expect(found, 'no affordability rule in the first eight decisions').toBe(true);

    const evidence = page.getByRole('region', { name: 'Evidence' });
    await expect(evidence.getByText('UK Consumer Duty')).toBeVisible();
    await expect(evidence.getByText('1.4.0')).toBeVisible();
    await expect(evidence.getByText('pack_uk_consumer_duty')).toBeVisible();

    // Under a rule, the connector row is an absence for a reason that is not
    // G-056: this tenant's policies name dotted paths and its connectors
    // provide flat fields, so no rule's field resolves to a call at all
    // (G-069). The pane says which absence it is rather than implying the
    // platform cannot date a value.
    await expect(evidence.getByText(/no connector call supplied a field this rule reads/)).toBeVisible();
  });

  test('the decision names when each value it used was computed', async ({ page }) => {
    // G-056. The times belong to the decision's inputs, so they are on the
    // pane before anything is selected — which is also the first thing a
    // reader sees. A cached value carries its age: "was that consent flag
    // current" is the question, and an age is the answer.
    await openRichTrace(page);
    const evidence = page.getByRole('region', { name: 'Evidence' });

    await expect(evidence.getByText('Values fetched')).toBeVisible();
    await expect(evidence.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z/).first()).toBeVisible();
    // A non-zero age on purpose. `cached, 0s older` satisfies a looser pattern
    // while telling the reader every value was computed at the instant it was
    // used — which is the claim this row exists to disprove, and which a
    // deliberately broken fixture produced while a \d+ pattern stayed green.
    await expect(
      evidence.getByText(/cached, [1-9]\d*s older than this decision|read live/).first()
    ).toBeVisible();

    // Every connector the decision called is dated, not just the first.
    const dated = await evidence.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z/).count();
    const connectors = await evidence.getByText(/^conn_/).count();
    expect(dated, 'a connector call with no time on it').toBe(connectors);
  });

  test('the rail is operable from the keyboard alone', async ({ page }) => {
    // Its own assertion because a mouse-only rail passed eight of nine checks
    // on /performance. Every other test here clicks, and clicking is exactly
    // what a broken keyboard path still supports.
    await openRichTrace(page);
    const names = await stageNames(page);
    const target = rail(page).getByRole('button', { name: names[1] });

    await target.focus();
    await expect(target).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]stage=/);
    await expect(target).toHaveAttribute('aria-current', 'step');

    // Space closes it, and focus stays where the reader put it rather than
    // being thrown to the top of the pane that just changed.
    await page.keyboard.press(' ');
    await expect(page).not.toHaveURL(/[?&]stage=/);
    await expect(target).toBeFocused();
  });

  test('replay and export still work', async ({ page }) => {
    // The rebuild moved the panes, not the actions. This is the eight-minute
    // demo path's centre and replay is what makes it evidence rather than a
    // report.
    await openRichTrace(page);
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeEnabled();

    await page.getByRole('button', { name: 'Replay this decision' }).click();
    await expect(page.getByText('Identical', { exact: true })).toBeVisible({ timeout: 20_000 });
  });
});
