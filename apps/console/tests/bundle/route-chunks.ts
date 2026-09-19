import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What each route of a production build loads to render, read from the build's
 * own manifests rather than from a browser.
 *
 * A route's JavaScript is:
 *
 * - `rootMainFiles` in `build-manifest.json` — the runtime every route loads;
 * - every chunk in `entryJSFiles` of the route's
 *   `server/app/<route>/page_client-reference-manifest.js` — the chunks for the
 *   route's layouts and page, which Next writes into the page as script tags;
 * - every `.js` file in the route's `react-loadable-manifest.json`, which lists
 *   what `next/dynamic` loads on the route. Empty for every route today.
 *
 * **What it does not see.** Code a route loads at runtime that none of those
 * lists names: a bare `import()` in a client component, a chunk Next fetches
 * for a client component that arrives only in a later RSC payload, anything a
 * script injects. The one such load in the console today is the MSW worker in
 * `app/layout-client.tsx`, which is off in a production build. When the
 * question is whether a route loads more than this says, measure it in a
 * browser with `scripts/measure-route-payload.mjs`.
 *
 * **Why manifests.** The check this replaced measured what a browser downloaded
 * on a cold load, and could not measure one build twice the same way: `/`
 * read 813.7 kB once against 679 kB on every other run of the same code (G-112),
 * and a browser wait could hang the measurement (G-132). One build now gives
 * one number. On 2026-09-19 the two methods agreed on all nine budgeted routes
 * to a tenth of a kilobyte.
 *
 * The manifests are Next's internals and move between versions. So every read
 * here refuses rather than defaults: a missing file, a changed format, an empty
 * list or a chunk not on disk is an error naming what it expected, never a
 * route that quietly weighs nothing.
 */

export class ManifestError extends Error {}

export interface RouteChunks {
  /** The app route, as a path pattern: `/offers`, `/decision-flows/[id]`. */
  route: string;
  /** Build-relative paths, `static/chunks/…`, each counted once. */
  chunks: string[];
  bytes: number;
}

/** The environment `next build` runs under for a budget. `.env.local` must not open a person's database. */
export const BUILD_ENV = { METIS_DATABASE_URL: '' } as const;

function readJson(file: string, what: string): unknown {
  if (!existsSync(file)) throw new ManifestError(`${what} is missing: expected ${file}. Has the console been built?`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** `/offers/page` → `/offers`; route groups dropped, since they are not in a URL. */
export function routeOf(pageKey: string): string {
  const segments = pageKey
    .slice(0, -'/page'.length)
    .split('/')
    .filter((s) => s !== '' && !/^\(.*\)$/.test(s));
  return `/${segments.join('/')}`;
}

/**
 * One route's `entryJSFiles`, parsed from the manifest's text rather than
 * evaluated: the file is a single assignment of a JSON object, and anything
 * else is a format this does not know.
 */
export function entryFilesOf(manifestText: string, pageKey: string): string[] {
  const prefix = `globalThis.__RSC_MANIFEST[${JSON.stringify(pageKey)}] = `;
  const at = manifestText.indexOf(prefix);
  if (at < 0) throw new ManifestError(`the client reference manifest has no entry for ${pageKey}`);
  const body = manifestText.slice(at + prefix.length).replace(/;\s*$/, '');
  let manifest: { entryJSFiles?: Record<string, unknown> };
  try {
    manifest = JSON.parse(body);
  } catch {
    throw new ManifestError(`the client reference manifest for ${pageKey} is not one JSON assignment`);
  }
  const entries = manifest.entryJSFiles;
  if (!entries || typeof entries !== 'object') {
    throw new ManifestError(`the client reference manifest for ${pageKey} has no entryJSFiles`);
  }
  const own = Object.keys(entries).filter((k) => k.endsWith(`app${pageKey}`));
  if (own.length === 0) {
    throw new ManifestError(`entryJSFiles for ${pageKey} names no entry for the page itself; keys: ${Object.keys(entries).join(', ')}`);
  }
  const files: string[] = [];
  for (const [key, list] of Object.entries(entries)) {
    if (!Array.isArray(list) || list.some((f) => typeof f !== 'string')) {
      throw new ManifestError(`entryJSFiles[${key}] for ${pageKey} is not a list of files`);
    }
    files.push(...(list as string[]).filter((f) => f.endsWith('.js')));
  }
  if (files.length === 0) throw new ManifestError(`entryJSFiles for ${pageKey} lists no JavaScript`);
  return files;
}

/** The `.js` files `next/dynamic` loads on a route, or none when the route has no loadable manifest. */
export function loadableFilesOf(manifest: unknown, pageKey: string): string[] {
  if (!manifest || typeof manifest !== 'object') {
    throw new ManifestError(`the loadable manifest for ${pageKey} is not an object`);
  }
  const files: string[] = [];
  for (const [key, entry] of Object.entries(manifest as Record<string, unknown>)) {
    const listed = (entry as { files?: unknown } | null)?.files;
    if (!Array.isArray(listed)) throw new ManifestError(`the loadable manifest for ${pageKey} names ${key} with no files`);
    files.push(...listed.filter((f): f is string => typeof f === 'string' && f.endsWith('.js')));
  }
  return files;
}

/** Every page route in the build, with the chunks it loads and their size on disk. */
export function readRouteChunks(nextDir: string): RouteChunks[] {
  const build = readJson(join(nextDir, 'build-manifest.json'), 'the build manifest') as { rootMainFiles?: unknown };
  const root = build.rootMainFiles;
  if (!Array.isArray(root) || root.length === 0) {
    throw new ManifestError('the build manifest lists no rootMainFiles; the format has moved');
  }
  const appPaths = readJson(join(nextDir, 'server', 'app-paths-manifest.json'), 'the app paths manifest') as Record<
    string,
    string
  >;
  // `/_not-found` and `/_global-error` are Next's own pages, not the console's:
  // an app folder starting with `_` is never routed, and their manifests name
  // no page entry of their own.
  const pages = Object.keys(appPaths).filter((k) => k.endsWith('/page') && !k.startsWith('/_'));
  if (pages.length === 0) throw new ManifestError('the app paths manifest lists no pages');

  return pages
    .map((pageKey) => {
      const pageFile = join(nextDir, 'server', appPaths[pageKey]);
      const referenceFile = pageFile.replace(/\.js$/, '_client-reference-manifest.js');
      if (!existsSync(referenceFile)) {
        throw new ManifestError(`${pageKey} has no client reference manifest: expected ${referenceFile}`);
      }
      const chunks = new Set<string>(root as string[]);
      for (const f of entryFilesOf(readFileSync(referenceFile, 'utf8'), pageKey)) chunks.add(f);

      const loadableFile = join(pageFile.replace(/\.js$/, ''), 'react-loadable-manifest.json');
      if (existsSync(loadableFile)) {
        for (const f of loadableFilesOf(readJson(loadableFile, 'a loadable manifest'), pageKey)) chunks.add(f);
      }

      let bytes = 0;
      for (const chunk of chunks) {
        const file = join(nextDir, chunk);
        if (!existsSync(file)) throw new ManifestError(`${pageKey} lists ${chunk}, which is not in the build`);
        bytes += statSync(file).size;
      }
      return { route: routeOf(pageKey), chunks: [...chunks].sort(), bytes };
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

export interface Budgets {
  default: number;
  routes: Record<string, number>;
}

export interface BudgetResult {
  /** One line per route, pass or fail: a budget nobody sees the headroom on gets raised in a hurry. */
  lines: string[];
  failures: string[];
}

const KB = 1024;
const kb = (bytes: number) => Math.round((bytes / KB) * 10) / 10;

/**
 * Every route against its budget, or the default. A budget naming a route the
 * build does not have is a failure too: it is a budget guarding nothing, left
 * behind by a rename.
 */
export function checkBudgets(measured: RouteChunks[], budgets: Budgets): BudgetResult {
  const lines: string[] = [];
  const failures: string[] = [];
  const routes = new Set(measured.map((m) => m.route));
  for (const route of Object.keys(budgets.routes)) {
    if (!routes.has(route)) failures.push(`${route} has a budget and no page in the build`);
  }
  for (const m of measured) {
    const own = budgets.routes[m.route];
    const budget = own ?? budgets.default;
    const actual = kb(m.bytes);
    lines.push(`${m.route}: ${actual} kB of ${budget} kB${own === undefined ? ' (default)' : ''}, ${m.chunks.length} chunks`);
    if (m.bytes === 0) failures.push(`${m.route} measured 0 bytes; the check is not measuring`);
    else if (actual > budget) {
      failures.push(
        `${m.route} ships ${actual} kB of JavaScript against a ${budget} kB budget. Either trim it or raise ` +
          'the budget deliberately in bundle-budgets.json, saying in the commit message what got bigger and why ' +
          'it earns its place.'
      );
    }
  }
  return { lines, failures };
}
