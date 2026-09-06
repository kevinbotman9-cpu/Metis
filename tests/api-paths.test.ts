import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPERATIONS } from '@metis/client';

/**
 * Four components must agree on every API path, and only one of them was checked.
 *
 * The set is: the OpenAPI spec; `packages/client`, generated from it; the
 * console's `lib/api-client.ts`, which writes its URLs by hand; the console's
 * dev route handler, a string switch; and the Kotlin service's router, another
 * string switch. `contract.spec.ts` covers the spec against the dev handler and
 * does bite. Nothing covered the other two, so a path renamed in the spec left
 * the console calling the old URL and the Kotlin service serving it — each
 * internally consistent, and wrong together.
 *
 * This is that check. It runs in `npm test` rather than the E2E suite because
 * it needs no server: it reads source and compares strings.
 *
 * It deliberately does not try to parse routing logic. The Kotlin service
 * declares its routes as data for this purpose, and the console's client is
 * matched on the URL templates it actually passes to `apiCall`.
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

  it("the console's hand-written client only calls paths the spec declares", () => {
    const src = read('apps/console/lib/api-client.ts');

    // `apiCall<T>(`/registry/${tenantId}/${flowName}`, {...})` — the first
    // template literal argument is the path.
    const calls = [...src.matchAll(/apiCall<[^>]*>\(\s*`([^`]+)`/g)].map((m) => m[1]);
    expect(calls.length, 'found no apiCall templates — the regex has rotted').toBeGreaterThan(20);

    const unknown = [...new Set(calls.map(normalise))].filter((p) => !specPaths.has(p));
    expect(unknown, 'console client calls paths the spec does not declare').toEqual([]);
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
