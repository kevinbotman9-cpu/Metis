import { describe, it, expect } from 'vitest';
import { LAYOUTS, PANELS } from '@metis/ui-metadata';
import { categories, objectives, offers } from '@/mocks/fixtures/catalogue';
import { ENTITY_BINDINGS, LIST_SOURCES } from '@/lib/layouts/sources';
import { PANEL_COMPONENTS } from '@/components/layouts/panels';

/**
 * The host's half of every manifest: a name a manifest uses must resolve here.
 *
 * `layouts.test.ts` in ui-metadata checks what a manifest refers to inside the
 * package — descriptors, panels, fields. It cannot see the console, which is
 * where a source name becomes a query and an entity gets a way to be written.
 * A manifest naming a source this file has never heard of throws at render;
 * this makes it a failing test first.
 */

const manifests = Object.values(LAYOUTS);

/** Every source and entity a manifest names, including inside its panels' parameters. */
function named(m: (typeof manifests)[number]) {
  const sources = new Set([m.params.list.source]);
  const entities = new Set([m.params.detail.entity]);
  for (const occupants of Object.values(m.slots)) {
    for (const o of occupants ?? []) {
      const declared = (PANELS as Record<string, { params?: Record<string, string> }>)[o.panel]?.params ?? {};
      for (const [name, kind] of Object.entries(declared)) {
        const value = o.params?.[name];
        if (typeof value !== 'string') continue;
        if (kind.startsWith('source')) sources.add(value);
        if (kind.startsWith('entity')) entities.add(value);
      }
    }
  }
  return { sources, entities };
}

describe.each(manifests.map((m) => [m.id, m] as const))('manifest %s', (_id, manifest) => {
  it('names only sources the host resolves', () => {
    for (const source of named(manifest).sources) expect(Object.keys(LIST_SOURCES), `source '${source}'`).toContain(source);
  });

  it('shows only entities the host knows how to identify and write', () => {
    for (const entity of named(manifest).entities) expect(Object.keys(ENTITY_BINDINGS), `entity '${entity}'`).toContain(entity);
  });

  it('places only panels with a component', () => {
    for (const occupants of Object.values(manifest.slots)) {
      for (const o of occupants ?? []) expect(Object.keys(PANEL_COMPONENTS), `panel '${o.panel}'`).toContain(o.panel);
    }
  });
});

describe('the taxonomy sources count what is filed under each level', () => {
  const taxonomy = { objectives, categories, offers };

  it('counts an objective’s categories, and the offers under those categories', () => {
    const rows = LIST_SOURCES['taxonomy.objectives'].select(taxonomy);
    const counts = Object.fromEntries(rows.map((r) => [r.id, [r.categoryCount, r.offerCount]]));
    // One category and two offers under each objective. The tenant this was
    // written for had four objectives, seven categories and 251 offers, 240 of
    // them generated; this one has exactly what the customer's brief names.
    expect(counts).toEqual({
      iss_acquisition: [1, 2],
      iss_crosssell: [1, 3],
    });
  });

  it('counts the offers under each category', () => {
    const rows = LIST_SOURCES['taxonomy.categories'].select(taxonomy);
    const counts = Object.fromEntries(rows.map((r) => [r.id, r.offerCount]));
    expect(counts).toEqual({ grp_broadband: 2, grp_entertainment: 3 });
  });

  it('keys an objective by id and a placement by key, which is what their update operations take', () => {
    expect(ENTITY_BINDINGS.Objective.identity({ id: 'iss_crosssell', key: 'cross-sell' })).toBe('iss_crosssell');
    expect(ENTITY_BINDINGS.Placement.identity({ id: 'plc_app_inbox', key: 'app_inbox' })).toBe('app_inbox');
  });

  it('starts a new objective or category after the ones beside it, never at zero', () => {
    const three = [{}, {}, {}];
    expect(ENTITY_BINDINGS.Objective.defaults?.(three)).toEqual({ sortOrder: 4 });
    expect(ENTITY_BINDINGS.Category.defaults?.([])).toEqual({ sortOrder: 1 });
  });
});
