/**
 * What `npm run seed:ledger` is allowed to do — ADR-018 clause 3.
 *
 * The rules live here, apart from the command, because they are the part worth
 * holding: a reset truncates the ledger's tables, and every refusal below is
 * the difference between seeding a demo tenant and destroying a record. A test
 * that needed a database to ask "does this refuse without `--tenant`" would be
 * slow, and a slow check of a destructive path is a check nobody runs.
 *
 * The append-only triggers are never bypassed (ADR-004 clause 2), so the only
 * way to clear rows is `TRUNCATE`, which empties the table for every tenant at
 * once. That is why a ledger holding a second tenant refuses rather than
 * resetting one of them.
 */

export interface SeedRequest {
  /** Named explicitly on the command line. There is no default and no all-tenants form. */
  tenant?: string;
  reset: boolean;
  /** Who is running it. Required for a reset, which is audited. */
  by?: string;
  /** The ledger's data class, as the store reports it. */
  dataClass?: string;
  /** Every tenant the ledger holds a decision for. */
  tenantsInLedger: readonly string[];
  /** How many decisions the named tenant already has. */
  existingForTenant: number;
  /**
   * How many of those were made by using the console: decided after the
   * seeded corpus ends (`SEEDED_BEFORE`), so nothing can regenerate them.
   */
  madeByHand?: number;
  /**
   * The operator's acknowledgement, `--discard-made-by-hand <n>`. A reset of a
   * tenant holding decisions made by hand goes ahead only when this is exactly
   * that count — typed, not defaulted, so the number is read before it is lost.
   */
  discardMadeByHand?: number;
  /**
   * `--empty`: reset and write nothing, so the ledger holds only what is made
   * by using the console from here on — a development console's default since
   * ADR-018 §3 was amended. Only with `--reset`; every refusal still applies.
   */
  empty?: boolean;
}

export type SeedPlan =
  | { kind: 'refuse'; reason: string }
  | { kind: 'seed' }
  | { kind: 'reset-and-seed' }
  | { kind: 'reset' }
  | { kind: 'leave'; reason: string };

export function planSeed(request: SeedRequest): SeedPlan {
  const { tenant, reset, by, dataClass, tenantsInLedger, existingForTenant, madeByHand = 0, discardMadeByHand, empty } =
    request;

  if (!tenant) {
    return {
      kind: 'refuse',
      reason:
        'Name the tenant: --tenant <id>. There is no default and no all-tenants form, because a reset truncates the ledger for every tenant in the database.',
    };
  }

  if (empty && !reset) {
    return {
      kind: 'refuse',
      reason: `--empty clears a ledger, so it needs --reset: --reset --empty --tenant ${tenant} --by <who>.`,
    };
  }

  if (dataClass !== 'synthetic') {
    return {
      kind: 'refuse',
      reason:
        `This ledger's data class is ${dataClass ?? 'unset'}, not synthetic. The seed writes a generated history, and a reset destroys rows. ` +
        'Set METIS_DATA_CLASS=synthetic for a demo database; a real ledger is evidence and this command will not touch it.',
    };
  }

  if (reset) {
    if (!by) {
      return {
        kind: 'refuse',
        reason: 'A reset is audited: --by <who> is required, and is recorded as the actor on the LedgerReset event.',
      };
    }

    const others = tenantsInLedger.filter((t) => t !== tenant);
    if (others.length > 0) {
      return {
        kind: 'refuse',
        reason:
          `The ledger also holds ${others.join(', ')}. A reset truncates the tables for every tenant, and the append-only triggers are never bypassed (ADR-004 clause 2), ` +
          'so there is no per-tenant delete. Use a database holding only this tenant.',
      };
    }

    /**
     * A history made by hand is not regenerable (ADR-019 §7, amended
     * 2026-09-17). Every other refusal here protects a ledger that is real or
     * shared; this one protects a synthetic ledger somebody spent an afternoon
     * clicking into, which the reseed of ADR-019 is the first thing to ask to
     * reset. Asked for by the product owner on 2026-09-18, before that reseed.
     */
    if (madeByHand > 0 && discardMadeByHand !== madeByHand) {
      const them = madeByHand === 1 ? 'it' : 'them';
      return {
        kind: 'refuse',
        reason:
          `${tenant} holds ${madeByHand} decision${madeByHand === 1 ? '' : 's'} made by using the console, after the seeded corpus ends. ` +
          `A reset destroys ${them} with everything joined to ${them}, and nothing can regenerate ${them}: the seed produces only its own history (ADR-019 §7). ` +
          (discardMadeByHand === undefined
            ? `To discard ${them}, repeat with --discard-made-by-hand ${madeByHand}.`
            : `--discard-made-by-hand said ${discardMadeByHand}; it must be exactly ${madeByHand}, the count this ledger holds now.`),
      };
    }

    return empty ? { kind: 'reset' } : { kind: 'reset-and-seed' };
  }

  if (existingForTenant > 0) {
    return {
      kind: 'leave',
      reason:
        `${tenant} already holds ${existingForTenant} decisions, so they are used as found — the rule the catalogue and registry seeds follow. ` +
        `To replace them: --reset --tenant ${tenant} --by <who>.`,
    };
  }

  return { kind: 'seed' };
}
