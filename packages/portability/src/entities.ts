/**
 * What a tenant export contains, declared rather than implied.
 *
 * §9 requires a customer to be able to take everything out "without
 * professional-services intervention", and §14 makes provable exitability a
 * differentiator. The word doing the work is *provable*: an export that
 * silently omits a table is worse than no export, because it looks like an
 * exit route right up until someone tries to use it.
 *
 * So the set of entity types is a declaration, and `completeness.test.ts`
 * checks it against the tables the migrations actually create. Adding a table
 * without deciding what the export does with it fails that test. Deciding to
 * exclude one is allowed — the reason has to be written here, where the next
 * person reads it, rather than discovered later by its absence.
 */

export type EntityName =
  | 'catalogue_objectives'
  | 'catalogue_categories'
  | 'catalogue_offers'
  | 'catalogue_creatives'
  | 'catalogue_targeting_policies'
  | 'catalogue_frequency_policies'
  | 'catalogue_boosts'
  | 'catalogue_arbitration'
  | 'catalogue_events'
  | 'registry_versions'
  | 'registry_environments'
  | 'registry_events'
  | 'decision_records'
  | 'outcome_events';

export interface EntityDeclaration {
  /** Matches the table name, so the completeness check can compare directly. */
  table: string;
  included: boolean;
  /** Why, in the excluded case. Required, because this is the interesting half. */
  reason?: string;
}

export const ENTITIES: EntityDeclaration[] = [
  // The catalogue: what the engine decides *from*. One file per table rather
  // than one snapshot file, for the same reason the bundle is a directory and
  // not an archive — somebody should be able to open `catalogue_offers.json`
  // and read it. `readBundle` refuses a bundle missing any of them, so the
  // hazard of importing eight of nine is closed by the reader rather than by
  // fusing them into one file.
  { table: 'catalogue_objectives', included: true },
  { table: 'catalogue_categories', included: true },
  { table: 'catalogue_offers', included: true },
  { table: 'catalogue_creatives', included: true },
  { table: 'catalogue_targeting_policies', included: true },
  { table: 'catalogue_frequency_policies', included: true },
  { table: 'catalogue_boosts', included: true },
  // Zero or one row. An array either way, so every file in the bundle has the
  // same shape and nothing downstream special-cases it.
  { table: 'catalogue_arbitration', included: true },
  { table: 'catalogue_events', included: true },

  // Configuration and its history. A flow's compiled artifact is what makes
  // the export replayable elsewhere, so this is the part that matters most.
  { table: 'registry_versions', included: true },
  { table: 'registry_environments', included: true },
  { table: 'registry_events', included: true },

  // History. §9 names decision, interaction and outcome histories explicitly.
  { table: 'decision_records', included: true },
  { table: 'outcome_events', included: true },

  {
    table: 'idempotency_keys',
    included: false,
    reason:
      'A de-duplication window over in-flight requests, not tenant state. Its ' +
      'entries map a caller-chosen key to a decision that is itself exported, ' +
      'and they exist to make a retry safe within minutes of the original — a ' +
      'window that has always closed by the time a bundle is imported ' +
      'elsewhere. Carrying them across would let a stale key on the new ' +
      'instance answer a genuinely new request with an old decision, which is ' +
      'the exact failure idempotency exists to prevent.',
  },
];

export const EXPORTED_ENTITIES = ENTITIES.filter((e) => e.included).map(
  (e) => e.table as EntityName
);
