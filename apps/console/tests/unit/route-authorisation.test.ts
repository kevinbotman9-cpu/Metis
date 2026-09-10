import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PERSONA_MANIFEST } from '@/lib/nav/persona-manifest';
import { ROUTES } from '@/lib/nav/routes.generated';
import { requirementFor, DECLARED_ROUTE_PERMISSIONS } from '@/lib/nav/route-permissions';
import { buildNav } from '@/lib/nav/build-nav';
import { users } from '@/mocks/fixtures/catalogue';

/**
 * The check that would have caught it.
 *
 * From the console's first commit until 2026-09-10, `permission` in the
 * navigation manifest gated one thing: whether a link was drawn. `RequireAuth`
 * looked for a session and nothing else. Five routes had hand-written a guard;
 * sixteen had not. Three of those sixteen — `/decisions`, `/decision-flows`
 * and `/performance` — *declared* a permission that nothing enforced, so the
 * rail hid the link and the address bar did not.
 *
 * Nothing was red. Every test asserted what a permitted user could see and no
 * test asserted what a refused one could not, which is how an authorisation
 * model comes to live in a navigation menu.
 *
 * These are the properties that make that unrepeatable, in the order they
 * carry weight:
 *
 * 1. **No route can opt out.** Enforcement is derived from the manifest and
 *    applied in `RequireAuth`, so it is not something a page remembers to do.
 *    That holds only while every page goes through `RequireAuth`, which is
 *    what the first test reads the source of every `page.tsx` to establish.
 * 2. **The two directions agree.** A permission declared in the rail is
 *    enforced on the route, and a permission enforced on a route is declared
 *    in the rail. The second half is the same defect wearing a different hat:
 *    `/placements` enforced `view:flows` while the manifest said nothing, so
 *    the rail offered the link to people the page would then refuse.
 * 3. **A detail page is not weaker than its list.** `/decisions/dec_a1b2` has
 *    no entry of its own and is more sensitive than the list linking to it.
 */

const APP = resolve(__dirname, '../../app');

/** Every `page.tsx` the console serves, as [route, source]. */
function pages(): [string, string][] {
  const found: [string, string][] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('(') || entry.name.startsWith('_')) {
        walk(join(dir, entry.name), segments);
        continue;
      }
      walk(join(dir, entry.name), [...segments, entry.name]);
    }
    const file = join(dir, 'page.tsx');
    if (existsSync(file)) found.push(['/' + segments.join('/'), readFileSync(file, 'utf8')]);
  };
  walk(APP, []);
  return found;
}

const account = (email: string) => {
  const u = users.find((x) => x.email === email);
  if (!u) throw new Error(`no fixture account ${email}`);
  return { roles: u.roles, permissions: u.permissions };
};

describe('every route is behind the permission its nav entry declares', () => {
  it('wraps RequireAuth, without exception', () => {
    // The load-bearing assertion. A page that renders outside RequireAuth
    // enforces nothing at all, and is one import away at any time.
    //
    // `/login` is the exception and the only one: it is where an unauthorised
    // visitor is sent, so wrapping it in the thing that redirects there would
    // be a loop.
    const escaped = pages()
      .filter(([route]) => route !== '/login')
      .filter(([, src]) => !/<RequireAuth[\s>]/.test(src))
      .map(([route]) => route);

    expect(escaped, 'these routes render outside RequireAuth and enforce nothing').toEqual([]);
  });

  it('applies the requirement in RequireAuth, not merely computes it', () => {
    // Without this, every assertion in this file passes while nothing is
    // enforced. `requirementFor` is a pure function over the manifest: it
    // returns the right answer whether or not anybody asks it. Deleting the
    // four lines in `RequireAuth` that call it and render the refusal would
    // reopen all twenty-one routes and leave this suite entirely green.
    //
    // A source assertion rather than a rendered one because these tests run in
    // node with no DOM. The end-to-end proof is
    // `tests/e2e/route-authorisation.spec.ts`, which signs in as an account
    // that holds one permission and walks into the screens it does not.
    const src = readFileSync(resolve(__dirname, '../../components/require-auth.tsx'), 'utf8');
    expect(src, 'RequireAuth does not consult the manifest').toMatch(/requirementFor\(/);
    expect(src, 'RequireAuth computes a requirement and renders no refusal').toMatch(
      /<PermissionDenied/
    );
    expect(src, 'RequireAuth checks a permission it never reads off the user').toMatch(
      /hasPermission\(/
    );
  });

  it('enforces on the route exactly what the rail declares for it', () => {
    // The check asked for, in the direction the defect ran. For every route
    // that exists, whatever the manifest says about it is what `RequireAuth`
    // will apply — there is no third place where the two could disagree.
    const declared = new Map(DECLARED_ROUTE_PERMISSIONS.map((e) => [e.href, e.permission]));

    const mismatched = ROUTES.filter((route) => {
      const enforced = requirementFor(route)?.permission ?? null;
      const fromRail = declared.get(route) ?? null;
      // A route with no entry of its own may still inherit from a parent —
      // `/data-model/intake` under `/data-model`, were that gated — so an
      // inherited requirement is not a mismatch. Only a route the rail gates
      // and the guard does not, or the reverse, is.
      if (fromRail === null) return enforced !== null && !inherits(route, enforced);
      return enforced !== fromRail;
    });

    expect(mismatched, 'the rail and the route disagree about these').toEqual([]);
  });

  it('never enforces a permission the rail does not declare', () => {
    // The mirror image, and the same bug: a link drawn to a screen that will
    // refuse whoever follows it. A page is free to render `PermissionDenied`,
    // but only for the permission its own manifest entry names — a page-level
    // guard stricter than the declaration is how `/placements` came to be
    // offered to everyone and refused to some of them.
    const offenders: string[] = [];
    for (const [route, src] of pages()) {
      const declaredForRoute = requirementFor(route)?.permission ?? null;
      for (const m of src.matchAll(/<PermissionDenied\s+permission="([^"]+)"/g)) {
        if (m[1] !== declaredForRoute) offenders.push(`${route} enforces ${m[1]}, rail says ${declaredForRoute}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives a detail page the permission of the list it hangs off', () => {
    // Exact-match lookup would have left every trace, every offer detail and
    // every change set open while the list above them was shut.
    expect(requirementFor('/decisions/dec_a1b2')?.permission).toBe('view:decisions');
    expect(requirementFor('/offers/prop_5g_unlimited_24')?.permission).toBe('view:offers');
    expect(requirementFor('/decision-flows/next-best-action')?.permission).toBe('view:flows');

    // And `/` claims only itself. A root entry matched by prefix would gate the
    // whole console on whatever Home happened to require.
    expect(requirementFor('/anything-at-all')).toBeNull();
  });

  it('offers no signed-in account a link it will then refuse', () => {
    // Read from the fixture accounts rather than constructed ones: this is a
    // statement about the three — now four — people who can actually sign in.
    for (const u of users) {
      const nav = buildNav(PERSONA_MANIFEST, ROUTES, account(u.email));
      const linked: string[] = [];
      for (const g of nav) {
        for (const s of g.children) {
          if (s.href) linked.push(s.href);
          for (const c of s.children) {
            linked.push(c.href);
            for (const gc of c.children) linked.push(gc.href);
          }
        }
      }
      const walls = linked.filter((href) => {
        const req = requirementFor(href);
        return req !== null && !u.permissions.includes(req.permission);
      });
      expect(walls, `${u.email} is offered links to screens that refuse them`).toEqual([]);
    }
  });

  it('has an account refused each gated permission, one by one', () => {
    // Not "somebody is refused something" — that is satisfied by one narrow
    // account and leaves every other gate unexercised. Each permission needs a
    // signed-in account that lacks it, or the gate on it can never be shown to
    // work.
    //
    // This is the other half of how thirteen unguarded routes stayed green.
    // Sarah, Priya and Marcus held `view:offers`, `view:flows`,
    // `view:decisions` and `view:audit` between them with no gaps, so a test
    // that signed in and found a screen open could not distinguish an enforced
    // permission from an unenforced one. It caught its own author too: Oliver
    // was created holding `view:decisions`, which all four accounts had, and
    // this assertion is why he does not.
    const gated = [...new Set(DECLARED_ROUTE_PERMISSIONS.map((e) => e.permission))].sort();
    const unexercised = gated.filter((p) => users.every((u) => u.permissions.includes(p)));

    expect(
      unexercised,
      'every fixture account holds these, so no test can prove the gate refuses anyone'
    ).toEqual([]);

    // And the converse, or a permission nobody holds would pass the above by
    // being refused to everyone and reachable by no one.
    const unreachable = gated.filter((p) => users.every((u) => !u.permissions.includes(p)));
    expect(unreachable, 'no fixture account holds these, so the screen is dead').toEqual([]);
  });

  it('still enforces what the four hand-written guards used to', () => {
    // Regression guard for this change. Four pages wrote their own `Guarded()`
    // and it was deleted in favour of the central check; if the manifest entry
    // that replaced it were removed, they would go open rather than go red.
    expect(requirementFor('/offers')?.permission).toBe('view:offers');
    expect(requirementFor('/objectives')?.permission).toBe('view:offers');
    expect(requirementFor('/creatives')?.permission).toBe('view:offers');
    expect(requirementFor('/audit')?.permission).toBe('view:audit');
  });
});

/** Whether `route` picked up `permission` from an ancestor rather than its own entry. */
function inherits(route: string, permission: string): boolean {
  return DECLARED_ROUTE_PERMISSIONS.some(
    (e) => e.permission === permission && e.href !== route && route.startsWith(`${e.href}/`)
  );
}
