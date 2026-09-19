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
  | 'catalogue_connectors'
  | 'catalogue_placements'
  | 'catalogue_profile_schemas'
  | 'catalogue_experiments'
  | 'catalogue_arbitration'
  | 'catalogue_events'
  | 'registry_versions'
  | 'registry_environments'
  | 'registry_events'
  | 'registry_drafts'
  | 'registry_shadow_comparisons'
  | 'registry_models'
  | 'governance_change_sets'
  | 'governance_audit_events'
  | 'decision_records'
  | 'outcome_events'
  | 'delivery_attempts';

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
  // Hashed with the catalogue: a restore without its connectors would decide
  // against a different catalogue hash from the one its own records name.
  { table: 'catalogue_connectors', included: true },
  // Not hashed, and a slate is reproducible only with the placement that
  // composed it (G-010), so a placement travels with the decisions it shaped.
  { table: 'catalogue_placements', included: true },
  // Zero or one row, like arbitration. The data model a tenant's policies are
  // written against: a restore without it would hold rules that name fields
  // nothing defines.
  { table: 'catalogue_profile_schemas', included: true },
  // In every state. A stopped experiment still explains the decisions it split.
  { table: 'catalogue_experiments', included: true },
  // Zero or one row. An array either way, so every file in the bundle has the
  // same shape and nothing downstream special-cases it.
  { table: 'catalogue_arbitration', included: true },
  { table: 'catalogue_events', included: true },

  // Configuration and its history. A flow's compiled artifact is what makes
  // the export replayable elsewhere, so this is the part that matters most.
  { table: 'registry_versions', included: true },
  { table: 'registry_environments', included: true },
  { table: 'registry_events', included: true },
  // The graph a person is editing and has not published. A restore without it
  // would hold every version a tenant shipped and none of the work in progress
  // on the next one.
  { table: 'registry_drafts', included: true },
  // The evidence behind a migration in progress. The shadow pointer travels in
  // `registry_environments`; without this a restored tenant would be shadowing
  // with an agreement rate of nothing.
  { table: 'registry_shadow_comparisons', included: true },
  // The scorers a flow's score nodes pin (ADR-009 §4). A restore without them
  // would hold flows whose pins name nothing, and the compiler refuses a pin to
  // a model the registry does not hold — so every flow that scores would stop
  // being publishable on the instance it was moved to.
  { table: 'registry_models', included: true },

  // Who asked for a change, who decided it and why, and everything else a
  // person or an agent did. A restore without them would hold edits nobody can
  // account for, and pending change sets nobody could decide.
  { table: 'governance_change_sets', included: true },
  { table: 'governance_audit_events', included: true },

  // History. §9 names decision, interaction and outcome histories explicitly.
  { table: 'decision_records', included: true },
  { table: 'outcome_events', included: true },

  // What the platform did about delivering each decision — ADR-013. Exported
  // for the same reason outcomes are: a decision whose delivery was suppressed
  // reads as offered-and-unmeasured without it, which is indistinguishable from
  // a channel that simply did not report back. The distinction is exactly what
  // this record exists to make, and an export that dropped it would move a
  // tenant whose history no longer explains itself.
  { table: 'delivery_attempts', included: true },

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

  // The key store (ADR-025). None of it travels, and each for a reason that is
  // about erasure: a key outside the platform is a key no erasure can destroy.
  // How an encrypted history moves — re-wrapped under the destination's keys on
  // import — is decided with step B of docs/DIRECTIVE.md, when the ledger is
  // first held under these keys. Until then these exclusions are what keep an
  // export from carrying the one thing erasure depends on removing.
  {
    table: 'subject_keys',
    included: false,
    reason:
      'A subject key is what erasure destroys. A copy in an export is a copy no ' +
      'erasure can reach: whoever held the bundle and the tenant key could open an ' +
      'erased subject again, and "can destroy it provably" would stop being true ' +
      'the moment a bundle was written.',
  },
  {
    table: 'key_tenants',
    included: false,
    reason:
      'The key tenant pseudonyms are computed under, wrapped under a tenant key ' +
      'the platform never holds. Without that tenant key it means nothing; with ' +
      'it, every subject\'s pseudonym could be recomputed away from the platform. ' +
      'A tenant moved elsewhere gets a new one under its new tenant key.',
  },
  {
    table: 'erasures',
    included: false,
    reason:
      'What this key store destroyed, named by pseudonyms under this platform\'s ' +
      'keys, which name nothing on another instance. What an erasure protects — ' +
      'the subject key — is already absent from every export, so there is ' +
      'nothing on the far side for the record to re-apply to.',
  },
];

export const EXPORTED_ENTITIES = ENTITIES.filter((e) => e.included).map(
  (e) => e.table as EntityName
);
