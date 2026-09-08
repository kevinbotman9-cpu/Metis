import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildNav, activeGroup, firstHref } from '@/lib/nav/build-nav';
import { PERSONA_MANIFEST, type GroupNode } from '@/lib/nav/persona-manifest';
import { ROUTES } from '@/lib/nav/routes.generated';
import { users } from '@/mocks/fixtures/catalogue';

/**
 * The rail is a join, and the join has rules. Each rule below has the test
 * that goes red when it is broken, and the generated route list has the test
 * that goes red when it rots.
 */

const account = (email: string) => {
  const u = users.find((x) => x.email === email);
  if (!u) throw new Error(`no fixture account ${email}`);
  return { roles: u.roles, permissions: u.permissions };
};

const labels = (nav: ReturnType<typeof buildNav>) => nav.map((g) => g.label);
const hrefs = (nav: ReturnType<typeof buildNav>) =>
  nav.flatMap((g) =>
    g.children.flatMap((s) => [s.href, ...s.children.flatMap((c) => [c.href, ...c.children.map((gc) => gc.href)])])
  ).filter((h): h is string => Boolean(h));

/** A manifest small enough to reason about, for the rule tests. */
const tiny: GroupNode[] = [
  { label: 'Overview', icon: 'overview', personas: 'all', children: [{ label: 'Home', href: '/' }] },
  {
    label: 'Catalogue',
    icon: 'catalogue',
    personas: ['marketer'],
    children: [
      { label: 'Offers', href: '/offers', permission: 'view:offers' },
      { label: 'Creatives', href: '/creatives' },
      { label: 'Planned', href: '/planned' },
    ],
  },
  {
    label: 'Decisioning',
    icon: 'decisioning',
    personas: ['architect'],
    children: [
      {
        label: 'Decision flows',
        href: '/decision-flows',
        children: [{ label: 'Flow versions', href: '/decision-flows/versions' }],
      },
      { label: 'Heading only', children: [{ label: 'Absent', href: '/absent' }] },
    ],
  },
  { label: 'Operations', icon: 'operations', personas: ['operator'], children: [{ label: 'Health', href: '/ops' }] },
];
const tinyRoutes = ['/', '/offers', '/creatives', '/decision-flows', '/decision-flows/versions', '/ops'];

describe('buildNav', () => {
  it('a persona sees every screen in its group that has no permission', () => {
    const nav = buildNav(tiny, tinyRoutes, { roles: ['marketer'], permissions: ['view:offers'] });
    const catalogue = nav.find((g) => g.label === 'Catalogue');
    expect(catalogue?.children.map((s) => s.label)).toEqual(['Offers', 'Creatives']);
  });

  it('a group admitted by permission alone shows only the permitted screens', () => {
    const nav = buildNav(tiny, tinyRoutes, { roles: ['compliance'], permissions: ['view:offers'] });
    const catalogue = nav.find((g) => g.label === 'Catalogue');
    expect(catalogue?.children.map((s) => s.label)).toEqual(['Offers']);
  });

  it('admin passes every persona gate but not a screen permission', () => {
    const nav = buildNav(tiny, tinyRoutes, { roles: ['admin'], permissions: [] });
    expect(labels(nav)).toContain('Operations');
    expect(hrefs(nav)).not.toContain('/offers');
    expect(hrefs(nav)).toContain('/creatives');
  });

  it('drops a screen whose route does not exist', () => {
    const nav = buildNav(tiny, tinyRoutes, { roles: ['marketer'], permissions: ['view:offers'] });
    expect(hrefs(nav)).toContain('/offers');
    expect(hrefs(nav)).not.toContain('/planned');
  });

  it('drops a screen the user has no permission for, keeping the rest of its group', () => {
    const nav = buildNav(tiny, tinyRoutes, { roles: ['marketer'], permissions: [] });
    expect(hrefs(nav)).not.toContain('/offers');
    expect(hrefs(nav)).toContain('/creatives');
  });

  it('drops a heading with nothing under it', () => {
    const nav = buildNav(tiny, tinyRoutes, { roles: ['architect'], permissions: [] });
    const decisioning = nav.find((g) => g.label === 'Decisioning');
    expect(decisioning?.children.map((s) => s.label)).toEqual(['Decision flows']);
  });

  it('keeps a third level under a section that is itself a screen', () => {
    const nav = buildNav(tiny, tinyRoutes, { roles: ['architect'], permissions: [] });
    expect(hrefs(nav)).toContain('/decision-flows/versions');
  });

  it('hides a group the persona does not hold', () => {
    const nav = buildNav(tiny, tinyRoutes, { roles: ['marketer'], permissions: ['view:offers'] });
    expect(labels(nav)).toEqual(['Overview', 'Catalogue']);
    expect(labels(nav)).not.toContain('Operations');
  });

  it('shows a group to a user who holds a permission inside it, whatever their persona', () => {
    const nav = buildNav(tiny, tinyRoutes, { roles: ['compliance'], permissions: ['view:offers'] });
    expect(labels(nav)).toContain('Catalogue');
  });

  it('hides a group whose screens all lack routes, even for its own persona', () => {
    const nav = buildNav(tiny, ['/'], { roles: ['operator'], permissions: [] });
    expect(labels(nav)).toEqual(['Overview']);
  });

  it('is empty for nobody: every signed-in user has Overview', () => {
    const nav = buildNav(tiny, tinyRoutes, { roles: [], permissions: [] });
    expect(labels(nav)).toEqual(['Overview']);
  });
});

describe('activeGroup', () => {
  const nav = buildNav(tiny, tinyRoutes, { roles: ['architect', 'marketer'], permissions: ['view:offers'] });

  it('matches the deepest screen, not the first prefix', () => {
    expect(activeGroup(nav, '/decision-flows/versions')).toBe('Decisioning');
  });

  it('treats / as exact so Home does not claim every page', () => {
    expect(activeGroup(nav, '/')).toBe('Overview');
    expect(activeGroup(nav, '/offers')).toBe('Catalogue');
  });

  it('is null off the map', () => {
    expect(activeGroup(nav, '/nowhere')).toBeNull();
  });

  it('firstHref lands on a real destination', () => {
    for (const g of nav) expect(tinyRoutes).toContain(firstHref(g));
  });
});

describe('the real manifest against the real routes', () => {
  it('every fixture account can reach Home', () => {
    for (const u of users) {
      expect(hrefs(buildNav(PERSONA_MANIFEST, ROUTES, account(u.email)))).toContain('/');
    }
  });

  it('every href in a built rail is a route that exists', () => {
    for (const u of users) {
      for (const h of hrefs(buildNav(PERSONA_MANIFEST, ROUTES, account(u.email)))) {
        expect(ROUTES).toContain(h);
      }
    }
  });

  it('the administrator reaches every route the rail can express', () => {
    // Every route with a manifest entry appears for Marcus. A route that is
    // in the app and in the manifest but reachable by nobody is a hole.
    const reach = new Set(hrefs(buildNav(PERSONA_MANIFEST, ROUTES, account('marcus.webb@telco.example'))));
    const declared = new Set(
      PERSONA_MANIFEST.flatMap((g) =>
        g.children.flatMap((s) => [
          s.href,
          ...(s.children ?? []).flatMap((c) => [c.href, ...(c.children ?? []).map((x) => x.href)]),
        ])
      ).filter((h): h is string => Boolean(h))
    );
    const missing = ROUTES.filter((r) => declared.has(r) && !reach.has(r));
    expect(missing, 'routes the admin cannot reach from the rail').toEqual([]);
  });

  it('every existing route has a manifest entry', () => {
    // A page.tsx with no place in the tree is unreachable from navigation —
    // the exact defect the manifest exists to make impossible.
    const declared = new Set(
      PERSONA_MANIFEST.flatMap((g) =>
        g.children.flatMap((s) => [
          s.href,
          ...(s.children ?? []).flatMap((c) => [c.href, ...(c.children ?? []).map((x) => x.href)]),
        ])
      )
    );
    expect(ROUTES.filter((r) => !declared.has(r)), 'routes with no manifest entry').toEqual([]);
  });

  it('the compliance officer is hidden from Policy, not disabled, and sees Evidence', () => {
    // Priya is compliance only. Policy is tagged marketer/architect and its
    // screens carry no permission, so nothing lets her in. Decisioning is also
    // tagged architect, but she holds view:flows — the permission on Decision
    // flows — and a granted permission outranks a persona tag.
    const nav = buildNav(PERSONA_MANIFEST, ROUTES, account('priya.natarajan@telco.example'));
    expect(labels(nav)).not.toContain('Policy');
    expect(labels(nav)).toContain('Evidence');
    const decisioning = nav.find((g) => g.label === 'Decisioning');
    expect(decisioning?.children.map((s) => s.label)).toEqual(['Decision flows']);
  });
});

describe('routes.generated.ts', () => {
  it('matches the filesystem', () => {
    // Same walk as scripts/generate-routes.mjs. If this fails, run
    // `npm run generate` in apps/console and commit the result.
    const appDir = resolve(__dirname, '../../app');
    const found: string[] = [];
    const walk = (dir: string, segments: string[]) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('(') || entry.name.startsWith('_')) {
          walk(join(dir, entry.name), segments);
          continue;
        }
        if (entry.name.startsWith('[')) continue;
        walk(join(dir, entry.name), [...segments, entry.name]);
      }
      if (existsSync(join(dir, 'page.tsx'))) found.push('/' + segments.join('/'));
    };
    walk(appDir, []);
    const expected = [...new Set(found)].filter((u) => u !== '/login').sort();
    expect([...ROUTES]).toEqual(expected);
  });
});
