import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkBudgets, readRouteChunks, routeOf, ManifestError, type RouteChunks } from '../bundle/route-chunks';

/**
 * The route budget's measurement, over a build written here in the shape
 * Next 16 writes it: `build-manifest.json`, `server/app-paths-manifest.json`,
 * and per page a client reference manifest and, sometimes, a loadable one.
 */

let dir: string;

function write(rel: string, text: string) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** A chunk of exactly `bytes` bytes. */
const chunk = (name: string, bytes: number) => write(`static/chunks/${name}`, 'x'.repeat(bytes));

function reference(pageKey: string, entries: Record<string, string[]>) {
  const manifest = { moduleLoading: { prefix: '' }, clientModules: {}, entryJSFiles: entries };
  write(
    `server/app${pageKey}_client-reference-manifest.js`,
    `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n` +
      `globalThis.__RSC_MANIFEST[${JSON.stringify(pageKey)}] = ${JSON.stringify(manifest)};\n`
  );
}

const LAYOUT = '[project]/apps/console/app/layout';

/** Two routes, `/offers` linking to `/placements`, sharing a runtime and a layout. */
function buildTwoRoutes() {
  write('build-manifest.json', JSON.stringify({ rootMainFiles: ['static/chunks/runtime.js'] }));
  write(
    'server/app-paths-manifest.json',
    JSON.stringify({
      '/offers/page': 'app/offers/page.js',
      '/placements/page': 'app/placements/page.js',
      '/_not-found/page': 'app/_not-found/page.js',
      '/api/[...path]/route': 'app/api/[...path]/route.js',
    })
  );
  chunk('runtime.js', 1000);
  chunk('layout.js', 200);
  chunk('offers.js', 30);
  chunk('placements.js', 40);
  reference('/offers/page', {
    [LAYOUT]: ['static/chunks/layout.js'],
    '[project]/apps/console/app/offers/page': ['static/chunks/layout.js', 'static/chunks/offers.js', 'static/chunks/offers.css'],
  });
  reference('/placements/page', {
    [LAYOUT]: ['static/chunks/layout.js'],
    '[project]/apps/console/app/placements/page': ['static/chunks/placements.js'],
  });
}

const route = (all: RouteChunks[], name: string) => all.find((r) => r.route === name)!;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'route-chunks-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('what a route loads, read from the build', () => {
  it('counts the runtime, the layouts and the page, each chunk once and JavaScript only', () => {
    buildTwoRoutes();
    const offers = route(readRouteChunks(dir), '/offers');
    expect(offers.chunks).toEqual(['static/chunks/layout.js', 'static/chunks/offers.js', 'static/chunks/runtime.js']);
    expect(offers.bytes).toBe(1000 + 200 + 30);
  });

  it("measures every page route, and neither Next's own pages nor API routes", () => {
    buildTwoRoutes();
    expect(readRouteChunks(dir).map((r) => r.route)).toEqual(['/offers', '/placements']);
  });

  it('does not count a screen a route links to, so making that screen heavier moves nothing', () => {
    // W-081's *Done when*. The browser check counted Next's prefetch of linked
    // screens until 2026-09-13, and a heavier /placements failed /offers. A
    // client reference manifest has no notion of a link: it lists the route's
    // own tree, so what /placements weighs cannot reach /offers' number.
    buildTwoRoutes();
    const before = readRouteChunks(dir);
    chunk('placements.js', 400_000);
    const after = readRouteChunks(dir);
    expect(route(after, '/placements').bytes).toBeGreaterThan(route(before, '/placements').bytes);
    expect(route(after, '/offers').bytes).toBe(route(before, '/offers').bytes);
  });

  it('adds what next/dynamic loads on the route', () => {
    buildTwoRoutes();
    chunk('lazy.js', 7);
    write(
      'server/app/offers/page/react-loadable-manifest.json',
      JSON.stringify({ 'app/offers/page.tsx -> ./heavy': { id: 1, files: ['static/chunks/lazy.js'] } })
    );
    expect(route(readRouteChunks(dir), '/offers').bytes).toBe(1000 + 200 + 30 + 7);
  });

  it('names a route by its URL pattern, without route groups', () => {
    expect(routeOf('/page')).toBe('/');
    expect(routeOf('/decision-flows/[id]/page')).toBe('/decision-flows/[id]');
    expect(routeOf('/(shell)/offers/page')).toBe('/offers');
  });
});

describe('a build it cannot read is refused, never measured as lighter', () => {
  const refuses = (pattern: RegExp) => {
    expect(() => readRouteChunks(dir)).toThrow(ManifestError);
    expect(() => readRouteChunks(dir)).toThrow(pattern);
  };

  it('when there is no build', () => refuses(/the build manifest is missing/));

  it('when the runtime list is gone', () => {
    buildTwoRoutes();
    write('build-manifest.json', JSON.stringify({ rootMainFiles: [] }));
    refuses(/no rootMainFiles/);
  });

  it("when a page's client reference manifest is missing", () => {
    buildTwoRoutes();
    fs.rmSync(path.join(dir, 'server/app/offers/page_client-reference-manifest.js'));
    refuses(/\/offers\/page has no client reference manifest/);
  });

  it('when the manifest is no longer one JSON assignment', () => {
    buildTwoRoutes();
    write(
      'server/app/offers/page_client-reference-manifest.js',
      'globalThis.__RSC_MANIFEST["/offers/page"] = buildIt({});'
    );
    refuses(/is not one JSON assignment/);
  });

  it('when the manifest names no entry for the page itself', () => {
    buildTwoRoutes();
    reference('/offers/page', { [LAYOUT]: ['static/chunks/layout.js'] });
    refuses(/names no entry for the page itself/);
  });

  it('when a listed chunk is not in the build', () => {
    buildTwoRoutes();
    fs.rmSync(path.join(dir, 'static/chunks/offers.js'));
    refuses(/lists static\/chunks\/offers\.js, which is not in the build/);
  });

  it('when a loadable manifest names something with no files', () => {
    buildTwoRoutes();
    write('server/app/offers/page/react-loadable-manifest.json', JSON.stringify({ heavy: { id: 1 } }));
    refuses(/names heavy with no files/);
  });
});

describe('the budgets', () => {
  const measured = (entries: [string, number][]): RouteChunks[] =>
    entries.map(([r, kb]) => ({ route: r, chunks: ['static/chunks/a.js'], bytes: Math.round(kb * 1024) }));

  it('passes a route at its budget and fails one a tenth of a kilobyte over', () => {
    const { failures } = checkBudgets(measured([['/offers', 810], ['/audit', 640.1]]), {
      default: 820,
      routes: { '/offers': 810, '/audit': 640 },
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^\/audit ships 640\.1 kB of JavaScript against a 640 kB budget/);
  });

  it('holds a route with no budget of its own to the default, and says so', () => {
    const { lines, failures } = checkBudgets(measured([['/models', 820.1]]), { default: 820, routes: {} });
    expect(lines).toEqual(['/models: 820.1 kB of 820 kB (default), 1 chunks']);
    expect(failures).toHaveLength(1);
  });

  it('fails a budget naming a route the build does not have', () => {
    const { failures } = checkBudgets(measured([['/offers', 1]]), {
      default: 820,
      routes: { '/offers': 810, '/decision-flows/next-best-action': 910 },
    });
    expect(failures).toEqual(['/decision-flows/next-best-action has a budget and no page in the build']);
  });

  it('fails a route that measured nothing', () => {
    const { failures } = checkBudgets(measured([['/offers', 0]]), { default: 820, routes: {} });
    expect(failures).toEqual(['/offers measured 0 bytes; the check is not measuring']);
  });

  it('reports every route, passing or not', () => {
    const { lines } = checkBudgets(measured([['/offers', 700], ['/audit', 600]]), {
      default: 820,
      routes: { '/offers': 810 },
    });
    expect(lines).toEqual(['/offers: 700 kB of 810 kB, 1 chunks', '/audit: 600 kB of 820 kB (default), 1 chunks']);
  });
});
