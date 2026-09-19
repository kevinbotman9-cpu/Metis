import { defineConfig, devices } from '@playwright/test';

/**
 * A production build, served, for measuring route payloads in a browser.
 *
 * Used only by `scripts/measure-route-payload.mjs`. The route budgets read the
 * build's manifests instead (`tests/bundle/route-chunks.ts`, since 2026-09-19);
 * this is how to see what a browser actually loads, which is the question when
 * a route might load code no manifest names.
 *
 * A separate config from `playwright.config.ts` because the two need opposite
 * servers. The E2E suite runs `next dev` for speed; a payload measured against
 * dev is meaningless — unminified modules with HMR attached — so this one
 * builds and serves for real.
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
    // A build and a production server both load `.env.local`. A budget has no
    // business opening a person's database — the reason is in
    // `playwright.config.ts`, the check in `tests/unit/e2e-harness-memory.test.ts`.
    env: { METIS_DATABASE_URL: '' },
    timeout: 300_000,
  },
});
