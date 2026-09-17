import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS } from '../e2e/helpers';

/**
 * The console on a tenant that has never decided anything.
 *
 * This is the state every new tenant starts in, and until 2026-09-17 no check
 * had ever seen it. The seeded suite writes 10,400 decisions before its first
 * test and `warmup.setup.ts` fails the run if it did not, so the seven screens
 * that read the ledger had only ever been exercised full.
 *
 * **Data can be zero; structure cannot vanish.** The product owner's rule, from
 * 2026-09-17. The first version of these empty states replaced each screen's
 * content with a paragraph and a list headed "What will appear here", and this
 * suite asserted the list — so it proved a screen *described* its rail and its
 * cards while the reader could see neither. The screens now draw their
 * structure at zero, with one sentence above it saying why the numbers are
 * zero, and this suite asserts the structure: the rail's stages reading 0, the
 * funnel drawn, the value cards present, the table's columns, the arm rows.
 *
 * Blank is still not a pass. A broken screen can be blank; it cannot draw five
 * named stages at zero under a sentence explaining them.
 *
 * Setup is a sign-in. `playwright.empty.config.ts` runs the server with
 * `METIS_SEED_LEDGER` empty; the catalogue is seeded as usual, so offers,
 * placements, policies and flows are all present. Only the history is absent.
 */

/** The sentence every screen here carries above its structure. */
const HEADLINE = 'Nothing has been decided yet';

/** A rail by its accessible name, and the figure each of its stages reads. */
async function railFigures(page: Page, name: string): Promise<{ label: string; figure: number }[]> {
  const rail = page.getByRole('navigation', { name, exact: true });
  await expect(rail, `the "${name}" rail is not drawn`).toBeVisible();
  const labels = await rail.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  return labels.map((l) => {
    const m = /^([^:]+):\s*([\d,]+)/.exec(l);
    if (!m) throw new Error(`no figure in the rail label "${l}"`);
    return { label: m[1].trim(), figure: Number(m[2].replace(/,/g, '')) };
  });
}

/** The sentence is there, and the old replacement list is not. */
async function saysWhyItIsZero(page: Page): Promise<void> {
  await expect(page.getByText(HEADLINE, { exact: true })).toBeVisible();
  // The list described structure that was not on screen. It is on screen now,
  // so the list is gone — and its return would mean the structure had gone
  // again with it.
  await expect(page.getByText('What will appear here', { exact: true })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await login(page, ACCOUNTS.marcus);
});

test.describe('a tenant with no decision history @screen-only', () => {
  /**
   * The counterpart to the seeded warm-up's `toBe(10_400)`.
   *
   * Both modes are pinned, in opposite directions and in different files: a
   * change that stops the seeded suite seeding fails there, and a change that
   * starts this one seeding fails here. Neither can be satisfied by relaxing
   * the other.
   */
  test('the server really is running without a seeded ledger', async ({ request }) => {
    const res = await request.get('/api/_test/uptime');
    expect(res.ok(), 'the uptime endpoint did not answer').toBe(true);
    const { ledgerSeed } = (await res.json()) as { ledgerSeed: { decisions: number } | null };
    expect(
      ledgerSeed,
      'this server seeded a ledger; playwright.empty.config.ts sets METIS_SEED_LEDGER to empty, ' +
        'and seedPlanFromEnv reads that as off'
    ).toBeNull();

    // And the ledger agrees, which the report above does not prove on its own:
    // `ledgerSeed` is null whenever the seed job did not run, including when
    // something else filled the ledger.
    const search = await request.get('/api/decisions/search?limit=1');
    expect(search.ok()).toBe(true);
    expect((await search.json()).total, 'the ledger holds decisions').toBe(0);
  });

  /**
   * No provenance claim over nothing: not on the screen, not in the payload.
   *
   * Until 2026-09-17 three of these screens carried a banner reading *"Every
   * figure here is generated from a fixed seed for the demo tenant
   * demo-telco-us"* on a tenant with no history. It came from the payload, so
   * the payload is asserted here and not only the screen.
   */
  test('carries no provenance claim, on screen or in the payload', async ({ page, request }) => {
    const payloads: [string, string][] = [
      ['/api/performance/telco-us', 'performance'],
      ['/api/policy-funnel/telco-us', 'policy funnel'],
      ['/api/decisions/search?limit=50', 'decision search'],
    ];
    for (const [url, name] of payloads) {
      const res = await request.get(url);
      expect(res.ok(), `${name}: HTTP ${res.status()}`).toBe(true);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Object.keys(body), `${name} still carries a provenance key over an empty set`).not.toContain(
        'provenance'
      );
    }

    for (const path of ['/performance', '/decisions', '/targeting-policies?view=funnel']) {
      await page.goto(path);
      // Settle on the sentence first, so a count of zero means absent and not
      // not-yet-arrived.
      await expect(page.getByText(HEADLINE, { exact: true })).toBeVisible();
      await expect(page.getByTestId('provenance-banner'), `${path} shows a provenance banner`).toHaveCount(0);
      await expect(page.getByText(/generated from a fixed seed/), path).toHaveCount(0);
      await expect(page.getByText(/demo-telco-us/), path).toHaveCount(0);
    }
  });

  /** The catalogue is the half that must survive. */
  test('the catalogue is still there, which is what makes this a new tenant and not an empty install', async ({
    page,
    request,
  }) => {
    const taxonomy = await request.get('/api/taxonomy');
    expect(taxonomy.ok()).toBe(true);
    const { offers } = (await taxonomy.json()) as { offers: unknown[] };
    expect(offers.length, 'no offers: the catalogue did not seed either').toBeGreaterThan(0);

    await page.goto('/offers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the Overview draws the loop at zero, under the sentence', async ({ page }) => {
    await page.goto('/');
    // Marcus lands on the architect Overview; the loop is the marketer's.
    await page.getByRole('button', { name: 'Marketer', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'The loop', exact: true })).toBeVisible();
    await saysWhyItIsZero(page);

    // Five stages, each reading 0.
    const stages = await railFigures(page, 'The loop');
    expect(stages.map((s) => s.label)).toEqual(['Decisions made', 'Offered something', 'Deliverable', 'Seen', 'Acted on']);
    expect(stages.every((s) => s.figure === 0), JSON.stringify(stages)).toBe(true);

    // The funnel and all three value cards.
    await expect(page.getByRole('heading', { name: 'From decision to outcome', exact: true })).toBeVisible();
    for (const card of ['Realised value', 'Expected, at the ceiling', 'Never had the chance']) {
      await expect(page.getByText(card, { exact: true }), `the "${card}" card is missing`).toBeVisible();
    }

    // Realised value is not a measured zero: nothing was measured.
    await expect(page.getByText('nothing acted on yet', { exact: true })).toBeVisible();
    // And the loop's closure is a sentence, not "open on 0".
    await expect(page.getByText(/open on 0/)).toHaveCount(0);
  });

  test('performance draws the loop at zero, and does not tell a new tenant to widen the window', async ({ page }) => {
    await page.goto('/performance');
    await saysWhyItIsZero(page);

    const stages = await railFigures(page, 'The loop');
    expect(stages).toHaveLength(5);
    expect(stages.every((s) => s.figure === 0), JSON.stringify(stages)).toBe(true);
    await expect(page.getByText('Realised value', { exact: true })).toBeVisible();

    await expect(page.getByText(/Narrow the filters or widen the window/)).toHaveCount(0);

    // A stage selected at zero keeps its table's columns. The table under a
    // stage is structure too, and it used to replace itself with a sentence.
    await page.getByRole('navigation', { name: 'The loop', exact: true }).getByRole('button').last().click();
    await expect(page.getByText('Nothing measured yet', { exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader').first(), 'the stage table dropped its columns').toBeVisible();
  });

  test('decision search keeps its columns, and does not tell a new tenant to remove a filter chip', async ({ page }) => {
    await page.goto('/decisions');
    await saysWhyItIsZero(page);

    for (const column of ['Decision', 'Customer', 'Channel', 'Outcome']) {
      await expect(
        page.getByRole('columnheader', { name: new RegExp(`^${column}`) }),
        `the "${column}" column is gone`
      ).toBeVisible();
    }
    await expect(page.getByText('No decisions yet', { exact: true })).toBeVisible();
    await expect(page.getByText(/Remove a filter chip/)).toHaveCount(0);
  });

  /**
   * The one screen that keeps a not-found state, and why.
   *
   * A trace is one record. Drawn at zero it would be the trace of a decision
   * that was never made, which a trace must never show — so this screen alone
   * keeps naming what a trace holds, because the structure cannot be on screen
   * to speak for itself.
   */
  test('a trace link that cannot resolve says why, and names what a trace holds', async ({ page }) => {
    await page.goto('/decisions/dec_0000000000000000');
    await expect(page.getByText(HEADLINE, { exact: true })).toBeVisible();
    await expect(page.getByText('What a trace shows', { exact: true })).toBeVisible();
    await expect(page.getByText(/outside the retention window/)).toHaveCount(0);
  });

  test('the policy funnel draws its stages at zero, asked by the flow that asks them', async ({ page }) => {
    await page.goto('/targeting-policies?view=funnel');
    await saysWhyItIsZero(page);

    const rail = page.getByRole('navigation', { name: 'Where candidates fall out', exact: true });
    await expect(rail).toBeVisible();
    const stages = await railFigures(page, 'Where candidates fall out');
    expect(stages.length).toBeGreaterThan(3);
    expect(stages.every((s) => s.figure === 0), JSON.stringify(stages)).toBe(true);

    // At zero every stage used to read "not asked by these flows", because the
    // flows in scope came only from decisions and there were none. The flow asks
    // eligibility and relevance; nothing has passed through it yet.
    for (const stage of ['Eligibility', 'Relevance']) {
      const text = await rail.getByRole('button', { name: new RegExp(`^${stage}`) }).innerText();
      expect(text, `${stage} claims the flow does not ask it`).not.toMatch(/not asked/i);
    }

    await expect(page.getByText(/Choose another flow/)).toHaveCount(0);
  });

  test('experiments keep their arms at zero, and say why', async ({ page }) => {
    await page.goto('/experiments');
    await saysWhyItIsZero(page);

    // The stopped experiment's arms are its structure: rows at zero, no rate.
    await expect(page.getByText('no rate yet').first()).toBeVisible();

    // A stopped experiment said it was kept "because the decisions it influenced
    // are still in the ledger" — on a ledger holding none.
    await expect(page.getByText(/still in the ledger/)).toHaveCount(0);
  });

  test('the flow graph says the overlay has no traffic to draw yet', async ({ page }) => {
    // Already structure at zero: the graph is drawn at its thinnest, with the
    // reason in one sentence beneath it.
    await page.goto('/decision-flows');
    await page.locator('tr[data-row]').first().click();
    await expect(page.getByRole('heading', { name: 'Decision graph', exact: true })).toBeVisible();

    // On by default (`useState(true)`), so there is nothing to click. A click
    // would turn it off, and an absent strip because the overlay was switched
    // off reads exactly like one whose sentence was never written.
    const overlay = page.getByRole('button', { name: 'Volume overlay', exact: true });
    await expect(overlay, 'the volume overlay is no longer on by default').toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/No decisions have run through this flow yet/)).toBeVisible();
    await expect(page.getByText(/edge thickness becomes the candidates that crossed it/i)).toBeVisible();
  });
});
