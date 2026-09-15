import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/**
 * The suite starts the server it measures, and never reuses one. G-035.
 *
 * Its own port, because 3000 is where a person runs the console and a shared
 * port is how a person's long-lived server became the thing under test. 3100 is
 * the bundle-budget server. `E2E_PORT` rather than `PORT`, which `next dev`
 * also reads and a person may have exported.
 *
 * A run token, set once in the runner process and inherited by everything it
 * spawns, so `global-setup.ts` can refuse any server that is not the one this
 * invocation started.
 */
const PORT = Number(process.env.E2E_PORT || 3200);
const baseURL = `http://localhost:${PORT}`;
process.env.METIS_E2E_RUN ||= randomUUID();

export default defineConfig({
  testDir: './tests/e2e',
  // The dev API store is shared process state, so specs that write must not
  // race each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // Kept, but it is not the fix and must not be treated as one. The two
  // failures that prompted this work were budget failures under machine load,
  // and they were addressed at the source: routes are compiled up front by the
  // warmup project, and the one test that visited sixteen pages inside a single
  // timeout was split. A test that passes only on retry is a defect to
  // investigate, not a result to accept.
  retries: process.env.CI ? 1 : 0,
  // The JSON reporter is what makes a retry visible. `retries: 1` above means a
  // test that fails once and passes on the second attempt is reported as
  // passing, and CI has never run this suite more than once per push — so a
  // suite failing one run in three passed two pushes in three, silently. The
  // workflow reads this file and writes any flaky test into the run summary.
  // `PLAYWRIGHT_JSON_OUTPUT_NAME` is read explicitly rather than relied on
  // implicitly: a config `outputFile` wins over the environment variable, so
  // the flake hunt's four runs would each have overwritten the last and the
  // job would have uploaded one file describing whichever ran last. Named here
  // so the workflow can give each run its own, and so the precedence is
  // visible in the file rather than in a Playwright release note.
  reporter: process.env.CI
    ? [
        ['github'],
        ['list'],
        ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'playwright-results.json' }],
      ]
    : [['list']],
  // Refuses a server this run did not start, or one serving other fixtures.
  // See tests/server-trust.ts, and G-002 and G-035 in docs/gaps.md.
  globalSetup: './tests/global-setup.ts',
  // Measured on this machine with ten busy loops on twelve cores, which is
  // roughly what a CI runner under contention looks like: page visits go from
  // ~2s to ~4s, and the slowest single test (dark-theme contrast over four
  // pages) from 6.3s to 18.6s. 45s leaves that a 2.4x margin while still
  // failing a genuine hang promptly.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // `next dev` compiles a route on its first request, so without this the
    // first test to reach a route pays that cost inside its own 10s expect
    // timeout. See tests/e2e/warmup.setup.ts.
    { name: 'warmup', testMatch: /warmup\.setup\.ts$/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Without this the warmup runs twice: once as the dependency, once as an
      // ordinary spec, because it lives under the same testDir.
      testIgnore: /warmup\.setup\.ts$/,
      dependencies: ['warmup'],
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: baseURL,
    // Never. A reused server produced results that described the server
    // rather than the code, twice: stale fixtures (G-002) and a server that
    // slowed twentyfold partway through a suite (G-035). With this false,
    // Playwright refuses a busy port before a single test runs.
    reuseExistingServer: false,
    env: {
      // Inside `.next`, so git and eslint already ignore it. tsc does not, on
      // purpose: `next dev` adds this directory's generated route types to
      // tsconfig.json's include, as it did for `.next/dev`, and those globs are
      // committed so a run does not dirty the tree.
      NEXT_DIST_DIR: '.next/e2e',
      METIS_E2E_RUN: process.env.METIS_E2E_RUN!,
      // Declared, never defaulted (ADR-016 §4.1): the harness serves fixtures.
      METIS_DATA_CLASS: 'synthetic',
    },
    timeout: 120_000,
  },
});
