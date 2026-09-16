import { test, expect } from '@playwright/test';
import { login, ACCOUNTS, openSeededDecision } from './helpers';

/**
 * The core regression: the trace page once ignored its route param and rendered
 * the same hardcoded object for every decision. These tests fail if that
 * returns.
 */

test.describe('decision search and trace', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/decisions');
  });

  test('opens on decisions that made an offer, as a filter that can be removed', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Remove filter Outcome: Offer made', exact: true })).toBeVisible();
    const first = page.locator('tr[data-row]').first();
    await expect(first).toBeVisible();
    await expect(first.getByText('no offer')).toHaveCount(0);
  });

  test('lists decisions with stable IDs', async ({ page }) => {
    const rows = page.getByRole('row');
    await expect(rows).not.toHaveCount(1); // more than the header

    const firstId = await rows.nth(1).locator('td').first().innerText();
    await page.reload();
    const afterReload = await page.locator('tr[data-row]').first().locator('td').first().innerText();

    // IDs were once Math.random() at module scope; they changed on every load.
    expect(afterReload).toBe(firstId);
  });

  test('opens the trace for the decision that was clicked', async ({ page }) => {
    const row = page.locator('tr[data-row]').first();
    const id = (await row.locator('td').first().innerText()).trim();
    await row.click();

    await expect(page).toHaveURL(new RegExp(`/decisions/${id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(id);
    // The candidate count is what entered the flow. It said "entered
    // arbitration" beside a funnel showing fewer reaching ranking (D2).
    await expect(page.getByText('entered the flow', { exact: true })).toBeVisible();
  });

  test('heads the trace with one identity line, not a row of metric cards', async ({ page }) => {
    await page.locator('tr[data-row]').first().click();
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toContainText(/^Decision\s*dec_/);
    const identity = page.locator('[data-identity]');
    await expect(identity).toContainText(/\d+(\.\d)? ms of a 50 ms SLA/);
    await expect(identity).toContainText('entered the flow');
    // The line sits under the heading, not a card row further down.
    const h = (await heading.boundingBox())!;
    const i = (await identity.boundingBox())!;
    expect(i.y - (h.y + h.height)).toBeLessThan(16);
    await expect(page.getByText('SLA 50ms', { exact: true })).toHaveCount(0);
  });

  test('draws the rail figure at the drafts\' size', async ({ page }) => {
    await page.locator('tr[data-row]').first().click();
    const figure = page.getByRole('navigation', { name: 'Elimination funnel', exact: true }).locator('strong').first();
    await expect(figure).toBeVisible();
    expect(await figure.evaluate((el) => getComputedStyle(el).fontSize)).toBe('34px');
    expect(await figure.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('600');

    // The selected stage heads the middle pane at title size, not body size.
    await page.getByRole('navigation', { name: 'Elimination funnel', exact: true }).getByRole('button').first().click();
    const stageHeading = page.getByRole('heading', { level: 2, name: /removed/ }).first();
    await expect(stageHeading).toBeVisible();
    const size = await stageHeading.evaluate((el) => getComputedStyle(el.firstElementChild ?? el).fontSize);
    expect(size).toBe('18px');
  });

  test('renders a different trace for a different decision', async ({ page }) => {
    const readTrace = async (rowIndex: number) => {
      await page.goto('/decisions');
      const row = page.locator('tr[data-row]').nth(rowIndex);
      const id = (await row.locator('td').first().innerText()).trim();
      await row.click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(id);
      const customer = await page.getByText(/^cust_/).first().innerText();
      return { id, customer };
    };

    const first = await readTrace(0);
    const second = await readTrace(1);

    expect(second.id).not.toBe(first.id);
    // The whole bug: two decisions showing identical content.
    expect(second.customer).not.toBe(first.customer);
  });

  test('replays a decision and reports it identical', async ({ page }) => {
    // A decision from the seeded corpus, asked for by time rather than taken
    // from the top of the list. `/decisions` is the ledger newest-first since
    // ADR-018, so the first row is whichever decision this suite — or the
    // storefront — made last, and a decision the platform recorded can be
    // proven unchanged but not re-executed: its inputs were never kept. The
    // same assumption broke `contract.spec.ts` on #91, and here it would have
    // held until the day something decided before this test ran.
    //
    // `openSeededDecision` is the shared form of this: the list has no date
    // facet, so the choice is made through the API and the trace opened by id —
    // which is what this test is about, the page rendering the decision its
    // route names.
    await openSeededDecision(page);

    // The chain hash shown on the trace is what a replay has to reproduce.
    const storedHash = (await page.getByText(/^[0-9a-f]{64}$/).first().innerText()).trim();

    await page.getByRole('button', { name: 'Replay this decision', exact: true }).click();

    await expect(page.getByText('Identical', { exact: true })).toBeVisible();
    await expect(page.getByText(/Re-executed against artifact/)).toBeVisible();

    // Not a canned response: the engine ran again and produced the same hash.
    await expect(page.getByText('Replayed hash', { exact: true })).toBeVisible();
    const hashes = await page.getByText(new RegExp(`^${storedHash}$`)).count();
    expect(hashes).toBeGreaterThanOrEqual(2);
  });

  test('will not offer to re-execute a decision whose inputs were never kept', async ({ page }) => {
    // What the storefront demo produces: a decision a channel made. It is
    // proven unchanged by its chain hash and cannot be replayed, because the
    // platform keeps the snapshot hash and never the values (ADR-004). The
    // button offered it anyway until 2026-09-16 and failed with a 422 — on
    // exactly the decisions a demo has just created.
    const made = await page.request.post('/api/placements/telco-us/account_dashboard_hero/decisions', {
      data: { request: liveRequest() },
    });
    expect(made.status(), await made.text()).toBeLessThan(300);
    const body = await made.json();
    const decisionId = body.decisionId ?? body.decisions?.[0]?.decisionId;
    expect(decisionId, JSON.stringify(body).slice(0, 200)).toBeTruthy();

    await page.goto(`/decisions/${decisionId}`);
    const button = page.getByRole('button', { name: 'Cannot be re-executed here', exact: true });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();

    // The distinction is on the trace, not only on the button, and it says the
    // reason rather than naming a document.
    await expect(page.getByText(/Proven unchanged by its chain hash, and not re-executable/)).toBeVisible();
    await expect(page.getByText(/holds a hash of them and never the values/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replay this decision', exact: true })).toHaveCount(0);
  });

  test('shows the chain hash as the evidence behind the decision id', async ({ page }) => {
    const row = page.locator('tr[data-row]').first();
    const id = (await row.locator('td').first().innerText()).trim();
    await row.click();

    await expect(page.getByText('Chain hash', { exact: true })).toBeVisible();
    const hash = (await page.getByText(/^[0-9a-f]{64}$/).first().innerText()).trim();

    // The id is the first 16 hex of the hash, so it is verifiable, not a label.
    expect(id).toBe(`dec_${hash.slice(0, 16)}`);
  });

  test('switches the trace audience', async ({ page }) => {
    await page.locator('tr[data-row]').first().click();

    await page.getByRole('button', { name: 'Regulator', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Regulator', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByText('Consent state', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Engineer', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Execution timings', exact: true })
    ).toBeVisible();
  });

  test('filters to suppressed decisions and shows why nothing went out', async ({ page }) => {
    const box = page.getByRole('combobox', { name: 'Search and filter', exact: true });
    await box.fill('outcome:suppressed');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove filter Outcome: Suppressed', exact: true })).toBeVisible();

    const firstRow = page.locator('tr[data-row]').first();
    await expect(firstRow.getByText('no offer')).toBeVisible();

    await firstRow.click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('no offer');
    await expect(page.getByText('Every candidate was removed before arbitration.', { exact: true })).toBeVisible();
  });
});

/**
 * A decision a channel makes, in the shape the storefront sends.
 *
 * Kept here rather than imported from the storefront's page: this is the
 * request the console has to cope with, and a copy that drifts from the demo is
 * a test that stops describing it — which is worth knowing when it happens.
 */
function liveRequest() {
  return {
    tenantId: 'telco-us',
    customerId: 'cust_decisions_probe',
    channel: 'web',
    placement: 'account_dashboard_hero',
    occurredAt: '2026-09-05T12:00:00.000Z',
    input: {
      customer: {
        age: 40,
        credit_status: 'pass',
        account_status: 'active',
        current_plan: 'sim_only',
        bill_to_income_ratio: 0.02,
        arrears_count_12mo: 0,
        credit_band: 'A',
        address: { fiber_available: true },
        usage: { pct_of_allowance_3mo_avg: 0.5, months_of_history: 12 },
        contract: { days_to_end: 200 },
        events: { pac_requested_within_days: 999 },
        device: { residual_value: 0 },
      },
      context: { offer: { monthly_delta: 300 } },
    },
    consent: { marketing: true, profiling: true, thirdParty: false },
    contactHistory: { channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
  };
}
