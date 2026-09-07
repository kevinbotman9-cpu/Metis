/**
 * Experiments and holdouts.
 *
 * The design turns on one observation: **an arm assignment is an input to a
 * decision, not a wrapper around one.** Most platforms bolt experimentation on
 * beside the decision engine and then cannot tell you, six months later, which
 * arm a particular customer was in — the assignment lived in a service that has
 * since rebalanced.
 *
 * Here the assignment is a pure function of the customer reference and the
 * experiment, so it is:
 *
 *   - **reproducible** — the same customer always lands in the same arm;
 *   - **recoverable** — a decision record stores `customerRef`, so the arm can
 *     be recomputed from a record made months ago without ever having been
 *     written down;
 *   - **traceable** — the arm enters the decision input, is hashed with it, and
 *     is therefore part of what was decided rather than context around it.
 *
 * No engine change was needed for any of that. An arm reaches a policy as an
 * ordinary field, so a holdout is an eligibility rule that refuses when the arm
 * is `holdout`, written in the same editor as every other rule.
 *
 * ## Why a running experiment cannot be edited
 *
 * Recoverability depends on the assignment function being stable. Reweighting
 * a live experiment would silently rewrite the history of every decision it had
 * already influenced — the recomputed arm would stop matching the one that
 * actually applied, and the trace would confidently report the wrong arm.
 *
 * So arms and weights are editable in `draft` and frozen from the moment the
 * experiment starts. Stopping and starting a new one is the supported way to
 * change the split, which is also what anybody running a real test would do.
 */

import { createHash } from 'node:crypto';

export interface ExperimentArm {
  /** Stable identifier. Appears in policies and reports, so it must not change. */
  key: string;
  name: string;
  /**
   * Relative share. Not required to sum to 100 — they are normalised — because
   * a 1:1:2 split is a thing people write and rejecting it teaches nothing.
   */
  weight: number;
  /**
   * Whether this arm is the untreated group.
   *
   * Marked rather than inferred from the name: `control`, `holdout` and
   * `baseline` all appear in the wild and guessing would be wrong somewhere.
   * Nothing in the engine reads it; reports use it to know which arm is the
   * comparison.
   */
  holdout?: boolean;
}

export interface Experiment {
  id: string;
  tenantId: string;
  /**
   * The field name an arm reaches policies under: `experiments.<key>`.
   *
   * Restricted to what a dotted path can hold, because it becomes one.
   */
  key: string;
  name: string;
  description: string;
  arms: ExperimentArm[];
  status: 'draft' | 'running' | 'stopped';
  startedAt: string | null;
  stoppedAt: string | null;
  updatedAt: string;
  updatedBy: string;
}

/** The path an experiment's arm arrives at in the decision input. */
export const armPath = (experimentKey: string) => `experiments.${experimentKey}`;

/**
 * A stable number in [0, 1) for this customer and this experiment.
 *
 * Salted with the experiment key so two experiments do not assign the same
 * customers to the same relative position — without it, every customer in the
 * first arm of experiment A would also be in the first arm of experiment B, and
 * the two would be measuring the same population.
 */
export function bucketOf(experimentKey: string, customerRef: string): number {
  const digest = createHash('sha256')
    .update(`${experimentKey.length}:${experimentKey}:${customerRef}`)
    .digest();
  // 48 bits is plenty of resolution and stays inside a safe integer.
  const value = digest.readUIntBE(0, 6);
  return value / 2 ** 48;
}

/**
 * Which arm this customer is in, or null when the experiment is not running.
 *
 * A draft experiment assigns nobody: it would otherwise start splitting traffic
 * the moment it was saved, before anybody had approved the split.
 */
export function assignArm(experiment: Experiment, customerRef: string): ExperimentArm | null {
  if (experiment.status !== 'running') return null;

  const usable = experiment.arms.filter((a) => a.weight > 0);
  const total = usable.reduce((n, a) => n + a.weight, 0);
  if (total <= 0) return null;

  const point = bucketOf(experiment.key, customerRef) * total;
  let cursor = 0;
  for (const arm of usable) {
    cursor += arm.weight;
    if (point < cursor) return arm;
  }
  // Floating point can leave `point` a hair short of `total`. Falling through
  // to the last arm is right; returning null here would silently unassign a
  // fraction of traffic.
  return usable[usable.length - 1];
}

/**
 * Every running experiment's arm for this customer, as decision input.
 *
 * The shape the engine reads: flat paths that a policy condition can name.
 */
export function assignAll(
  experiments: Experiment[],
  customerRef: string
): { values: Record<string, string>; assignments: { experimentKey: string; arm: string }[] } {
  const values: Record<string, string> = {};
  const assignments: { experimentKey: string; arm: string }[] = [];

  // Sorted so the merge order is fixed regardless of how the store returns
  // them; the values are hashed into the decision.
  for (const experiment of [...experiments].sort((a, b) => a.key.localeCompare(b.key))) {
    const arm = assignArm(experiment, customerRef);
    if (!arm) continue;
    values[armPath(experiment.key)] = arm.key;
    assignments.push({ experimentKey: experiment.key, arm: arm.key });
  }

  return { values, assignments };
}

const KEY = /^[a-z][a-z0-9_]*$/;

/** What is wrong with this experiment, or nothing. */
export function experimentProblems(experiment: Experiment): string[] {
  const problems: string[] = [];

  if (!KEY.test(experiment.key)) {
    problems.push(
      `Key '${experiment.key}' must be lowercase letters, digits and underscores — it becomes the field path ${armPath(experiment.key)}.`
    );
  }
  if (experiment.arms.length < 2) {
    problems.push('An experiment needs at least two arms; one arm is just a change.');
  }

  const keys = new Set<string>();
  for (const arm of experiment.arms) {
    if (!KEY.test(arm.key)) {
      problems.push(`Arm key '${arm.key}' must be lowercase letters, digits and underscores.`);
    }
    if (keys.has(arm.key)) problems.push(`Two arms share the key '${arm.key}'.`);
    keys.add(arm.key);
    if (arm.weight < 0) problems.push(`Arm '${arm.key}' has a negative weight.`);
  }

  if (experiment.arms.reduce((n, a) => n + a.weight, 0) <= 0) {
    problems.push('Every arm has zero weight, so nobody would be assigned.');
  }
  if (experiment.arms.filter((a) => a.holdout).length > 1) {
    problems.push('More than one arm is marked as the holdout; a report cannot compare against two.');
  }

  return problems;
}

/**
 * Why this experiment cannot be edited, or nothing.
 *
 * Separate from `experimentProblems` because it is about the transition rather
 * than the shape: a running experiment is well formed and still must not change.
 */
export function editProblems(experiment: Experiment, patch: Partial<Experiment>): string[] {
  if (experiment.status === 'draft') return [];

  const touchesSplit =
    patch.arms !== undefined || (patch.key !== undefined && patch.key !== experiment.key);

  if (touchesSplit) {
    return [
      `'${experiment.name}' is ${experiment.status}. Its arms and key are frozen: an arm is ` +
        'recomputed from the customer reference when a decision is explained months later, and ' +
        'reweighting now would make every recomputed arm disagree with the one that actually ' +
        'applied. Stop it and start another to change the split.',
    ];
  }
  return [];
}

/** The percentage of traffic each arm takes, for display. */
export function armShares(experiment: Experiment): { key: string; share: number }[] {
  const total = experiment.arms.reduce((n, a) => n + Math.max(0, a.weight), 0);
  return experiment.arms.map((a) => ({
    key: a.key,
    share: total > 0 ? Math.max(0, a.weight) / total : 0,
  }));
}
