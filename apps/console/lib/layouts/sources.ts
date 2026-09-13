import {
  apiClient,
  type CategoryDto,
  type CreativeDto,
  type ObjectiveDto,
  type OfferDto,
  type PlacementDto,
  type TargetingPolicyDto,
  type TaxonomyDto,
} from '@/lib/api-client';

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

/**
 * A source scoped to the open record: what one offer is made of, read by the
 * operation that answers for one offer. The host resolves it for the record in
 * the detail pane, and again when the selection moves — never for every row,
 * which is the difference between one request and one per row.
 */
export interface RecordSource {
  scope: 'record';
  /** Keyed by the record, and shared with whatever else reads it, so one write refreshes both. */
  queryKey: (id: string) => readonly unknown[];
  queryFn: (id: string) => Promise<unknown>;
  select: (data: unknown) => Row[];
}

export type Source = ListSource | RecordSource;

export const isRecordSource = (source: Source): source is RecordSource =>
  'scope' in source && source.scope === 'record';

/** The taxonomy answers in one snapshot; both levels read it, and count what is filed under them. */
const offersUnder = (t: TaxonomyDto, categoryIds: ReadonlySet<string>) =>
  t.offers.filter((o) => categoryIds.has(o.categoryId)).length;

export const LIST_SOURCES: Record<string, Source> = {
  placements: {
    queryKey: ['placements'],
    queryFn: () => apiClient.listPlacements(),
    select: (data) => (data as { placements: PlacementDto[] }).placements as unknown as Row[],
  },
  // There is no listObjectives or listCategories: getTaxonomy returns both,
  // and the engine reads the taxonomy as one snapshot.
  'taxonomy.objectives': {
    queryKey: ['taxonomy'],
    queryFn: () => apiClient.getTaxonomy(),
    select: (data) => {
      const t = data as TaxonomyDto;
      return t.objectives.map((o) => {
        const own = new Set(t.categories.filter((c) => c.objectiveId === o.id).map((c) => c.id));
        return { ...o, categoryCount: own.size, offerCount: offersUnder(t, own) } as unknown as Row;
      });
    },
  },
  'taxonomy.categories': {
    queryKey: ['taxonomy'],
    queryFn: () => apiClient.getTaxonomy(),
    select: (data) => {
      const t = data as TaxonomyDto;
      return t.categories.map((c) => ({ ...c, offerCount: offersUnder(t, new Set([c.id])) }) as unknown as Row);
    },
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
/** The record a child is written under, when a screen writes one from inside another. */
export interface Parent {
  /** The screen's entity. */
  entity: string;
  /** Its identity, as the binding for that entity gives it. */
  id: string;
}

export type Invalidations = readonly (readonly unknown[])[];

export interface EntityBinding {
  /** What the URL carries and the update operation takes. */
  identity: (row: Row) => string;
  /** Required to create or edit. Viewing is the route's permission, in `lib/nav`. */
  permission: string;
  /** Field values a new record starts with, given the records beside it. */
  defaults?: (siblings: readonly Row[]) => Record<string, unknown>;
  /**
   * The write. Absent for an entity nobody writes through a form here: the
   * screen then offers no create and no edit, rather than a button that fails.
   *
   * `parent` is the open record when the write happens inside it. A creative is
   * created under an offer, and the operation's path names the offer — a fact
   * the form does not hold, because the click already answered it.
   */
  save?: (body: Record<string, unknown>, existing: Row | null, parent: Parent | null) => Promise<Row>;
  /**
   * The delete, for an entity whose descriptor says what deleting one costs.
   * Absent, and no screen offers one. A refusal comes back as the platform's own
   * sentence, which says what still depends on the record.
   */
  remove?: (existing: Row, parent: Parent | null) => Promise<void>;
  /** Query keys a write changes, given the parent when what changes is what one record is made of. */
  invalidate: Invalidations | ((parent: Parent | null) => Invalidations);
}

export const invalidationsFor = (binding: EntityBinding, parent: Parent | null): Invalidations =>
  typeof binding.invalidate === 'function' ? binding.invalidate(parent) : binding.invalidate;

/** Either level of the taxonomy going stale takes the offers with it: an offer is filed under both. */
const TAXONOMY_WRITES = [['taxonomy'], ['offers']] as const;

/**
 * Where a new record lands among its siblings.
 *
 * An empty number field sends `0` — `toPayload` reads `Number(raw || 0)` —
 * and `sortOrder: 0` puts a brand new objective above everything that existed,
 * which is not what "I left that box alone" means. The screen knows how many
 * there are, so the box arrives filled in, and the person can see the answer
 * and change it before saving.
 */
const nextSortOrder = (siblings: readonly Row[]) => ({ sortOrder: siblings.length + 1 });

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
    // Refused while a creative names the slot (G-110).
    remove: (existing) => apiClient.deletePlacement(String(existing.key)),
    // The coverage screen's denominator is the set of channels with a delivery
    // mode, so changing one here changes what that screen measures.
    invalidate: [['placements'], ['creatives'], ['offers']],
  },
  Offer: {
    identity: (row) => String(row.id),
    permission: 'edit:offers',
    save: async (body, existing) =>
      (existing
        ? await apiClient.updateOffer(String(existing.id), body as Partial<OfferDto>)
        : await apiClient.createOffer(body as Partial<OfferDto>)) as unknown as Row,
    invalidate: [['offers'], ['offer'], ['taxonomy']],
  },
  Creative: {
    identity: (row) => String(row.id),
    permission: 'edit:offers',
    // The offer is where a creative is authored from rather than a field of its
    // form, and the operations' paths name it: a new creative takes the open
    // offer, an existing one keeps its own.
    save: async (body, existing, parent) => {
      if (existing) {
        return (await apiClient.updateCreative(
          String(existing.offerId),
          String(existing.id),
          body as Partial<CreativeDto>
        )) as unknown as Row;
      }
      if (!parent) throw new Error('A creative is created under an offer, and this write was given none.');
      return (await apiClient.createCreative(parent.id, body as Partial<CreativeDto>)) as unknown as Row;
    },
    // Refused when it would leave an active offer nothing to deliver (G-110).
    remove: (existing) => apiClient.deleteCreative(String(existing.offerId), String(existing.id)),
    // What one offer is made of changes, so that offer's own query goes stale.
    invalidate: (parent) => [parent ? ['offer', parent.id] : ['offer'], ['offers'], ['creatives']],
  },
  TargetingPolicy: {
    identity: (row) => String(row.id),
    permission: 'edit:policies',
    // A tier has to be chosen for a policy to exist, and the first question —
    // can we offer this at all — is where the hand-built form started. A new
    // policy is also stored, not applied, until somebody says otherwise.
    defaults: () => ({ kind: 'eligibility', active: false }),
    save: async (body, existing) =>
      (existing
        ? await apiClient.updateTargetingPolicy({
            ...(existing as unknown as TargetingPolicyDto),
            ...(body as Partial<TargetingPolicyDto>),
          })
        : await apiClient.createTargetingPolicy({
            ...(body as Omit<TargetingPolicyDto, 'id' | 'createdAt' | 'updatedAt'>),
            // No screen scopes a policy yet, so a new one is tenant-wide, as
            // every policy authored here has been. The descriptor says why.
            scope: { level: 'tenant', targetId: null },
          })) as unknown as Row,
    // Refused while an offer is bound to the policy (G-110).
    remove: (existing) => apiClient.deleteTargetingPolicy(String(existing.id)),
    // The funnel counts what the policies remove, so it goes stale with them.
    invalidate: [['targeting-policies'], ['policy-funnel']],
  },
  Objective: {
    identity: (row) => String(row.id),
    permission: 'edit:offers',
    defaults: nextSortOrder,
    save: async (body, existing) =>
      (existing
        ? await apiClient.updateObjective(String(existing.id), body as Partial<ObjectiveDto>)
        : await apiClient.createObjective(body as Partial<ObjectiveDto>)) as unknown as Row,
    invalidate: TAXONOMY_WRITES,
  },
  Category: {
    identity: (row) => String(row.id),
    permission: 'edit:offers',
    defaults: nextSortOrder,
    save: async (body, existing) =>
      (existing
        ? await apiClient.updateCategory(String(existing.id), body as Partial<CategoryDto>)
        : await apiClient.createCategory(body as Partial<CategoryDto>)) as unknown as Row,
    invalidate: TAXONOMY_WRITES,
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

export function sourceFor(name: string): Source {
  const found = LIST_SOURCES[name];
  if (!found) {
    throw new Error(
      `No source '${name}' in apps/console/lib/layouts/sources.ts. A manifest names its data; this file resolves the name.`
    );
  }
  return found;
}
