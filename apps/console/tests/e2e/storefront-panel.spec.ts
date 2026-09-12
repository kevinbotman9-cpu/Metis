import { test, expect } from '@playwright/test';

/**
 * The panel explains the decision.
 *
 * `STOREFRONT_DEMO.md` says of this panel: *"Every figure in the panel comes
 * from the decision the platform returned."* From 2026-09-07 to 2026-09-12 no
 * figure in it came from anywhere — it read `.decision` off a response that has
 * no such key, got `undefined`, and rendered an empty div (G-087).
 *
 * `storefront-reporting.spec.ts` and `outcome-loop.spec.ts` both drive this page
 * hard. Neither opens the panel, which is why four days of demos ran against an
 * explanation surface that explained nothing. This is that missing test.
 *
 * It asserts on shape rather than on values: which offer wins is the
 * catalogue's business, and pinning one here would turn a catalogue edit into a
 * panel regression. What must hold is that the numbers on screen came from the
 * decision.
 */

const STOREFRONT = '/storefront/index.html';
const SHA256 = /^[0-9a-f]{64}$/;

test.describe('@screen-only the decision panel shows the decision', () => {
  test('renders the hashes, the candidates, the cascade and the provenance', async ({ page }) => {
    await page.goto(STOREFRONT);
    await page.getByRole('button', { name: 'Decided by METIS' }).click();

    // Each decision is a collapsed `<details>`; a person opens the one they
    // want to read, so the test does too.
    const card = page.locator('#decisions details.decision').first();
    await expect(card).toBeVisible();
    await card.locator('summary').click();

    const detail = card.locator('.detail');
    await expect(detail).toBeVisible();

    // The failure this exists for: a detail body that rendered as an empty div
    // while every card above it looked perfect.
    await expect(detail).not.toBeEmpty();

    const facts = detail.locator('dl.facts').first();
    await expect(facts).toBeVisible();

    /** A `<dd>` by the `<dt>` beside it, which is how the panel is built. */
    const fact = async (label: string) => {
      const dd = facts.locator(`dt:text-is("${label}") + dd`);
      await expect(dd, `the panel shows no "${label}"`).toBeVisible();
      return (await dd.innerText()).trim();
    };

    // Both hashes the decision carries. `catalogue` is the one the DTO did not
    // serve at all: chainHash covers it, so a panel that showed the hash and not
    // what it was taken over was handing out an unverifiable number.
    expect(await fact('chain hash')).toMatch(SHA256);
    expect(await fact('input snapshot')).toMatch(SHA256);
    expect(await fact('catalogue')).toMatch(SHA256);

    // The candidate set, not merely its size. "What did we consider" is the
    // first question the cascade answers and the DTO used to serve a count.
    const candidates = await fact('candidates');
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.split(',').length).toBeGreaterThan(0);

    expect(await fact('decision')).toMatch(/^dec_[0-9a-f]+$/);

    // The cascade, and where the inputs came from. Both are headings with
    // content under them; an empty section here was the original symptom.
    await expect(detail.getByRole('heading', { name: 'What was refused, and by what' })).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Where the inputs came from' })).toBeVisible();
    await expect(detail.locator('.binding').first()).toBeVisible();
  });
});
