import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * What the storefront reports back, and when.
 *
 * `outcome-loop.spec.ts` already asserts the invariant these two tests are
 * about — *a slot carries a decision id if and only if it is showing that
 * decision's offer* — and it caught both of these defects. It caught them
 * intermittently: it failed on two of three CI runs on 2026-09-09, on branches
 * that touched neither the storefront nor the outcome loop, and passed on the
 * third. An assertion that is right and fires at random is worth less than one
 * that is right and fires every time, because the first thing anybody does with
 * it is re-run the job.
 *
 * So these force the two conditions rather than waiting for the catalogue to
 * produce them.
 *
 * Both tests intercept, and both intercept by **removing** something the real
 * platform returned rather than by inventing a response. The decision is real,
 * the slate is real, the trace is real. That matters: a test that fabricates a
 * platform answer proves the storefront handles a shape nobody serves.
 *
 * Not tagged `@screen-only`. These are regression tests for the client's
 * reporting logic, and the tag is for journeys.
 */

const OUTCOMES = '**/api/outcomes/**';
const DECISIONS = '**/api/placements/*/*/decisions';

/** Every outcome the page reported, in order. */
async function recordOutcomes(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.route(OUTCOMES, async (route: Route) => {
    const url = new URL(route.request().url());
    const decisionId = url.pathname.split('/').pop() ?? '';
    const body = route.request().postDataJSON() as { type?: string } | null;
    seen.push(`${body?.type ?? '?'}:${decisionId}`);
    // Fulfilled rather than continued, so a test asserting on reporting does
    // not also append to the ledger the next test reads.
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  return seen;
}

test.describe('the storefront reports an impression of an offer, not of a win', () => {
  test('an offer that won a slot with no creative to render reports nothing', async ({ page }) => {
    // 127 of the 202 active offers in the seeded catalogue have no active web
    // creative, so this is the common case rather than an edge one. When such
    // an offer wins, `fallbackReason` renders "won this slot, and has no web
    // creative for it" — a notice with no call to action — and the slot has
    // shown the customer nothing.
    //
    // The interception strips the web creatives from whichever offer actually
    // wins. Everything else is the real platform.
    await page.route('**/api/offers/*/*', async (route: Route) => {
      const response = await route.fetch();
      const json = (await response.json()) as {
        creatives?: { channel: string }[];
      };
      json.creatives = (json.creatives ?? []).filter((c) => c.channel !== 'web');
      await route.fulfill({ response, json });
    });

    const reported = await recordOutcomes(page);

    await page.goto('/storefront/index.html');

    // The branch under test, reached: an offer won and there was nothing to
    // render it with. Without this the test could pass on a page that simply
    // never decided.
    const notice = page.getByText('has no web creative for it').first();
    await expect(notice).toBeVisible({ timeout: 20_000 });

    const slots = page.locator('[id^="slot-"]');
    await expect(slots.first()).toBeAttached();

    for (const slot of await slots.all()) {
      const id = await slot.getAttribute('id');
      const hasCta = (await slot.locator('.cta').count()) > 0;
      const hasDecisionId = (await slot.getAttribute('data-decision-id')) !== null;
      expect(
        hasDecisionId,
        `${id}: a slot that rendered no offer must not advertise a decision id`
      ).toBe(hasCta);
    }

    // The report is the point. An impression counted here would inflate the
    // denominator of every rate on /performance — the code comment beside
    // `reportOutcome` says exactly this, and the code counted the win anyway.
    expect(
      reported.filter((r) => r.startsWith('impression:')),
      'an impression was reported for an offer the customer never saw'
    ).toEqual([]);
  });

  test('an offer that did render still reports its impression', async ({ page }) => {
    // The other half, so the fix cannot be "never report anything".
    const reported = await recordOutcomes(page);

    await page.goto('/storefront/index.html');
    await expect(page.locator('.cta').first()).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => reported.filter((r) => r.startsWith('impression:')).length, {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
  });
});

test.describe('a slot stops advertising a decision the moment it stops showing it', () => {
  test('a re-decide clears the previous decision id before the new one arrives', async ({
    page,
  }) => {
    await page.goto('/storefront/index.html');

    // Addressed by its own id, not by the attribute under test. A locator of
    // `[data-decision-id]` would stop matching the moment the fix works, and
    // the test would then hang rather than pass.
    await expect(page.locator('[id^="slot-"][data-decision-id]').first()).toBeAttached({
      timeout: 20_000,
    });
    const slotId = await page
      .locator('[id^="slot-"][data-decision-id]')
      .first()
      .getAttribute('id');
    const slot = page.locator(`#${slotId}`);
    expect(await slot.getAttribute('data-decision-id')).toBeTruthy();

    // Hold the next decision open. `runPlacement` replaces the slot's children
    // with a skeleton immediately and only clears `data-decision-id` after the
    // round trip, so this window is however long the platform takes to answer
    // — on a CI runner, long enough to matter.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(DECISIONS, async (route: Route) => {
      await held;
      await route.continue();
    });

    // "Decide again" lives in the explanation drawer, which is translated off
    // screen until somebody opens it. Opened by clicking, not by forcing the
    // click through, so the test still fails if the drawer stops opening.
    await page.getByRole('button', { name: 'Decided by METIS' }).click();
    const again = page.getByRole('button', { name: 'Decide again' });
    await expect(again).toBeInViewport();
    await again.click();

    // The skeleton is up: the slot is showing nothing.
    await expect(slot.locator('.cta')).toHaveCount(0);

    const during = await slot.getAttribute('data-decision-id');
    release();

    expect(
      during,
      'the slot still named the previous decision while showing a skeleton — `data-decision-id` is the binding ADR-008 §2 defines between a rendered offer and its outcome, and a stale one is a wrong binding'
    ).toBeNull();
  });
});
