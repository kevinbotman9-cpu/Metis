import { test, expect } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

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

  test('lists decisions with stable IDs', async ({ page }) => {
    const rows = page.getByRole('row');
    await expect(rows).not.toHaveCount(1); // more than the header

    const firstId = await rows.nth(1).locator('td').first().innerText();
    await page.reload();
    const afterReload = await page.getByRole('row').nth(1).locator('td').first().innerText();

    // IDs were once Math.random() at module scope; they changed on every load.
    expect(afterReload).toBe(firstId);
  });

  test('opens the trace for the decision that was clicked', async ({ page }) => {
    const row = page.getByRole('row').nth(1);
    const id = (await row.locator('td').first().innerText()).trim();
    await row.click();

    await expect(page).toHaveURL(new RegExp(`/decisions/${id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(id);
  });

  test('renders a different trace for a different decision', async ({ page }) => {
    const readTrace = async (rowIndex: number) => {
      await page.goto('/decisions');
      const row = page.getByRole('row').nth(rowIndex);
      const id = (await row.locator('td').first().innerText()).trim();
      await row.click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(id);
      const customer = await page.getByText(/^cust_/).first().innerText();
      return { id, customer };
    };

    const first = await readTrace(1);
    const second = await readTrace(2);

    expect(second.id).not.toBe(first.id);
    // The whole bug: two decisions showing identical content.
    expect(second.customer).not.toBe(first.customer);
  });

  test('replays a decision and reports it identical', async ({ page }) => {
    await page.getByRole('row').nth(1).click();

    // The chain hash shown on the trace is what a replay has to reproduce.
    const storedHash = (await page.getByText(/^[0-9a-f]{64}$/).first().innerText()).trim();

    await page.getByRole('button', { name: 'Replay this decision' }).click();

    await expect(page.getByText('Identical', { exact: true })).toBeVisible();
    await expect(page.getByText(/Re-executed against artifact/)).toBeVisible();

    // Not a canned response: the engine ran again and produced the same hash.
    await expect(page.getByText('Replayed hash')).toBeVisible();
    const hashes = await page.getByText(new RegExp(`^${storedHash}$`)).count();
    expect(hashes).toBeGreaterThanOrEqual(2);
  });

  test('shows the chain hash as the evidence behind the decision id', async ({ page }) => {
    const row = page.getByRole('row').nth(1);
    const id = (await row.locator('td').first().innerText()).trim();
    await row.click();

    await expect(page.getByText('Chain hash')).toBeVisible();
    const hash = (await page.getByText(/^[0-9a-f]{64}$/).first().innerText()).trim();

    // The id is the first 16 hex of the hash, so it is verifiable, not a label.
    expect(id).toBe(`dec_${hash.slice(0, 16)}`);
  });

  test('switches the trace audience', async ({ page }) => {
    await page.getByRole('row').nth(1).click();

    await page.getByRole('button', { name: 'Regulator' }).click();
    await expect(page.getByRole('button', { name: 'Regulator' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByText('Consent state', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Engineer' }).click();
    await expect(
      page.getByRole('heading', { name: 'Execution timings' })
    ).toBeVisible();
  });

  test('filters to suppressed decisions and shows why nothing went out', async ({ page }) => {
    await page.getByLabel('Outcome').selectOption('suppressed');

    const firstOutcome = page.getByRole('row').nth(1).getByText('no offer');
    await expect(firstOutcome).toBeVisible();

    await page.getByRole('row').nth(1).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('no offer');
    await expect(page.getByText(/decision returned no offer/)).toBeVisible();
  });

  test('sorts by latency', async ({ page }) => {
    await page.getByRole('button', { name: /Latency/ }).click();
    const cells = await page
      .getByRole('row')
      .locator('td:last-child')
      .allInnerTexts();
    const values = cells.map((c) => parseFloat(c));
    const sorted = [...values].sort((a, b) => a - b);
    expect(values).toEqual(sorted);
  });
});
