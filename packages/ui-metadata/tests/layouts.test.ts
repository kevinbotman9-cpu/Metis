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

describe('the panel declarations', () => {
  it('each fill at least one slot of a pattern that exists', () => {
    for (const [id, panel] of Object.entries(PANELS)) {
      expect(panel.slots.length, id).toBeGreaterThan(0);
      for (const slot of panel.slots) expect(slot, id).toMatch(/^list-detail\./);
    }
  });
});
