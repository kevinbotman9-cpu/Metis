/**
 * Volume and budget caps.
 *
 * "This offer at most ten thousand times this month" and "at most £50,000 of
 * realised value" are ordinary requirements and a genuine trap for this
 * architecture, because both need state shared across decisions.
 *
 * Reading a live counter inside the engine would end replay. The same request
 * would decide differently depending on when it ran, and a decision made in
 * March could not be reproduced in June because the counter has moved. So the
 * count resolves **before** the deterministic core, exactly where connector
 * fields and rollups resolve, and enters the input as an ordinary number that
 * is hashed with everything else. The count a decision saw is then part of what
 * was decided, and a replay reproduces it rather than recounting.
 *
 * The same trap catches contextual bandits, real-time inventory and pacing.
 * They belong in the same place for the same reason.
 *
 * ## Unknown must not permit
 *
 * The rule that inverts everywhere else in this codebase. Elsewhere an absent
 * value means "we do not know" and a comparison against it fails, which
 * suppresses — fail closed. A cap is the same shape and the opposite polarity:
 * if the count cannot be read, `remaining` is absent, `remaining > 0` is false,
 * and the offer is suppressed.
 *
 * That is the right way round. Sending because nobody could tell us whether the
 * budget was spent is how a cap is discovered to have been decorative.
 */

export type VolumePeriod = 'day' | 'week' | 'month';

export interface VolumeConstraint {
  id: string;
  tenantId: string;
  name: string;
  /** The offer this caps. Caps are per offer; a scope-wide cap is several. */
  offerKey: string;
  /** Times it may be offered in the period. Null when only spend is capped. */
  maxOffers: number | null;
  /**
   * Realised value it may accumulate, in minor units.
   *
   * Counted from outcomes that carried a value, so it measures money that
   * actually landed rather than money that was hoped for.
   */
  maxSpendMinor: number | null;
  period: VolumePeriod;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
}

/** What was consumed in the period, as the resolver is told it. */
export interface VolumeUsage {
  offerKey: string;
  used: number;
  spentMinor: number;
}

/**
 * The start of the window this decision falls in.
 *
 * Derived from `occurredAt` and never from the clock — the same rule the engine
 * follows. A cap computed against "now" would put a replayed decision in a
 * different window from the one it was made in, and the replay would disagree
 * for a reason that has nothing to do with the decision.
 *
 * UTC throughout. A tenant-local week is a real requirement and a different
 * one; doing it implicitly here would make the boundary depend on a timezone
 * nobody declared.
 */
export function periodStart(occurredAt: string, period: VolumePeriod): string {
  const at = new Date(occurredAt);
  if (Number.isNaN(at.getTime())) throw new Error(`'${occurredAt}' is not a time`);

  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();
  const d = at.getUTCDate();

  if (period === 'month') return new Date(Date.UTC(y, m, 1)).toISOString();
  if (period === 'day') return new Date(Date.UTC(y, m, d)).toISOString();

  // Weeks start Monday, which is what a business calendar means by "this week".
  // `getUTCDay` is 0 for Sunday, so Sunday is six days into its week.
  const weekday = (at.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(y, m, d - weekday)).toISOString();
}

/** The paths a constraint publishes into the decision input. */
export const volumePaths = (offerKey: string) => ({
  used: `volume.${offerKey}.used`,
  remaining: `volume.${offerKey}.remaining`,
  spent: `volume.${offerKey}.spent`,
  budgetRemaining: `volume.${offerKey}.budget_remaining`,
});

export interface ResolvedVolume {
  /** Values to merge into the decision input, hashed with the rest. */
  values: Record<string, number>;
  /**
   * Constraints whose usage could not be established, and why.
   *
   * Their paths are absent rather than optimistic, so any policy reading them
   * fails and the offer is suppressed.
   */
  unresolved: { offerKey: string; reason: string }[];
}

/**
 * Turn usage into decision input.
 *
 * `usage` is passed in rather than fetched, so this is pure and can be run over
 * a fixture, a live count or a replayed one without knowing which.
 */
export function resolveVolume(
  constraints: VolumeConstraint[],
  usage: Map<string, VolumeUsage>
): ResolvedVolume {
  const values: Record<string, number> = {};
  const unresolved: { offerKey: string; reason: string }[] = [];

  // Sorted: the values are hashed into the decision, so the order they are
  // built in must not depend on how the store returned the constraints.
  for (const constraint of [...constraints]
    .filter((c) => c.active)
    .sort((a, b) => a.offerKey.localeCompare(b.offerKey))) {
    const seen = usage.get(constraint.offerKey);
    if (!seen) {
      unresolved.push({
        offerKey: constraint.offerKey,
        reason: 'usage could not be counted',
      });
      continue;
    }

    const paths = volumePaths(constraint.offerKey);
    values[paths.used] = seen.used;
    values[paths.spent] = seen.spentMinor;

    // Only published when there is a cap. A `remaining` for an uncapped offer
    // would be a number with no meaning, and a rule could be written against it.
    if (constraint.maxOffers !== null) {
      values[paths.remaining] = Math.max(0, constraint.maxOffers - seen.used);
    }
    if (constraint.maxSpendMinor !== null) {
      values[paths.budgetRemaining] = Math.max(0, constraint.maxSpendMinor - seen.spentMinor);
    }
  }

  return { values, unresolved };
}

const KEY = /^[a-z][a-z0-9_]*$/;

/** What is wrong with this constraint, or nothing. */
export function volumeProblems(constraint: VolumeConstraint): string[] {
  const problems: string[] = [];

  if (!KEY.test(constraint.offerKey)) {
    problems.push(
      `Offer key '${constraint.offerKey}' must be lowercase letters, digits and underscores — it becomes the field path ${volumePaths(constraint.offerKey).remaining}.`
    );
  }
  if (constraint.maxOffers === null && constraint.maxSpendMinor === null) {
    problems.push('A cap that limits neither count nor spend limits nothing.');
  }
  if (constraint.maxOffers !== null && constraint.maxOffers < 0) {
    problems.push('A negative offer cap is not a cap.');
  }
  if (constraint.maxSpendMinor !== null && constraint.maxSpendMinor < 0) {
    problems.push('A negative budget is not a budget.');
  }
  if (constraint.maxOffers === 0) {
    problems.push(
      'A cap of zero suppresses the offer entirely. Deactivate the offer instead, so the reason is legible in the catalogue rather than in a cap.'
    );
  }

  return problems;
}
