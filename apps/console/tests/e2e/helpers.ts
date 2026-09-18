import { type Page, expect } from '@playwright/test';

export const ACCOUNTS = {
  /** Decision architect / marketer. Authors offers, cannot approve. */
  sarah: 'sarah.chen@telco.example',
  /** Compliance officer. Approves changes and autonomy, cannot author offers. */
  priya: 'priya.natarajan@telco.example',
  /** Administrator. Everything, including arbitration weights. */
  marcus: 'marcus.webb@telco.example',
  /**
   * Operator. `view:decisions` and nothing else.
   *
   * The only account that can be refused anything. The other three each hold
   * every permission the navigation manifest gates a screen on, so a test
   * signing in as one of them cannot tell an enforced permission from an
   * unenforced one — which is half of why three routes declared a permission
   * nothing checked and nothing went red.
   */
  oliver: 'oliver.reed@telco.example',
} as const;

/** Sign in through the real form, so the login path stays covered. */
export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('demo');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible();
}

/**
 * Open the account panel in the header band.
 *
 * Appearance controls live here rather than on the band itself: they are a
 * once-a-month choice, and the band is reserved for the tools people use on
 * every page.
 */
export async function openAccountPanel(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name }).click();
  await expect(page.getByRole('group', { name: 'Colour scheme', exact: true })).toBeVisible();
}

/**
 * The newest decision from inside the seeded corpus, and its trace page.
 *
 * `/decisions` is the ledger newest-first since ADR-018, so "the first row" is
 * whichever decision anything made last — this suite, or the storefront demo a
 * moment earlier. Two specs assumed the top row was seeded and one of them
 * replayed it; a decision a channel made is proven unchanged by its chain hash
 * and cannot be re-executed, because its inputs were never kept. The same
 * assumption broke `contract.spec.ts` on #91.
 *
 * Use this wherever a test needs a decision the *generator* holds: replay, or
 * anything asserting corpus-specific content. Where a test only needs some
 * decision — a row opens its trace, a page has a title, an axe scan — the first
 * row is right and simpler, and this helper would only hide what it depends on.
 *
 * The list has no date facet, so the choice is made through the API. The corpus
 * ends at 2026-09-04T23:08:35Z; anything the platform decides carries the time
 * it happened, which is later.
 */
export const SEEDED_THROUGH = '2026-09-05T00:00:00.000Z';

export async function seededDecisionId(page: Page): Promise<string> {
  const res = await page.request.get(
    `/api/decisions/search?limit=1&dateTo=${SEEDED_THROUGH}`
  );
  expect(res.ok(), `decision search: HTTP ${res.status()}`).toBe(true);
  const id = (await res.json()).decisions[0]?.id as string | undefined;
  expect(id, 'no decision came back from inside the seeded corpus').toBeTruthy();
  return id!;
}

/** Open the trace of a decision the generator holds. */
export async function openSeededDecision(page: Page): Promise<string> {
  const id = await seededDecisionId(page);
  await page.goto(`/decisions/${id}`);
  return id;
}

/**
 * What the Overview's funnel shows, as drawn — not only that it fits.
 *
 * Every version in the product owner's side-by-side of 2026-09-18 passed the
 * fit checks, including the one where the funnel had become a band: four stage
 * names stacked over one bar, the bars 76px at 1440x900. A fit check is
 * satisfied by a drawing of any shape. This reads the rendered SVG:
 *
 * - five columns, each naming one stage, every name inside the drawing;
 * - a bar at least 2px tall for every stage with a figure above zero, and none
 *   for a stage at zero;
 * - the tallest bar at least 0.13 of the drawing's width: a funnel, not a strip.
 *   The band was 0.096 and this is 0.14, at any window size, because the
 *   drawing scales uniformly;
 * - the tallest bar at least `tallest` px, which catches a funnel of the right
 *   shape squeezed small.
 *
 * Both, because each misses what the other sees. Measured 2026-09-18, the band
 * drew 76px at 1440x900 on a tenant with no trend cards, 80px on one with them,
 * and 103px on the seeded tenant at 1680x1000; the funnel that replaced it draws
 * 116px, 92px and 131px. An 88px floor goes red on the band at 1440 and not at
 * 1680, where only the proportion does. The trend cards cost the difference at
 * 1440 — six to a row they stand 192px tall, and the funnel takes what is left.
 */
export async function expectFunnelShows(page: Page, { tallest }: { tallest: number }) {
  const funnel = page.locator('svg[role="img"][aria-label^="The loop as volume"]');
  await expect(funnel).toBeVisible();
  // The drawing's width on screen: its viewBox width at the scale it is drawn.
  const drawnWidth = await funnel.evaluate(
    (svg) => (svg as SVGSVGElement).viewBox.baseVal.width * (svg as SVGSVGElement).getScreenCTM()!.a
  );
  const shape = await funnel.evaluate((svg) => {
    const box = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('g[data-part="column"]')].map((g) => {
      const texts = [...g.querySelectorAll('text')];
      const bar = g.querySelector('rect[data-part="stage"]');
      const named = texts[1]?.getBoundingClientRect();
      return {
        stage: g.getAttribute('data-stage'),
        figure: Number((texts[0]?.textContent ?? '').replace(/[^\d]/g, '')),
        names: texts.length - 1,
        nameInside: Boolean(named && named.left >= box.left - 1 && named.right <= box.right + 1 && named.top >= box.top - 1),
        bar: bar ? bar.getBoundingClientRect().height : null,
      };
    });
  });
  expect(shape.map((c) => c.stage), 'the funnel draws five columns, one per stage').toEqual([
    'decisions',
    'offered',
    'deliverable',
    'seen',
    'acted',
  ]);
  for (const c of shape) {
    expect(c.names, `${c.stage} carries one name`).toBe(1);
    expect(c.nameInside, `${c.stage}'s name is inside the drawing`).toBe(true);
    if (c.figure === 0) {
      expect(c.bar, `${c.stage} is zero and draws no bar`).toBeNull();
    } else {
      expect(c.bar, `${c.stage} is ${c.figure} and draws a bar`).not.toBeNull();
      expect(c.bar!, `${c.stage}'s bar is visible`).toBeGreaterThanOrEqual(2);
    }
  }
  const top = Math.max(...shape.map((c) => c.bar ?? 0));
  expect(
    top / drawnWidth,
    `the tallest bar is ${Math.round(top)}px across a ${Math.round(drawnWidth)}px drawing: a funnel, not a strip`
  ).toBeGreaterThanOrEqual(0.13);
  expect(top, `the tallest bar is ${Math.round(top)}px: a funnel, not one squeezed small`).toBeGreaterThanOrEqual(tallest);
}

/** Restore seed data. The store is process-wide, so writes leak between specs. */
export async function resetStore(page: Page) {
  const res = await page.request.post('/api/_test/reset');
  expect(res.ok()).toBeTruthy();
}
