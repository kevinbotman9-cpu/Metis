import { defineConfig, devices } from '@playwright/test';

/**
 * Bundle budgets, run against a production build.
 *
 * A separate config from `playwright.config.ts` because the two need opposite
 * servers. The E2E suite runs `next dev` for speed; a budget measured against
 * dev is meaningless — unminified modules with HMR attached — so this one
 * builds and serves for real.
 *
 * That makes it slow, which is why it is its own command rather than another
 * project in the main suite. CI runs it after the build it already does.
 */
export default defineConfig({
  testDir: './tests/bundle',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3100',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    // `next build` first: serving a stale build would measure whatever was
    // there last time and call it today's number.
    //
    // Not `next start` — it refuses an `output: standalone` build, warns, and
    // serves something that reported 0 kB for every route.
    command: 'npm run build && node scripts/serve-standalone.mjs',
    url: 'http://localhost:3100/login',
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
