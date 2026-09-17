import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * The console on a tenant that has never decided anything.
 *
 * Seven screens read the ledger, and until 2026-09-17 not one of them had been
 * seen empty by a check. The reason is structural rather than an oversight:
 * `playwright.config.ts` sets `METIS_SEED_LEDGER=1`, and `warmup.setup.ts`
 * asserts the server seeded exactly 10,400 decisions and fails the whole run if
 * it did not. So the state every new tenant starts in was the one state the
 * suite could not reach.
 *
 * **This is a second config rather than a second project, on purpose.** The
 * seeded warm-up keeps its hard `toBe(10_400)` — nothing here weakens it, and
 * nothing here can, because the two runs share no file. A project inside the
 * seeded config would have meant either a second `next dev` inside each of the
 * four shards, or relaxing the warm-up so it tolerated both worlds; the second
 * is exactly the weakening the product owner asked to avoid, and the first
 * pays an 18-second compile four times to run seven page visits.
 *
 * Its own `testDir`, which also keeps `tests/e2e-sharding.test.ts` correct: that
 * check reads `tests/e2e/*.spec.ts` off disk and asserts the four shards
 * partition it. A spec added here is outside that set by construction, so the
 * partition arithmetic does not move. `e2e-sharding` has its own assertion that
 * this directory is wholly covered by this config.
 *
 * Its own port, for the same reason the seeded suite has one: a shared port is
 * how a person's long-lived server became the thing under test (G-035). 3200 is
 * the seeded suite, 3100 the bundle budget, 3000 a person's console.
 */
const PORT = Number(process.env.E2E_EMPTY_PORT || 3300);
const baseURL = `http://localhost:${PORT}`;
process.env.METIS_E2E_RUN ||= randomUUID();

export default defineConfig({
  testDir: './tests/e2e-empty',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // No retries. The seeded suite carries one because a loaded runner can make a
  // timing-sensitive assertion flap; this suite visits seven pages and asserts
  // on text, and a retry here would hide the thing it exists to catch.
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  // The same one the seeded suite uses. It checks the run token and that the
  // served catalogue fingerprint matches disk — both of which still apply here,
  // because this suite empties the ledger and keeps the catalogue. It says
  // nothing about the ledger, so it needs no variant; the ledger assertion is
  // the first test in the suite, where it is read rather than buried.
  globalSetup: './tests/global-setup.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      // Its own dist directory, so the two suites do not evict each other's
      // compiled routes when both run on one machine.
      NEXT_DIST_DIR: '.next/e2e-empty',
      METIS_E2E_RUN: process.env.METIS_E2E_RUN!,
      METIS_DATA_CLASS: 'synthetic',
      // The point of this config. `''` rather than unset because `env` here is
      // the whole environment the server gets, and an explicit empty string
      // says the value was chosen — `seedPlanFromEnv` reads both as off, and
      // `'0'` too since 2026-09-17.
      METIS_SEED_LEDGER: '',
    },
    timeout: 120_000,
  },
});
