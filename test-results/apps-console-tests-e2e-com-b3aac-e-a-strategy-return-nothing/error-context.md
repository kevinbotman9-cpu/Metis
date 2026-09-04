# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps\console\tests\e2e\compiler.spec.ts >> compiler output in the console >> surfaces the missing-score warning that made a strategy return nothing
- Location: apps\console\tests\e2e\compiler.spec.ts:63:7

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/login", waiting until "load"

```

# Test source

```ts
  1  | import { type Page, expect } from '@playwright/test';
  2  | 
  3  | export const ACCOUNTS = {
  4  |   /** Decision architect / marketer. Authors offers, cannot approve. */
  5  |   sarah: 'sarah.chen@telco.example',
  6  |   /** Compliance officer. Approves changes and autonomy, cannot author offers. */
  7  |   priya: 'priya.natarajan@telco.example',
  8  |   /** Administrator. Everything, including arbitration weights. */
  9  |   marcus: 'marcus.webb@telco.example',
  10 | } as const;
  11 | 
  12 | /** Sign in through the real form, so the login path stays covered. */
  13 | export async function login(page: Page, email: string) {
> 14 |   await page.goto('/login');
     |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  15 |   await page.getByLabel('Email').fill(email);
  16 |   await page.getByLabel('Password').fill('demo');
  17 |   await page.getByRole('button', { name: 'Sign in' }).click();
  18 |   await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  19 | }
  20 | 
  21 | /**
  22 |  * Open the account panel in the header band.
  23 |  *
  24 |  * Appearance controls live here rather than on the band itself: they are a
  25 |  * once-a-month choice, and the band is reserved for the tools people use on
  26 |  * every page.
  27 |  */
  28 | export async function openAccountPanel(page: Page, name: string | RegExp) {
  29 |   await page.getByRole('button', { name }).click();
  30 |   await expect(page.getByRole('group', { name: 'Colour scheme' })).toBeVisible();
  31 | }
  32 | 
  33 | /** Restore seed data. The store is process-wide, so writes leak between specs. */
  34 | export async function resetStore(page: Page) {
  35 |   const res = await page.request.post('/api/_test/reset');
  36 |   expect(res.ok()).toBeTruthy();
  37 | }
  38 | 
```