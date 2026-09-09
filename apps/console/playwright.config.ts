import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 3000);
const baseURL = `http://localhost:${PORT}`;

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
  reporter: process.env.CI
    ? [['github'], ['list'], ['json', { outputFile: 'playwright-results.json' }]]
    : [['list']],
  // Refuses a reused dev server that has been up too long. See the file, and
  // G-035 in docs/gaps.md.
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
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
