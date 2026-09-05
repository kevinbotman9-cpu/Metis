import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Compile every route before the suite asserts against any of them.
 *
 * `next dev` compiles a route the first time it is requested. Whichever test
 * happens to reach a route first therefore pays that cost inside its own
 * `expect` timeout, which is 10s. Paid here instead, it is one cost, once, with
 * a 90s budget per route rather than 10s.
 *
 * Be precise about what this does and does not explain. Two tests in
 * `app-shell.spec.ts` failed once, in a 22.8-minute run made while a Gradle
 * build and an npm install were running alongside it. A cold server alone does
 * not reproduce it: with `.next` deleted and the port freed, the same 32 tests
 * pass in 2.0 minutes. Machine load is the other half — with ten busy loops on
 * twelve cores, page visits go from ~2s to ~4s and the worst test went from
 * 6.3s to 18.6s. So the failure was a budget failure under contention, and
 * removing avoidable work from the assertion path is one of the two fixes; the
 * other was splitting the test that visited sixteen pages inside a single
 * timeout. Neither is a claim that the original failure was reproduced on
 * demand, because it was not.
 *
 * This runs as a setup *project* rather than a `globalSetup` hook because a
 * project dependency is ordered after `webServer` by construction, whereas the
 * relative order of `globalSetup` and `webServer` is a detail of the runner.
 *
 * The route list is read from the filesystem rather than written out by hand.
 * A hand-written list is correct on the day it is written; the next route
 * added without touching this file would reintroduce the flake on that route
 * alone, which is the hardest version of this bug to recognise.
 */

const APP_DIR = path.resolve(__dirname, '../../app');

/** Anything that stands in for a real id: the route module compiles either way. */
const DYNAMIC_PLACEHOLDER = '_warmup';

function routeUrls(): string[] {
  const urls: string[] = [];

  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Route groups `(name)` and private folders `_name` do not appear in the URL.
      if (entry.name.startsWith('(') || entry.name.startsWith('_')) {
        walk(path.join(dir, entry.name), segments);
        continue;
      }
      // `[id]`, `[...path]` and `[[...path]]` all need a concrete value here.
      const segment = entry.name.startsWith('[') ? DYNAMIC_PLACEHOLDER : entry.name;
      walk(path.join(dir, entry.name), [...segments, segment]);
    }

    if (fs.existsSync(path.join(dir, 'page.tsx'))) {
      urls.push('/' + segments.join('/'));
    }
  };

  walk(APP_DIR, []);
  return [...new Set(urls)].sort();
}

test('every route is compiled before the suite starts', async ({ page, request }) => {
  // Compiling ~18 App Router pages from cold is the single slowest thing the
  // suite does. It is one cost, paid here, where it is visible and named.
  test.setTimeout(5 * 60_000);

  const urls = routeUrls();
  expect(urls.length, 'no routes found — the app directory layout has changed').toBeGreaterThan(10);

  // The catch-all API route backs every data surface, so it is worth warming
  // first: a page that renders while its data route is still compiling looks
  // like a slow page rather than a slow API.
  const api = await request.get('/api/taxonomy');
  expect(
    api.status(),
    'the dev API did not answer — the rest of the warmup would be measuring the wrong thing'
  ).toBeLessThan(500);

  const slow: Array<{ url: string; ms: number }> = [];

  for (const url of urls) {
    const started = Date.now();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    const ms = Date.now() - started;

    // A 404 is fine — `_warmup` is not a real id, and the route compiled
    // regardless, which is the whole point. A 5xx is a broken route, and
    // finding it here beats finding it as a timeout three specs later.
    expect(response?.status(), `${url} failed to render`).toBeLessThan(500);

    if (ms > 5_000) slow.push({ url, ms });
  }

  if (slow.length > 0) {
    console.log(
      `warmup: ${slow.length} of ${urls.length} routes took over 5s to compile:\n` +
        slow.map((s) => `  ${String(s.ms).padStart(6)}ms  ${s.url}`).join('\n')
    );
  }
});
