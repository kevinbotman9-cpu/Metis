import { type Page, expect } from '@playwright/test';

export const ACCOUNTS = {
  /** Decision architect / marketer. Authors offers, cannot approve. */
  sarah: 'sarah.chen@telco.example',
  /** Compliance officer. Approves changes and autonomy, cannot author offers. */
  priya: 'priya.natarajan@telco.example',
  /** Administrator. Everything, including arbitration weights. */
  marcus: 'marcus.webb@telco.example',
} as const;

/** Sign in through the real form, so the login path stays covered. */
export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

/** Restore seed data. The store is process-wide, so writes leak between specs. */
export async function resetStore(page: Page) {
  const res = await page.request.post('/api/_test/reset');
  expect(res.ok()).toBeTruthy();
}
