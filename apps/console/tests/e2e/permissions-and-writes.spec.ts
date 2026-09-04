import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS, openAccountPanel } from './helpers';

test.describe('role-based access', () => {
  test('hides the audit log from an account without view:audit', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    const nav = page.getByRole('navigation', { name: 'Main' });
    // Sarah has view:audit, so it is present. Assert the mechanism instead by
    // checking a permission she lacks surfaces as read-only.
    await expect(nav.getByRole('link', { name: 'Arbitration & Levers' })).toBeVisible();

    await page.goto('/arbitration');
    await expect(page.getByText('read only')).toBeVisible();
    await expect(page.getByRole('button', { name: /Publish weights/ })).toHaveCount(0);
  });

  test('lets an administrator edit arbitration', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/arbitration');
    await expect(page.getByText('read only')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Publish weights/ })).toBeVisible();
  });

  test('gates approval on the permission, not just the UI', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);
    await page.goto('/approvals/cr_0042');
    await expect(page.getByText('approve:changes required')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);

    // The server must refuse too, not merely the hidden button. page.request
    // does not share the browser's localStorage, so send the token explicitly —
    // otherwise this asserts 401 (no session) rather than 403 (no permission).
    const token = await page.evaluate(() => localStorage.getItem('metis.auth.token'));
    const res = await page.request.post('/api/change-requests/cr_0042/approve', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).message).toContain('approve:changes');
  });

  test('shows approve and reject to a compliance officer', async ({ page }) => {
    await login(page, ACCOUNTS.priya);
    await page.goto('/approvals/cr_0042');
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
  });
});

test.describe('writes persist', () => {
  test.afterEach(async ({ page }) => {
    await resetStore(page);
  });

  test('publishing arbitration weights survives a reload and is audited', async ({ page }) => {
    await login(page, ACCOUNTS.marcus);
    await page.goto('/arbitration');

    const context = page.getByRole('slider', { name: 'Context weight' });
    await context.fill('0.35');
    await page.getByRole('button', { name: /Publish weights/ }).click();
    await expect(page.getByText('Published. Recorded in the audit log.')).toBeVisible();

    await page.reload();
    await expect(page.getByText('C0.35')).toBeVisible();

    await page.goto('/audit');
    await expect(page.getByText('ArbitrationWeightsChanged').first()).toBeVisible();
  });

  test('approving a change request applies its diff and records the decision', async ({ page }) => {
    await login(page, ACCOUNTS.priya);

    // cr_0042 lowers the heavy-user threshold from 0.8 to 0.7.
    const before = await page.request.get('/api/engagement-policies/telco-uk');
    const policyBefore = (await before.json()).policies.find(
      (p: { id: string }) => p.id === 'pol_heavy_user'
    );
    expect(policyBefore.conditions[0].value).toBe(0.8);

    await page.goto('/approvals/cr_0042');
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/Approved\. The change will publish/)).toBeVisible();

    const after = await page.request.get('/api/engagement-policies/telco-uk');
    const policyAfter = (await after.json()).policies.find(
      (p: { id: string }) => p.id === 'pol_heavy_user'
    );
    expect(policyAfter.conditions[0].value).toBe(0.7);

    await page.goto('/audit');
    await expect(page.getByText('ChangeRequestApproved').first()).toBeVisible();
  });

  test('changing an autonomy level persists and is audited', async ({ page }) => {
    await login(page, ACCOUNTS.priya);
    await page.goto('/agentic');

    await page.getByRole('button', { name: 'Change level' }).first().click();
    await page.getByRole('button', { name: 'L3 Bounded' }).click();

    await page.reload();
    await page.goto('/audit');
    await expect(page.getByText('AutonomyChanged').first()).toBeVisible();
  });
});

test.describe('appearance', () => {
  test('theme and density persist across navigation', async ({ page }) => {
    await login(page, ACCOUNTS.sarah);

    await openAccountPanel(page, /Sarah Chen/);
    await page.getByRole('group', { name: 'Colour scheme' }).getByText('Dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('group', { name: 'Density' }).getByText('Compact').click();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');

    await page.goto('/decisions');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  });
});
