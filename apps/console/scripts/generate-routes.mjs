#!/usr/bin/env node
/**
 * Writes lib/nav/routes.generated.ts: every static page route the console
 * serves, read from the filesystem.
 *
 * The navigation is a join between the persona manifest (what screens the
 * product has, by persona) and this list (what screens exist today). A screen
 * in the manifest with no route here does not appear — which is the whole
 * mechanism by which "screens that don't exist yet don't appear" is true
 * without anybody maintaining a list by hand.
 *
 * Dynamic segments are excluded. `/decisions/[id]` is a real route, but the
 * rail cannot link to it without an id, so it is not a destination. Route
 * groups `(name)` and private folders `_name` do not appear in the URL and are
 * walked through, the same way tests/e2e/warmup.setup.ts reads them.
 *
 * Run with `npm run generate` in apps/console. tests/unit/nav.test.ts fails
 * when this file and the filesystem disagree, so a route added without
 * regenerating is caught in the suite rather than found by a person clicking.
 */

import { readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(here, '../app');
const OUT = resolve(here, '../lib/nav/routes.generated.ts');

/** Routes that render outside the shell and are never a rail destination. */
const EXCLUDED = new Set(['/login']);

export function staticRoutes(appDir = APP_DIR) {
  const urls = [];

  const walk = (dir, segments) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('(') || entry.name.startsWith('_')) {
        walk(join(dir, entry.name), segments);
        continue;
      }
      // A dynamic segment, and everything under it, needs a value the rail
      // does not have.
      if (entry.name.startsWith('[')) continue;
      walk(join(dir, entry.name), [...segments, entry.name]);
    }
    if (existsSync(join(dir, 'page.tsx'))) {
      urls.push('/' + segments.join('/'));
    }
  };

  walk(appDir, []);
  return [...new Set(urls)].filter((u) => !EXCLUDED.has(u)).sort();
}

export function render(routes) {
  const lines = routes.map((r) => `  '${r}',`).join('\n');
  return `/**
 * GENERATED FROM apps/console/app — DO NOT EDIT.
 *
 * Regenerate with:  npm run generate  (in apps/console)
 *
 * Every static page route the console serves. The rail is the persona manifest
 * joined with this list, so a screen appears in navigation the moment its
 * page.tsx exists and not before. tests/unit/nav.test.ts fails if this file and
 * the filesystem disagree.
 */

export const ROUTES: readonly string[] = [
${lines}
] as const;
`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const next = render(staticRoutes());
  const prev = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
  if (prev === next) {
    console.log(`routes.generated.ts is current (${staticRoutes().length} routes)`);
  } else {
    writeFileSync(OUT, next);
    console.log(`wrote ${OUT} (${staticRoutes().length} routes)`);
  }
}
