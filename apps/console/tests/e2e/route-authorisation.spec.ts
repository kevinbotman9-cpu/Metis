import { test, expect, type Page } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * @screen-only
 *
 * The URL is not a second, laxer front door.
 *
 * `RequireAuth` checked for a session and never looked at permissions.
 * `/decisions`, `/decision-flows` and `/performance` each declared a permission
 * in the navigation manifest and enforced nothing, so the rail hid the link and
 * the address bar let anyone signed in walk past it. Thirteen further routes
 * declared nothing and checked nothing.
 *
 * The unit suite proves the manifest, the rail and `RequireAuth` agree. This
 * proves it where it matters: a real sign-in, a real address typed into a real
 * browser, and a screen that refuses.
 *
 * Oliver is the account that makes it provable. Sarah, Priya and Marcus each
 * hold every permission the manifest gates on, so none of them can be turned
 * away from anything and no test signing in as them could tell an enforced
 * permission from an unenforced one. He is an operator and holds
 * `view:integrations`: he reads what called in and what went back, and is
 * refused all six of the other gated permissions.
 *
 * Setup is a sign-in. Nothing is created, seeded or requested over the API.
 */

const refusal = (page: Page) => page.getByText('You do not have access to this view');

/** What Oliver holds, and what he does not. Read off the screens, never mocked. */
const OPEN = ['/integrations', '/integrations/traffic', '/data-model/intake'] as const;

/** Every gated screen he is refused, and the permission that would admit him. */
const SHUT = [
  { path: '/offers', permission: 'view:offers' },
  { path: '/objectives', permission: 'view:offers' },
  { path: '/creatives', permission: 'view:offers' },
  { path: '/audit', permission: 'view:audit' },
  { path: '/decisions', permission: 'view:decisions' },
  { path: '/performance', permission: 'view:decisions' },
  { path: '/decision-flows', permission: 'view:flows' },
  { path: '/placements', permission: 'view:flows' },
  { path: '/arbitration', permission: 'view:flows' },
  { path: '/simulations', permission: 'view:flows' },
  { path: '/experiments', permission: 'view:flows' },
  { path: '/targeting-policies', permission: 'view:policies' },
  { path: '/frequency-policy', permission: 'view:policies' },
  { path: '/agentic', permission: 'view:autonomy' },
] as const;

/** Ungated on purpose. Every signed-in account reaches these. */
const ALWAYS_OPEN = ['/', '/approvals', '/settings', '/data-model'] as const;

test.describe('a route refuses what its nav entry declares @screen-only', () => {
  test('the narrow account reaches what it holds', async ({ page }) => {
    await login(page, ACCOUNTS.oliver);

    for (const path of OPEN) {
      await page.goto(path);
      await expect(refusal(page)).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });

  test('and is refused every screen it does not, by URL', async ({ page }) => {
    await login(page, ACCOUNTS.oliver);

    for (const { path, permission } of SHUT) {
      await page.goto(path);
      // Refused, and told which permission would have let them in — a wall
      // with no explanation is a bug report waiting to be filed.
      await expect(refusal(page), `${path} let an unpermitted user in`).toBeVisible();
      await expect(page.getByText(permission)).toBeVisible();
    }
  });

  test('reaches the screens that are ungated on purpose', async ({ page }) => {
    // Home, Approvals, Settings and Data model carry no permission by
    // decision, not by omission — the distinction the whole change turns on.
    // Home is where a sign-in lands; Approvals is needed by the person who
    // filed the change set as much as the one approving it; Settings is your
    // own name and theme; Data model is the profile schema, not a customer's
    // values.
    await login(page, ACCOUNTS.oliver);
    for (const path of ALWAYS_OPEN) {
      await page.goto(path);
      await expect(refusal(page), `${path} refused an account with no gate on it`).toHaveCount(0);
    }
  });

  test('a detail page is no weaker than the list that links to it', async ({ page }) => {
    // The variant a per-page guard reliably misses. `/offers` had one and
    // `/offers/[id]` never did, so the list was shut and every offer in it was
    // open to anyone who knew an id — and ids are in the trace, which Oliver
    // can read.
    await login(page, ACCOUNTS.oliver);
    await page.goto('/offers/prop_5g_unlimited_24');
    await expect(refusal(page)).toBeVisible();
  });

  test('the refusal keeps the rail, so it is not a dead end', async ({ page }) => {
    // Someone lands here by following a stale link from a colleague. Replacing
    // the whole shell with a refusal leaves them with the back button and
    // nothing else.
    await login(page, ACCOUNTS.oliver);
    await page.goto('/audit');
    await expect(refusal(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    // And the rail never offered the link in the first place.
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Audit log' })
    ).toHaveCount(0);
  });

  test('an account that holds the permission still gets the screen', async ({ page }) => {
    // The half that would be missing if the guard simply refused everyone.
    // Priya is compliance: the audit log is hers.
    await login(page, ACCOUNTS.priya);
    await page.goto('/audit');
    await expect(refusal(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  });
});
