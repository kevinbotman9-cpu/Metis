import { apiClient, type PlacementDto } from '@/lib/api-client';

/**
 * Where a manifest's names meet the generated client. ADR-015 §2.
 *
 * A manifest says `source: 'placements'` and never how to get them, so it stays
 * data and can never call `fetch`. This file is the other half: the only place a
 * layout's vocabulary meets a query, as `useOptionSources` is for descriptors.
 *
 * Keyed by data, not by screen. A second screen over the same records adds
 * nothing here; a screen over records nothing reads yet adds one entry.
 */

export type Row = Record<string, unknown>;

export interface ListSource {
  /** Shared with every other reader of the same records, so one write invalidates all of them. */
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  /** The rows, out of whatever the operation answers. */
  select: (data: unknown) => Row[];
}

export const LIST_SOURCES: Record<string, ListSource> = {
  placements: {
    queryKey: ['placements'],
    queryFn: () => apiClient.listPlacements(),
    select: (data) => (data as { placements: PlacementDto[] }).placements as unknown as Row[],
  },
};

/**
 * How each entity a screen shows is identified and written.
 *
 * A write is the one thing that genuinely differs per entity — the generated
 * client's method names are not derivable from a schema name, and inventing a
 * convention to make them look derivable would be a hand-rolled client by
 * another route (the same reason `EntityFormDialog` takes `save` as a prop).
 */
export interface EntityBinding {
  /** What the URL carries and the update operation takes. */
  identity: (row: Row) => string;
  /** Required to create or edit. Viewing is the route's permission, in `lib/nav`. */
  permission: string;
  /** Field values a new record starts with, given the records beside it. */
  defaults?: (siblings: readonly Row[]) => Record<string, unknown>;
  save: (body: Record<string, unknown>, existing: Row | null) => Promise<Row>;
  /** Query keys a write changes. */
  invalidate: readonly (readonly unknown[])[];
}

export const ENTITY_BINDINGS: Record<string, EntityBinding> = {
  Placement: {
    identity: (row) => String(row.key),
    permission: 'edit:integrations',
    // A new slot decides. Without this the form's boolean select opens on its
    // false option and a placement created by clicking arrives refusing every
    // request — a default nobody chose, and the opposite of what "configure a
    // slot" means.
    //
    // `delivery` is deliberately not defaulted: nothing delivers a new slot
    // until somebody says what does, and that *is* the honest starting state.
    defaults: () => ({ decidable: true, slotCount: 1 }),
    save: async (body, existing) =>
      (existing
        ? await apiClient.updatePlacement(String(existing.key), body as Partial<PlacementDto>)
        : await apiClient.createPlacement(body as Partial<PlacementDto>)) as unknown as Row,
    // The coverage screen's denominator is the set of channels with a delivery
    // mode, so changing one here changes what that screen measures.
    invalidate: [['placements'], ['creatives'], ['offers']],
  },
};

export function bindingFor(entity: string): EntityBinding {
  const found = ENTITY_BINDINGS[entity];
  if (!found) {
    throw new Error(
      `No binding for '${entity}' in apps/console/lib/layouts/sources.ts: a screen shows it, and nothing says how it is identified or written.`
    );
  }
  return found;
}

export function sourceFor(name: string): ListSource {
  const found = LIST_SOURCES[name];
  if (!found) {
    throw new Error(
      `No source '${name}' in apps/console/lib/layouts/sources.ts. A manifest names its data; this file resolves the name.`
    );
  }
  return found;
}
