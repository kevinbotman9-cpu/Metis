/**
 * What this process seeded, hashed per part.
 *
 * ## Why this exists
 *
 * `playwright.config.ts` sets `reuseExistingServer: true`, and the mock store
 * builds its seed **at module load**. So a fixture edited after the server
 * started is invisible to the suite: the API keeps answering from the seed it
 * captured, and every assertion runs against data nobody is looking at.
 *
 * That is not a demo-data annoyance. It is a mechanism that makes Rule 9
 * unreliable. A bite-proof is *edit the guarded thing, watch the check go red* —
 * and if the edit never reaches the server, the check stays green and the
 * conclusion drawn is "this check does not bite" when the truth is "the check
 * was never shown the change". On 2026-09-12 exactly that happened: a boost was
 * set to 1.0 to prove an e2e assertion depended on it, the suite passed, and the
 * reasonable inference — the assertion is worthless — was wrong. The server had
 * the old catalogue. Restarted, the same proof failed in one line. Nothing in
 * the suite said so; it was caught by distrusting a convenient result, which is
 * not a control.
 *
 * ## Why a fingerprint rather than a timestamp
 *
 * The obvious guard is "refuse a server older than the newest fixture file".
 * That needs a list of directories to watch, so it is wrong in both directions:
 * it refuses a good server because an unrelated file was touched, and it trusts
 * one whose staleness came from a directory nobody thought to list.
 *
 * This compares the thing itself. The server computes it from the modules it has
 * loaded; the suite computes it from the modules on disk. Same function, one
 * implementation, so the two cannot drift the way a second copy of the rule
 * would — and a mismatch is proof rather than inference.
 *
 * ## Why per part
 *
 * So the failure can say what changed. "Mismatch" tells you the server is
 * stale; "differing in targetingPolicies" tells you which edit it has not seen,
 * which is the difference between a red check and a useful one.
 *
 * ## What it covers
 *
 * Everything the store seeds from a fixture, which is the test for whether a
 * part belongs here: if a reused server can serve it stale, the guard has to be
 * able to see it.
 *
 * It held twelve parts for about an hour on 2026-09-12 and missed six —
 * experiments, autonomy, agent activity, users, change sets and audit events.
 * Renaming a seeded experiment produced a failure the guard could not explain
 * and a rerun that passed, which is precisely the confusion it exists to
 * remove. The part list is asserted by name in `seed-fingerprint.test.ts` so
 * that losing one again is a failing test rather than a puzzling afternoon.
 *
 * Not the seeded decision corpus: that is a pure function of the catalogue plus
 * the engine, so a change to it already shows up in one of these.
 */

import { hash } from '@metis/runtime';

/** Everything the mock store seeds itself from, and can therefore serve stale. */
export interface SeedSource {
  objectives: unknown;
  categories: unknown;
  offers: unknown;
  creatives: unknown;
  targetingPolicies: unknown;
  frequencyPolicies: unknown;
  arbitration: unknown;
  boosts: unknown;
  connectors: unknown;
  placements: unknown;
  artifacts: unknown;
  profileSchema: unknown;
  experiments: unknown;
  autonomySettings: unknown;
  agentActivity: unknown;
  users: unknown;
  changeSets: unknown;
  auditEvents: unknown;
}

export interface SeedFingerprint {
  /** sha256 over every part below, so one comparison answers "same seed?". */
  overall: string;
  /** Per part, so a mismatch can name which edit the server has not seen. */
  parts: Record<string, string>;
}

/**
 * The twelve parts, from whatever holds them.
 *
 * A parameter rather than a direct import of the fixtures, and that is the
 * whole design. Reading the fixture modules here would compute the same answer
 * in both callers and the guard would compare disk to disk: verified on
 * 2026-09-12, when a boost was edited without restarting, the running server
 * kept deciding on the old value and this function — importing the module
 * directly — reported the *new* fingerprint, because Next had re-evaluated
 * `catalogue.ts` without re-evaluating the store that seeded from it.
 *
 * So the store passes what it actually seeded and the suite passes what is on
 * disk. `packs` is absent because the store does not hold it: the route serves
 * it from the module, which cannot go stale in the way a captured seed can.
 */
export function seedFingerprint(source: SeedSource): SeedFingerprint {
  const parts: Record<string, string> = {
    objectives: hash(source.objectives),
    categories: hash(source.categories),
    offers: hash(source.offers),
    creatives: hash(source.creatives),
    targetingPolicies: hash(source.targetingPolicies),
    frequencyPolicies: hash(source.frequencyPolicies),
    arbitration: hash(source.arbitration),
    boosts: hash(source.boosts),
    connectors: hash(source.connectors),
    placements: hash(source.placements),
    artifacts: hash(source.artifacts),
    profileSchema: hash(source.profileSchema),
    experiments: hash(source.experiments),
    autonomySettings: hash(source.autonomySettings),
    agentActivity: hash(source.agentActivity),
    users: hash(source.users),
    changeSets: hash(source.changeSets),
    auditEvents: hash(source.auditEvents),
  };
  return { overall: hash(parts), parts };
}

/**
 * The parts two fingerprints disagree about, with both sides.
 *
 * Exported so the one place that formats this failure does not also own the
 * comparison — a test asserts this function against hand-built inputs, which a
 * message formatted inline could not be.
 */
export function fingerprintDiff(
  server: SeedFingerprint,
  disk: SeedFingerprint
): { part: string; server: string; disk: string }[] {
  const names = [...new Set([...Object.keys(server.parts), ...Object.keys(disk.parts)])].sort();
  return names
    .filter((p) => server.parts[p] !== disk.parts[p])
    .map((part) => ({
      part,
      server: server.parts[part] ?? 'absent',
      disk: disk.parts[part] ?? 'absent',
    }));
}
