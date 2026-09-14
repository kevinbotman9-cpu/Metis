import { test, expect } from '@playwright/test';
import { login, ACCOUNTS } from './helpers';

/**
 * The canvas carrying traffic. `METIS_CONSOLE_SPEC.md` §4.2: "Live volume
 * overlay on edges, from the last 24 hours, toggleable."
 *
 * An architect opens a flow and sees each edge as thick as the candidates that
 * crossed it, with the legend saying what thickness means, and turns it off to
 * get the plain graph back. Proposed operation `getFlowVolume` (G-127).
 */

const FLOW = '/decision-flows/next-best-action';

test.describe('@screen-only the volume overlay on the canvas', () => {
  test('draws edges by volume, says what thickness means, and turns off', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto(FLOW);

    const toggle = page.getByRole('button', { name: 'Volume overlay', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/^Edge thickness is candidates, last 24 hours$/)).toBeVisible();

    // Edges are drawn as volume, and at least one carried something. A graph of
    // zero-volume bands would be the overlay failing quietly.
    const bands = page.locator('path[data-volume]');
    await expect(bands.first()).toBeVisible();
    const volumes = await bands.evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-volume'))));
    expect(volumes.length).toBeGreaterThan(0);
    expect(Math.max(...volumes)).toBeGreaterThan(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText(/^Edge thickness is candidates, last 24 hours$/)).toHaveCount(0);
    await expect(bands).toHaveCount(0);
  });
});
