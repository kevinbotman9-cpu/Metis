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
 * Three of them had an empty state and all three gave filter advice for it —
 * *"Narrow the filters or widen the window"*, *"Choose another flow"*, *"Remove
 * a filter chip to widen the search"*. Correct for a window that matched
 * nothing; wrong for a tenant with no history, where there is no filter to
 * relax and the sentence sends the reader looking for one. The other four said
 * nothing at all, or rendered in full with a zero in every cell.
 *
 * **What each test asserts is not that the screen is blank.** Blank is easy and
 * proves nothing — a broken screen is blank too. Each asserts the screen says
 * *what will appear here once decisions exist*, which is the only thing that
 * separates blank-because-new from blank-because-broken.
 *
 * Setup is a sign-in. `playwright.empty.config.ts` runs the server with
 * `METIS_SEED_LEDGER` empty; the catalogue is seeded as usual, so offers,
 * placements, policies and flows are all present. Only the history is absent.
 */

/** Every screen here must say this, and it must not be the only thing it says. */
const HEADLINE = 'Nothing has been decided yet';

/**
 * The promise each screen makes: the list under "What will appear here".
 *
 * Asserted as "at least two items, each a sentence rather than a word", because
 * the failure being guarded against is a screen that satisfies the headline
 * with a bare "No data" and calls the job done.
 */
async function promisesWhatComes(page: Page): Promise<void> {
  const heading = page.getByText('What will appear here', { exact: true });
  await expect(heading, 'the screen does not say what it will show once decisions exist').toBeVisible();

  const items = page.locator('ul li').filter({ hasText: /.{25,}/ });
  expect(await items.count(), 'fewer than two things named').toBeGreaterThanOrEqual(2);
}

test.beforeEach(async ({ page }) => {
  await login(page, ACCOUNTS.marcus);
});

test.describe('a tenant with no decision history @screen-only', () => {
  /**
   * The counterpart to the seeded warm-up's `toBe(10_400)`.
   *
   * Both modes are now pinned, in opposite directions and in different files:
   * a change that stops the seeded suite seeding fails there, and a change that
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

  /** The catalogue is the half that must survive. */
  test('the catalogue is still there, which is what makes this a new tenant and not an empty install', async ({
    page,
    request,
  }) => {
    // The claim is about what seeded, so it is asked of the contract rather
    // than of one screen's markup: `/offers` renders through a layout manifest
    // and has no table rows to count.
    const taxonomy = await request.get('/api/taxonomy');
    expect(taxonomy.ok()).toBe(true);
    const { offers } = (await taxonomy.json()) as { offers: unknown[] };
    expect(offers.length, 'no offers: the catalogue did not seed either').toBeGreaterThan(0);

    // And it reaches a screen, which is the half the contract does not prove.
    await page.goto('/offers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the Overview says what the loop will show', async ({ page }) => {
    await page.goto('/');
    // Marcus lands on the architect Overview; the loop is the marketer's.
    await page.getByRole('button', { name: 'Marketer', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'The loop', exact: true })).toBeVisible();

    await expect(page.getByText(HEADLINE, { exact: true })).toBeVisible();
    await promisesWhatComes(page);
  });

  test('performance does not tell a new tenant to widen the window', async ({ page }) => {
    await page.goto('/performance');
    await expect(page.getByText(HEADLINE, { exact: true })).toBeVisible();
    await promisesWhatComes(page);

    // The specific wrong sentence, named so the regression is unambiguous.
    await expect(page.getByText(/Narrow the filters or widen the window/)).toHaveCount(0);
  });

  test('decision search does not tell a new tenant to remove a filter chip', async ({ page }) => {
    await page.goto('/decisions');
    await expect(page.getByText(HEADLINE, { exact: true })).toBeVisible();
    await promisesWhatComes(page);
    await expect(page.getByText(/Remove a filter chip/)).toHaveCount(0);
  });

  test('a trace link that cannot resolve says why, and not that it expired', async ({ page }) => {
    // A link someone kept from another tenant, or from a demo. On a tenant with
    // no history the retention-window sentence is false: nothing expired,
    // nothing was ever made.
    await page.goto('/decisions/dec_0000000000000000');
    await expect(page.getByText(HEADLINE, { exact: true })).toBeVisible();
    await promisesWhatComes(page);
    await expect(page.getByText(/outside the retention window/)).toHaveCount(0);
  });

  test('the policy funnel does not tell a new tenant to choose another flow', async ({ page }) => {
    await page.goto('/targeting-policies?view=funnel');
    await expect(page.getByText(HEADLINE, { exact: true })).toBeVisible();
    await promisesWhatComes(page);
    await expect(page.getByText(/Choose another flow/)).toHaveCount(0);
  });

  test('experiments say their figures are unmeasured, not zero', async ({ page }) => {
    await page.goto('/experiments');
    await expect(page.getByText(HEADLINE, { exact: true })).toBeVisible();
    await promisesWhatComes(page);
  });

  test('the flow graph says the overlay has no traffic to draw yet', async ({ page }) => {
    await page.goto('/decision-flows');
    await page.locator('tr[data-row]').first().click();
    await expect(page.getByRole('heading', { name: 'Decision graph', exact: true })).toBeVisible();

    // The overlay is on by default (`useState(true)`), so there is nothing to
    // click. The first draft of this test clicked it, which turned it *off* —
    // and a strip that is absent because the feature was switched off reads
    // exactly like a strip that is absent because the sentence was never
    // written. Asserted rather than assumed, so the day the default flips this
    // says so instead of quietly testing the wrong state.
    const overlay = page.getByRole('button', { name: 'Volume overlay', exact: true });
    await expect(overlay, 'the volume overlay is no longer on by default').toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // Not a panel, so not the shared component: a strip under the graph that
    // has to carry both halves in one sentence.
    await expect(page.getByText(/No decisions have run through this flow yet/)).toBeVisible();
    await expect(page.getByText(/edge thickness becomes the candidates that crossed it/i)).toBeVisible();
  });
});
