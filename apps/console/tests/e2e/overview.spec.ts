import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS, expectFunnelShows } from './helpers';

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

  /**
   * The order was the other way until 2026-09-17, and the test asserted it:
   * the proposals and the agent feed came first, and the rail, the funnel and
   * the value cards — the strongest content on the screen — began below the
   * fold at 1680x1000. A landing page that opens on what is being *proposed*
   * about the loop, before the loop, buries its own subject.
   *
   * What the proposals must not do is leave. They are the second thing read,
   * not a thing removed.
   */
  test('leads with the loop, and keeps the proposals under it', async ({ page }) => {
    const proposals = page.getByRole('heading', { name: 'Proposed changes', exact: true });
    await expect(proposals).toBeVisible();
    await expect(rail(page)).toBeVisible();

    const railTop = (await rail(page).boundingBox())!.y;
    expect((await proposals.boundingBox())!.y).toBeGreaterThan(railTop);

    // The loop's own first figure is reachable without scrolling, which is the
    // point of the reorder rather than a side effect of it.
    const realised = page.getByText('Realised value', { exact: true });
    await expect(realised).toBeVisible();
    const viewport = page.viewportSize()!.height;
    expect((await realised.boundingBox())!.y).toBeLessThan(viewport);

    // And the four doughnuts it replaced are gone rather than moved.
    await expect(page.getByText('Flow compilation', { exact: true })).toHaveCount(0);
  });

  /**
   * The page fits, and the check says at what size.
   *
   * Cut on 2026-09-17, by the product owner: the agent-activity feed (it said
   * "Nothing in this feed" on every tenant — G-155), the evidence pane, the
   * thesis paragraph, the page's own description, and four sentences explaining
   * the screen to a reader who is on it. The value cards and the per-day cards
   * share a row, the rail drops its sparklines, and the flow diagram is capped.
   *
   * 1680x1000 is the size the comment above already named as the fold. The page
   * was 1315px of content in an 843px box at 1440x900 before this; it is 921
   * now, so **1440x900 still scrolls by 78px** and that is recorded rather than
   * hidden — the floor is the rail (584) and the proposals card (252).
   */
  test('fits without scrolling at 1680x1000', async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 1000 });
    await expect(rail(page)).toBeVisible();
    await expect(page.getByText('Realised value', { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => {
      const scroller = [...document.querySelectorAll<HTMLElement>('main')].find(
        (n) => ['auto', 'scroll'].includes(getComputedStyle(n).overflowY)
      );
      if (!scroller) throw new Error('no scroll container on the page');
      return scroller.scrollHeight - scroller.clientHeight;
    });
    expect(overflow, 'the Overview scrolls at 1680x1000').toBeLessThanOrEqual(0);
    // And fits as a funnel: the band of 2026-09-17 fitted too.
    await expectFunnelShows(page, { tallest: 88 });
  });

  test('has two panes, not three: no evidence column narrating the screen', async ({ page }) => {
    // The evidence quoted the loop's closure — which the rail says — and
    // explained the stages. `/performance` keeps its third pane.
    await expect(page.getByRole('region', { name: 'Evidence', exact: true })).toHaveCount(0);
    await expect(page.getByText(/Closed on Web only/)).toHaveCount(0);
    // Except the one sentence worth keeping, which moved onto the stage that dropped.
    await expect(rail(page)).toContainText(/decisions offered nothing/);
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

  test('selecting a stage changes the middle, never the rail', async ({ page }) => {
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

  test('every panel leads with a figure, not a sentence', async ({ page }) => {
    for (const title of PANELS) {
      const figure = panel(page, title).locator('[data-lead] .text-figure').first();
      await expect(figure, `${title}: a figure`).toBeVisible();
      await expect(figure, `${title}: a number`).toHaveText(/^[\d,]+( of [\d,]+)?$/);
    }
    // Set tight, as the drafts set it: body's 1.5 left a 12px gap above every figure.
    const { size, leading } = await panel(page, 'Proposed')
      .locator('[data-lead] .text-figure')
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { size: parseFloat(s.fontSize), leading: parseFloat(s.lineHeight) };
      });
    expect(leading / size).toBeLessThan(1.25);
  });

  /*
   * 'the bias ratio heading sits on one line' was here, and went with its
   * subject on 2026-09-16: the Simulated panel has no table while nothing
   * simulates, so there is no column header to wrap. It measured line boxes
   * with `getClientRects`, which needs a browser, so it could not move down to
   * the component tests the way the gate-line assertions did. The wrapping rule
   * comes back with the table, and is worth rewriting then rather than keeping
   * a test here that asserts the absence of a heading nobody renders.
   */

  test('cards sit at the drafts\' density: 14px padding, 10px headers, 12px apart', async ({ page }) => {
    const header = panel(page, 'Proposed').locator('header').first();
    await expect(header).toBeVisible();
    const pad = await header.evaluate((el) => {
      const s = getComputedStyle(el);
      return { top: s.paddingTop, left: s.paddingLeft };
    });
    expect(pad).toEqual({ top: '10px', left: '14px' });
    const gap = await panel(page, 'Proposed').locator('xpath=..').evaluate((el) => getComputedStyle(el).rowGap);
    expect(gap).toBe('12px');
  });

  test('every panel says the window it covers and links to the screen that owns it', async ({ page }) => {
    for (const title of PANELS) {
      const card = panel(page, title);
      // The window sits under the title, in the card's header, and says what the
      // panel covers: "Open now" and "Now" were fragments, not windows.
      await expect(card.locator('header p').first(), `${title}: a window`).toHaveText(/^\S+(\s+\S+){3,}/);
      const owner = card.locator('header a').first();
      await expect(owner, `${title}: a link`).toBeVisible();
      expect(await owner.getAttribute('href'), `${title}: to a screen`).toMatch(/^\/[a-z-]+$/);
    }
  });

  test('a panel is as tall as what it holds, not as tall as the panel beside it', async ({ page }) => {
    // The mechanism, not the consequence. This asserted that the simulation
    // table was the taller of the two panels, which was true only while the
    // change sets carried authored simulations; removing them on 2026-09-16
    // turned a layout check into a content check that failed. A test coupling
    // two panels' relative heights breaks on the next content change in
    // either, so what is asserted now is the grid rule that makes the property
    // hold whatever either panel holds.
    const proposed = panel(page, 'Proposed');
    const simulated = panel(page, 'Simulated');
    await expect(proposed).toBeVisible();
    await expect(simulated).toBeVisible();

    const row = await proposed.locator('xpath=..').evaluate((el) => {
      const s = getComputedStyle(el);
      return { align: s.alignItems, display: s.display };
    });
    expect(row.display).toContain('grid');
    // `stretch` is what pulls a short panel down to its neighbour's height.
    expect(row.align).not.toBe('stretch');

    // Side by side, so the rule is about two panels on one row.
    const p = (await proposed.boundingBox())!;
    const s = (await simulated.boundingBox())!;
    expect(Math.abs(p.y - s.y)).toBeLessThan(2);
  });

  test('says who can approve in words', async ({ page }) => {
    await expect(panel(page, 'Proposed').getByText('for someone who can approve changes', { exact: true })).toBeVisible();
    await expect(page.getByText(/approve:changes/)).toHaveCount(0);
  });

  test('says no simulation has run, rather than nothing or a table of empty columns', async ({ page }) => {
    // What replaced the bias-ratio assertions. Nothing simulates, so the panel
    // has no ratio to read against a limit; the reading of a ratio against the
    // autonomy limit that applies to it is covered where it can be exercised,
    // in `tests/unit/architect-overview-panels.test.tsx`.
    const simulated = panel(page, 'Simulated');
    await expect(simulated.getByText(/No simulation has run against/)).toBeVisible();
    await expect(simulated.getByText(/needs the profile store/)).toBeVisible();
    // The figures that were here are gone, not merely hidden behind a caption.
    await expect(simulated.getByRole('columnheader', { name: 'Bias ratio', exact: true })).toHaveCount(0);
    await expect(simulated.getByText('1.38')).toHaveCount(0);
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
