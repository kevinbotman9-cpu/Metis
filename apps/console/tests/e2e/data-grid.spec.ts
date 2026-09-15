import { test, expect } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';
import { decisions } from '@/mocks/fixtures/decisions';

/**
 * The corpus size, taken from the fixture rather than written down.
 *
 * These assertions exist to catch the grid reporting a page size instead of a
 * real total — they once caught it showing the query limit of 200. Naming the
 * number meant editing two tests every time the seeded tenant grew, and a
 * stale literal is a test that fails for the wrong reason.
 */
const CORPUS = decisions.length;

/**
 * The console has to stay usable at the volume the gap register assumes
 * ("virtualised 100k+ rows"), and the search has to be one box rather than a
 * field per parameter.
 */

test.describe('virtualised decision grid', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/decisions');
    await expect(page.getByText(/Only the visible rows are rendered/)).toBeVisible();
  });

  test('renders a window, not five thousand rows', async ({ page }) => {
    const rendered = await page.locator('tr[data-row]').count();

    expect(rendered).toBeGreaterThan(5);
    // The whole point: DOM cost is bounded regardless of result size.
    expect(rendered).toBeLessThan(100);
    // The list opens on offered decisions: 4,688 of the seed's 10,400.
    await expect(page.getByText(/of 4,688/)).toBeVisible();
  });

  test('advances the window when scrolled, keeping the DOM bounded', async ({ page }) => {
    const status = page.getByText(/Showing rows/);
    await expect(status).toContainText('Showing rows 1');

    const firstBefore = await page.locator('tr[data-row] td').first().innerText();

    const scroller = page.locator('div.overflow-auto').filter({ has: page.locator('tr[data-row]') });
    await scroller.hover();
    await page.mouse.wheel(0, 20000);
    await expect(status).not.toContainText('Showing rows 1–');

    const firstAfter = await page.locator('tr[data-row] td').first().innerText();
    expect(firstAfter).not.toBe(firstBefore);

    // Still bounded after scrolling a long way.
    expect(await page.locator('tr[data-row]').count()).toBeLessThan(100);
  });

  test('opens the trace for a row scrolled into view', async ({ page }) => {
    const scroller = page.locator('div.overflow-auto').filter({ has: page.locator('tr[data-row]') });
    await scroller.hover();
    await page.mouse.wheel(0, 8000);
    await expect(page.getByText(/Showing rows/)).not.toContainText('Showing rows 1–');

    const row = page.locator('tr[data-row]').nth(2);
    const id = (await row.locator('td').first().innerText()).trim();
    await row.click();

    await expect(page).toHaveURL(new RegExp(`/decisions/${id}$`));
  });
});

test.describe('smart search', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/decisions');
  });

  test('replaces the row of separate filter inputs with one box', async ({ page }) => {
    await expect(page.getByRole('combobox', { name: 'Search and filter', exact: true })).toBeVisible();
    // The old pattern: a labelled input per parameter.
    await expect(page.getByLabel('Channel', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Outcome', { exact: true })).toHaveCount(0);
  });

  /** Pull just the total out of "Showing rows 1-29 of 5,000." */
  async function totalRows(page: import('@playwright/test').Page) {
    const text = await page.getByText(/Showing rows/).innerText();
    const match = text.match(/of ([\d,]+)/);
    return Number((match?.[1] ?? '0').replace(/,/g, ''));
  }

  test('narrows results with a facet, and shows it as a dismissible chip', async ({ page }) => {
    // Read from the grid's own status, which counts the rows it was handed —
    // not the corpus, which is larger than one query asks for. The guard the
    // old literal carried was that this is real data rather than a page of 50.
    const totalBefore = await totalRows(page);
    expect(totalBefore).toBeGreaterThan(1000);
    expect(totalBefore).toBeLessThanOrEqual(CORPUS);

    await page.getByRole('combobox', { name: 'Search and filter', exact: true }).click();
    await page.getByRole('option', { name: /^Outcome/ }).click();
    await page.getByRole('option', { name: 'Outcome: Suppressed', exact: true }).click();

    // The choice becomes a chip.
    await expect(page.getByRole('button', { name: 'Remove filter Outcome: Suppressed', exact: true })).toBeVisible();

    // And it actually narrows the data.
    //
    // Asserted on the summary rather than the grid's row count: the page asks
    // for 5,000 rows and both the whole corpus and the suppressed half exceed
    // that, so the grid reports its cap either way. The summary counts what
    // the filter matched, which is the thing being tested.
    await expect(page.getByText('Offer made', { exact: true })).toBeVisible();
    const offered = page.locator('p', { hasText: /^Offer made$/ }).locator('..').locator('p').nth(1);
    await expect(offered).toHaveText('0');

    await expect(page.locator('tr[data-row]').first().getByText('no offer')).toBeVisible();

    // Dismissing leaves no outcome filter at all, so the set widens past the
    // offered decisions the page opened on.
    await page.getByRole('button', { name: /Remove filter Outcome: Suppressed/ }).click();
    await expect(page.getByRole('button', { name: /Remove filter Outcome/ })).toHaveCount(0);
    expect(await totalRows(page)).toBeGreaterThan(totalBefore);
  });

  test('accepts a typed facet query', async ({ page }) => {
    const box = page.getByRole('combobox', { name: 'Search and filter', exact: true });
    await box.fill('channel:sms');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: 'Remove filter Channel: SMS', exact: true })).toBeVisible();
    await expect(page.locator('tr[data-row]').first().getByText('sms')).toBeVisible();
  });

  test('removes the last chip on backspace in an empty box', async ({ page }) => {
    const box = page.getByRole('combobox', { name: 'Search and filter', exact: true });
    await box.fill('channel:sms');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove filter Channel: SMS', exact: true })).toBeVisible();

    await box.press('Backspace');
    await expect(page.getByRole('button', { name: 'Remove filter Channel: SMS', exact: true })).toHaveCount(0);
  });
});

test('breadcrumbs place a detail page in the hierarchy', async ({ page }) => {
  await login(page, ACCOUNTS.marcus);
  await page.goto('/decisions');
  await page.locator('tr[data-row]').first().click();

  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await expect(crumbs).toBeVisible();
  await expect(crumbs.getByText('Decisioning')).toBeVisible();

  await crumbs.getByRole('link', { name: 'Decisions' }).click();
  await expect(page).toHaveURL(/\/decisions$/);
});

test.describe('summary strip', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
  });

  test('breaks a total down rather than just counting it', async ({ page }) => {
    await page.goto('/decision-flows');

    // A bare count tells an operator nothing actionable; the segments do.
    // Scope to the strip: the table below uses the same words as status badges.
    const strip = page.locator('div').filter({ hasText: /^Lifecycle/ }).last();
    await expect(strip.getByText('active', { exact: true })).toBeVisible();
    await expect(strip.getByText('draft', { exact: true })).toBeVisible();
    await expect(strip.getByText('retired', { exact: true })).toBeVisible();

    const compilation = page.locator('div').filter({ hasText: /^Compilation/ }).last();
    await expect(compilation.getByText('clean', { exact: true })).toBeVisible();
    await expect(compilation.getByText('blocked', { exact: true })).toBeVisible();
  });

  test('reports the real decision total, not the page size', async ({ page }) => {
    await page.goto('/performance');
    // Regression guard: this once showed the query limit of 200. The total is
    // the loop's first stage — on /performance, which every persona reaches,
    // since an architect's Overview has no loop — and the same figure is
    // drawn again as a label on the flow diagram beside it — so the check reads
    // the rail's own stage rather than any matching text on the page. At least
    // the corpus, not exactly it: the ledger adds live decisions as specs run.
    const total = page.getByRole('navigation', { name: 'The loop', exact: true }).getByRole('button', { name: /^Decisions made: / });
    await expect(total).toBeVisible();
    const shown = Number(/^Decisions made:\s*([\d,]+)/.exec((await total.getAttribute('aria-label')) ?? '')![1].replace(/,/g, ''));
    expect(shown).toBeGreaterThanOrEqual(CORPUS);
    expect(CORPUS).toBeGreaterThan(1000);
  });

  test('gives every status glyph an accessible name', async ({ page }) => {
    await page.goto('/decision-flows');
    await expect(page.locator('main table')).toBeVisible();

    // Colour alone must not carry the meaning — that is the property, and it
    // holds whatever state the flows are in. This waited for the literal
    // string "Compiles cleanly", which is the label of exactly one of four
    // compile states: `telco-us` has one flow that compiles with a warning
    // (arbitration weights propensity and no scoring node runs, which is the
    // declared design) and one draft that refuses to compile, so no flow in
    // the tenant is clean and a check on that string asserts the tenant rather
    // than the accessibility rule.
    const glyphs = await page.locator('main table span').evaluateAll((spans) =>
      spans
        .filter((s) =>
          [...s.children].some(
            (c) =>
              c.getAttribute('aria-hidden') !== null &&
              /^[✓!✕?]$/.test((c.textContent ?? '').trim())
          )
        )
        .map((s) => ({
          title: (s.getAttribute('title') ?? '').trim(),
          screenReader: (s.querySelector('.sr-only')?.textContent ?? '').trim(),
          html: s.outerHTML.slice(0, 120),
        }))
    );

    // Not vacuous: two columns carry a glyph on every row, so a page that
    // stopped rendering them fails here rather than passing with an empty set.
    expect(glyphs.length).toBeGreaterThanOrEqual(2);
    expect(glyphs.filter((g) => !g.title || !g.screenReader).map((g) => g.html)).toEqual([]);

    // And the names say what they are about, rather than being present and
    // useless. Both columns, whichever state each flow is in.
    const names = glyphs.map((g) => g.screenReader);
    expect(names.some((n) => /compile/i.test(n))).toBe(true);
    expect(names.some((n) => /of the 50ms budget/.test(n))).toBe(true);
  });

  test('labels the activity sparkline for screen readers', async ({ page }) => {
    await page.goto('/decision-flows');
    await expect(
      page.getByRole('img', { name: /Recent decision volume for/ }).first()
    ).toBeAttached();
  });
});

test.describe('sign-in page', () => {
  test('presents the brand panel alongside the form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: /Decisions you can prove/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Deterministic replay', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scoped agent autonomy', exact: true })).toBeVisible();

    // The form still works, which is the part that matters.
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('prints no demo password and no demo accounts', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByText(/Demo password/)).toHaveCount(0);
    await expect(page.getByText('Demo accounts', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Priya Natarajan|Sarah Chen|Marcus Webb/ })).toHaveCount(0);
  });
});
