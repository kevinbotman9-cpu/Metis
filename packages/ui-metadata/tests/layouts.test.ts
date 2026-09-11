import { describe, it, expect } from 'vitest';
import { ROUTES } from '../../../apps/console/lib/nav/routes.generated';
import { LAYOUTS, PANELS, validateLayout, type ListDetailManifest } from '../src/layouts';
import { REGISTRY, PENDING } from '../src/registry';

/**
 * The layout registry, checked the way the descriptors are. ADR-015 §5.2.
 *
 * Types hold a manifest's shape. What they cannot hold is whether its
 * references land: a route that exists, a panel that exists and may sit in the
 * slot it was put in, an entity with a descriptor, and columns and facets that
 * are fields of that entity. A manifest that fails one of these renders a
 * screen with a hole in it, and nothing else would say so.
 */

const manifests = Object.entries(LAYOUTS);

describe('every layout manifest', () => {
  it('exists — a floor, so the checks below cannot pass over nothing', () => {
    expect(manifests.length).toBeGreaterThanOrEqual(1);
  });

  it('is registered under its own id', () => {
    for (const [key, m] of manifests) expect(m.id, `LAYOUTS['${key}']`).toBe(key);
  });

  it('names a route the console serves, and no route twice', () => {
    const routes = manifests.map(([, m]) => m.route);
    for (const route of routes) expect(ROUTES, `manifest route ${route}`).toContain(route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  describe.each(manifests)('%s', (_id, manifest) => {
    it('validates against its pattern, its panels and its entity', () => {
      expect(validateLayout(manifest)).toEqual([]);
    });
  });
});

/**
 * The validator, seen to refuse. Each case breaks one reference in a real
 * manifest and expects the sentence that names it (CLAUDE.md, Rule 9).
 */
describe('validateLayout refuses', () => {
  const base = LAYOUTS.placements as ListDetailManifest;
  const registry = { descriptors: REGISTRY, pending: PENDING };
  const variant = (change: (m: ListDetailManifest) => ListDetailManifest) =>
    validateLayout(change(structuredClone(base) as ListDetailManifest), registry);

  it('a panel nobody declared', () => {
    expect(
      variant((m) => ({ ...m, slots: { ...m.slots, 'detail.tabs': [{ id: 'x', panel: 'core.nothing', label: 'X' }] } }))
    ).toContain(`layout 'placements': 'x' names panel 'core.nothing', which PANELS does not declare`);
  });

  it('a panel in a slot it cannot fill', () => {
    expect(
      variant((m) => ({
        ...m,
        slots: { ...m.slots, 'detail.tabs': [{ id: 'x', panel: 'placements.undeliverable', label: 'X' }] },
      })).join('\n')
    ).toMatch(/panel 'placements\.undeliverable' cannot fill list-detail\.detail\.tabs/);
  });

  it('a panel on an entity it does not understand', () => {
    expect(
      variant((m) => ({ ...m, params: { ...m.params, detail: { ...m.params.detail, entity: 'Offer' } } })).join('\n')
    ).toMatch(/panel 'placements\.undeliverable' understands Placement, not Offer/);
  });

  it('a slot the pattern does not declare', () => {
    expect(
      variant((m) => ({ ...m, slots: { ...m.slots, 'page.banner': [] } as ListDetailManifest['slots'] }))
    ).toContain(`layout 'placements': 'page.banner' is not a slot of list-detail`);
  });

  it('the same occupant id twice', () => {
    expect(
      variant((m) => ({
        ...m,
        slots: {
          ...m.slots,
          'detail.tabs': [
            { id: 'overview', panel: 'core.entity-overview', label: 'A' },
            { id: 'overview', panel: 'core.entity-overview', label: 'B' },
          ],
        },
      }))
    ).toContain(`layout 'placements': occupant id 'overview' is used twice`);
  });

  it('a tab with no name', () => {
    expect(
      variant((m) => ({ ...m, slots: { ...m.slots, 'detail.tabs': [{ id: 'overview', panel: 'core.entity-overview' }] } }))
    ).toContain(`layout 'placements': 'overview' is in detail.tabs, which names its occupants, and has no label`);
  });

  it('an entity with no descriptor that is not admitted as pending', () => {
    expect(
      variant((m) => ({ ...m, slots: { 'detail.tabs': m.slots['detail.tabs'] }, params: { ...m.params, detail: { ...m.params.detail, entity: 'Widget' } } }))
    ).toContain(`layout 'placements': detail entity 'Widget' has no descriptor and is not PENDING`);
  });

  it('an unlabelled column the descriptor does not have', () => {
    expect(
      variant((m) => ({ ...m, params: { ...m.params, list: { ...m.params.list, columns: ['colour'] } } }))
    ).toContain(`layout 'placements': column 'colour' has no label and Placement's descriptor has no such field`);
  });

  it('a facet with nothing closed to count', () => {
    expect(
      variant((m) => ({ ...m, params: { ...m.params, list: { ...m.params.list, facets: ['name'] } } }))
    ).toContain(`layout 'placements': facet 'name' is not a Placement field with a closed set of values to count`);
  });

  it('a footer field the record does not carry', () => {
    expect(
      variant((m) => ({
        ...m,
        params: { ...m.params, detail: { ...m.params.detail, footer: { version: 'version' } } },
      }))
    ).toContain(`layout 'placements': detail.footer.version names 'version', which Placement does not have`);
  });

  it('a format this renderer does not read', () => {
    expect(
      variant((m) => ({ ...m, formatVersion: 2 as unknown as 1 }))
    ).toContain(`layout 'placements' is format 2; this renderer reads 1`);
  });
});

/** A panel's parameters are references too, and are held to the same standard. */
describe('validateLayout refuses a panel parameter', () => {
  const base = LAYOUTS.objectives as ListDetailManifest;
  const registry = { descriptors: REGISTRY, pending: PENDING };
  const categories = (change: (params: Record<string, unknown>) => Record<string, unknown>) => {
    const m = structuredClone(base) as ListDetailManifest;
    const tabs = m.slots['detail.tabs'].map((o) =>
      o.id === 'categories' ? { ...o, params: change({ ...(o.params ?? {}) }) } : o
    );
    return validateLayout({ ...m, slots: { ...m.slots, 'detail.tabs': tabs } }, registry);
  };
  const at = `layout 'objectives': 'categories'`;

  it('that is required and missing', () => {
    expect(categories(({ by: _, ...rest }) => rest)).toContain(`${at} needs 'by' (field)`);
  });

  it('that the panel does not take', () => {
    expect(categories((p) => ({ ...p, colour: 'teal' }))).toContain(`${at} passes 'colour', which its panel does not take`);
  });

  it('naming a field the child entity does not have', () => {
    expect(categories((p) => ({ ...p, by: 'offerId' }))).toContain(
      `${at}: 'by' names 'offerId', which is not a field of Category`
    );
  });

  it('naming an entity with no descriptor', () => {
    expect(categories((p) => ({ ...p, entity: 'Widget' }))).toContain(`${at}: 'entity' names 'Widget', which has no descriptor`);
  });

  it('with an unlabelled column the child does not have', () => {
    expect(categories((p) => ({ ...p, columns: ['offerCount'] }))).toContain(
      `${at}: 'columns' has column 'offerCount', unlabelled and not a field of Category`
    );
  });

  it('with a link that is not a path', () => {
    expect(categories((p) => ({ ...p, link: { label: 'Offers', href: 'offers' } }))).toContain(
      `${at}: 'link' must be { label, href } with a path`
    );
  });
});

describe('the panel declarations', () => {
  it('each fill at least one slot of a pattern that exists', () => {
    for (const [id, panel] of Object.entries(PANELS)) {
      expect(panel.slots.length, id).toBeGreaterThan(0);
      for (const slot of panel.slots) expect(slot, id).toMatch(/^list-detail\./);
    }
  });
});
