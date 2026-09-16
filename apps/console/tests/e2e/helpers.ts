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

/** Restore seed data. The store is process-wide, so writes leak between specs. */
export async function resetStore(page: Page) {
  const res = await page.request.post('/api/_test/reset');
  expect(res.ok()).toBeTruthy();
}
