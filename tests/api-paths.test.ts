import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERATIONS } from '@metis/client';

/**
 * Every component must agree on every API path, and only one of them was checked.
 *
 * The set is: the OpenAPI spec; `packages/client`, generated from it; the
 * console's `lib/api-client.ts`; the console's dev route handler, a string
 * switch; and the Kotlin service's router, another string switch.
 * `contract.spec.ts` covers the spec against the dev handler and does bite.
 * Nothing covered the other two, so a path renamed in the spec left the console
 * calling the old URL and the Kotlin service serving it — each internally
 * consistent, and wrong together.
 *
 * The console has since stopped writing paths at all: `api-client.ts` derives
 * both path and method from `OPERATIONS`. So the assertion about it inverted,
 * from "the hand-written paths match" to "there are no hand-written paths",
 * which is the stronger statement. The Kotlin service still writes its own, and
 * declares them as data here for that reason.
 *
 * This runs in `npm test` rather than the E2E suite because it needs no server:
 * it reads source and compares strings.
 */

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/** `${tenantId}` and `{tenantId}` are the same path. Compare one form. */
const normalise = (path: string) =>
  path
    .replace(/\$\{[^}]+\}/g, '{}')
    .replace(/\{[^}]+\}/g, '{}')
    .replace(/\/+$/, '');

/** The spec, reached through the generated client so the two cannot disagree. */
const specPaths = new Set(Object.values(OPERATIONS).map((o) => normalise(o.path)));

describe('every component agrees on the API surface', () => {
  it('the spec declares the operations the generated client exposes', () => {
    // A guard on the guard: if this is empty, every assertion below passes
    // vacuously and the whole file becomes decoration.
    expect(specPaths.size).toBeGreaterThan(20);
  });

  it('the console writes no API paths by hand', () => {
    const src = read('apps/console/lib/api-client.ts');

    // Stronger than the check this replaces. That one compared the console's
    // hand-written templates against the spec and passed while they existed;
    // `api-client.ts` now derives both path and method from OPERATIONS, so the
    // invariant is that no literal path remains to drift.
    const literals = [
      ...src.matchAll(/apiCall<[^>]*>\(\s*[`'"]\/[^`'"]*/g),
    ].map((m) => m[0].slice(-60));

    expect(
      literals,
      'A literal path here is a fifth place the URL is written. Pass an ' +
        'operation id instead — the path and method come from the spec.'
    ).toEqual([]);
  });

  it('every operation the console calls exists in the spec', () => {
    const src = read('apps/console/lib/api-client.ts');
    const called = [...src.matchAll(/apiCall<[\s\S]*?>\(\s*'([a-zA-Z][a-zA-Z0-9]*)'/g)].map(
      (m) => m[1]
    );
    expect(called.length, 'found no apiCall operation ids — the regex has rotted').toBeGreaterThan(
      20
    );

    const known = new Set(Object.keys(OPERATIONS));
    expect(
      [...new Set(called)].filter((id) => !known.has(id)),
      'console calls an operation the spec does not declare'
    ).toEqual([]);
  });

  it('the Kotlin service only serves paths the spec declares', () => {
    const src = read(
      'engines/kotlin/service/src/main/kotlin/com/metis/service/DecisionService.kt'
    );

    const block = src.match(/val ROUTES = listOf\(([\s\S]*?)\)/);
    expect(block, 'DecisionService.ROUTES not found — did the declaration move?').not.toBeNull();

    const routes = [...block![1].matchAll(/"([A-Z]+) ([^"]+)"/g)].map((m) => ({
      method: m[1],
      path: normalise(m[2]),
    }));
    expect(routes.length, 'ROUTES parsed empty').toBeGreaterThan(0);

    const declared = new Set(Object.values(OPERATIONS).map((o) => `${o.method} ${normalise(o.path)}`));
    const unknown = routes
      .map((r) => `${r.method} ${r.path}`)
      .filter((r) => !declared.has(r));
    expect(unknown, 'Kotlin service serves routes the spec does not declare').toEqual([]);
  });

  it('the Kotlin service still routes every path it declares', () => {
    // The declaration is only useful if it describes the router. Each declared
    // route must appear in the `when` that dispatches, so a route deleted from
    // the code but left in the list is caught.
    const src = read(
      'engines/kotlin/service/src/main/kotlin/com/metis/service/DecisionService.kt'
    );
    const routerBlock = src.slice(src.indexOf('private fun decisions('));

    for (const segment of ['trace', 'replay']) {
      expect(
        routerBlock.includes(`segments[1] == "${segment}"`),
        `ROUTES names ${segment} but the router does not dispatch it`
      ).toBe(true);
    }
  });
});
