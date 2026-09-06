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
