import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import config from '../../playwright.config';

/**
 * The suite owns the server it measures. G-035.
 *
 * On 2026-09-12 a dev server went from about twenty tests a minute to one,
 * partway through a full run, about forty minutes after it started. The uptime
 * guard in force refused servers older than two hours, and it could not have
 * caught this for two reasons: the damage came from work the server had served
 * and load around it rather than from its age, and the guard ran once, before
 * the suite, so a server that degraded during the run passed it. A slower
 * server does not fail loudly. It turns every timing-sensitive assertion into a
 * coin flip and makes a slow suite read as a flaky one — the same shape as a
 * bite-proof against stale fixtures (G-002), except that it corrupts results
 * rather than hiding changes.
 *
 * Three answers were weighed. A shorter age threshold measures the wrong
 * variable. A throughput probe measures the right symptom, but needs a baseline
 * that differs between a laptop and a CI runner, and a probe before the suite
 * cannot see a server that degrades during it. What was chosen removes the
 * cause: the harness starts a fresh server every run, on a port and dist
 * directory nothing else uses, and never reuses one. Every observed case — the
 * seventeen-hour server, the forty-minute one, and G-002's stale seed — was a
 * reused server.
 *
 * These assertions are the invariant. A change that brings reuse back — the
 * convenient thing to do the first time a cold start feels slow — fails here
 * rather than in a result somebody believes.
 */

const server = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer!;

describe('the suite starts its own server and never reuses one', () => {
  it('refuses to reuse a server already listening', () => {
    // With this false, Playwright itself refuses a busy port before any test
    // runs: "… is already used, make sure that nothing is running on the port".
    expect(server.reuseExistingServer).toBe(false);
  });

  it('listens where nobody starts a console by hand', () => {
    // 3000 is `next dev`'s default and what `.claude/launch.json` starts for a
    // person; 3100 is the bundle-budget server. A shared port is how a
    // person's long-lived server became the thing under test.
    const port = Number(new URL(String(config.use?.baseURL)).port);
    expect(port).not.toBe(3000);
    expect(port).not.toBe(3100);
    expect(server.url).toBe(config.use?.baseURL);
    expect(server.command).toContain(String(port));
  });

  it('builds into a dist directory of its own, inside .next', () => {
    // Next 16 takes a lock at `<distDir>/lock` and refuses a second `next dev`
    // on the same directory, so a separate directory is what lets the suite run
    // beside a person's server rather than failing on it. Inside `.next` so the
    // existing ignores already cover it: git, tsc's exclude and eslint.
    const dir = server.env?.NEXT_DIST_DIR;
    expect(dir).toBeTruthy();
    expect(dir).not.toBe('.next');
    expect(dir!.startsWith('.next/')).toBe(true);
  });

  it('hands the server the run token the setup checks it for', () => {
    const run = server.env?.METIS_E2E_RUN;
    expect(run).toBeTruthy();
    expect(run).toBe(process.env.METIS_E2E_RUN);
  });
});

describe('the console builds where it is told to', () => {
  // `next.config.js` reads the environment when it is loaded, so it is loaded
  // fresh for each case rather than imported once.
  const load = (dist: string | undefined) => {
    const require = createRequire(import.meta.url);
    const file = path.resolve(__dirname, '../../next.config.js');
    delete require.cache[require.resolve(file)];
    const before = process.env.NEXT_DIST_DIR;
    if (dist === undefined) delete process.env.NEXT_DIST_DIR;
    else process.env.NEXT_DIST_DIR = dist;
    try {
      return require(file) as { distDir?: string };
    } finally {
      if (before === undefined) delete process.env.NEXT_DIST_DIR;
      else process.env.NEXT_DIST_DIR = before;
    }
  };

  it('uses the directory the harness names', () => {
    expect(load('.next/e2e').distDir).toBe('.next/e2e');
  });

  it('uses the default for everybody else', () => {
    expect(load(undefined).distDir ?? '.next').toBe('.next');
  });
});
