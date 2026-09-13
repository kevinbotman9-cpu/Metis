import type { FullConfig } from '@playwright/test';
import {
  seedFingerprint,
  fingerprintDiff,
  type SeedFingerprint,
} from '../mocks/fixtures/fingerprint';
import {
  objectives,
  categories,
  offers,
  creatives,
  targetingPolicies,
  frequencyPolicies,
  arbitrationConfig,
  boosts,
  connectors,
  placements,
  autonomySettings,
  agentActivity,
  users,
} from '../mocks/fixtures/catalogue';
import { experiments } from '../mocks/fixtures/experiments';
import { changeSets, auditEvents } from '../mocks/fixtures/governance';
import { artifacts } from '../mocks/fixtures/artifacts';
import { profileSchema } from '../mocks/fixtures/profile-schema';

/**
 * Refuse a reused dev server this suite cannot trust.
 *
 * `playwright.config.ts` sets `reuseExistingServer: true`, which exists so a
 * local run does not pay a cold start every time. Two things can make that
 * reuse a lie, and both are refused here.
 *
 * ## 1. A server serving fixtures that are no longer on disk — G-002
 *
 * The mock store builds its seed **at module load**, so a fixture edited after
 * the server started is invisible: the API keeps answering from the seed it
 * captured and every assertion runs against data the author has already
 * changed.
 *
 * That is not a demo-data annoyance, which is how it was filed from
 * 2026-09-05. **It is a mechanism that makes Rule 9 unreliable.** A bite-proof
 * is *edit the guarded thing, watch the check go red*; if the edit never
 * reaches the server the check stays green, and the conclusion drawn is "this
 * check does not bite" when the truth is "the check was never shown the
 * change". On 2026-09-12 that happened: a boost was set to 1.0 to prove an e2e
 * assertion depended on it, the suite passed, and the inference — the
 * assertion is worthless — was wrong. Restarted, the same proof failed in one
 * line. Nothing in the suite said so. It was caught by distrusting a
 * convenient result, which is not a control.
 *
 * So the server now says what it seeded and the suite checks it, naming the
 * part that differs rather than only that something does.
 *
 * ## 2. A server that has been up too long — G-035
 *
 * A long-lived `next dev` degrades. On 2026-09-09 one had been up seventeen
 * hours at 2.2 GB resident, and against it `npm run test:a11y` managed **two
 * tests in ten minutes** where a fresh server ran **forty-nine in two forty**.
 * Two proof runs were measured against it before anybody looked.
 *
 * ### Why two hours
 *
 * A cold start costs about thirty seconds, so refusing at two hours costs at
 * most one cold start per two hours of work — inside the noise of a suite that
 * takes a quarter of an hour. The only degradation observed was at seventeen
 * hours; two hours is well inside it and longer than any sitting of
 * edit-and-rerun, so a developer iterating normally never sees this and a
 * server left up overnight always does.
 *
 * **It is one observation, not a curve.** Nobody has measured where the
 * degradation begins. Recording the server's age beside the suite duration for
 * a few weeks is the honest way to refine it; until then it is a guess with a
 * reason.
 */
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** Twelve characters: enough to be unambiguous, short enough to compare by eye. */
const short = (h: string) => h.slice(0, 12);

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  let body: { uptimeMs?: number; seed?: SeedFingerprint } | undefined;
  try {
    const res = await fetch(`${baseURL}/api/_test/uptime`);
    if (!res.ok) {
      // Something is listening and it is not this application. Refused, not
      // ignored: `reuseExistingServer` will hand the suite to whatever owns
      // the port, and the staler a server is the likelier it has lost this
      // endpoint — so the check was least able to fire exactly when it
      // mattered most. On 2026-09-11 a `next dev` serving a broken module
      // graph answered `/` with 200 and every API with 404; the suite reused
      // it and produced 341 failures in 65 minutes against a commit that was
      // fine, and this guard printed nothing. G-082.
      throw new Error(
        [
          '',
          `Something is listening on ${baseURL} and it is not this console:`,
          `GET /api/_test/uptime answered ${res.status}.`,
          '',
          'Playwright reuses whatever owns the port, so the suite would run',
          'against it. A server that cannot answer its own test endpoint is not',
          'a server to measure against — most likely it is a dev server whose',
          'module graph has broken, or another application on port 3000.',
          '',
          'Stop it and run again. See G-082 in docs/gaps.md.',
          '',
        ].join('\n')
      );
    }
    body = (await res.json()) as typeof body;
  } catch (e) {
    // A refusal above is a decision and must not be swallowed by the catch
    // that exists for "nothing is listening".
    if (e instanceof Error && e.message.includes('/api/_test/uptime answered')) throw e;
    // Connection refused: Playwright is about to start its own server, which
    // is exactly the state this check wants. Nothing to refuse.
    return;
  }

  // --- 1. Is it serving the fixtures that are on disk? ----------------------
  // The fixtures as they are on disk, read by this process rather than by the
  // server. The server sends what it seeded; a difference is the staleness.
  const disk = seedFingerprint({
    objectives,
    categories,
    offers,
    creatives,
    targetingPolicies,
    frequencyPolicies,
    arbitration: arbitrationConfig,
    boosts,
    connectors,
    placements,
    artifacts,
    profileSchema,
    experiments,
    autonomySettings,
    agentActivity,
    users,
    changeSets,
    auditEvents,
  });
  const served = body?.seed;
  if (served && served.overall !== disk.overall) {
    const differing = fingerprintDiff(served, disk);
    throw new Error(
      [
        '',
        `The dev server on ${baseURL} seeded fixtures that are no longer the`,
        'ones on disk. It builds its seed at module load, so every assertion',
        'below would run against data you have already changed.',
        '',
        `  server seeded  ${short(served.overall)}`,
        `  disk is        ${short(disk.overall)}`,
        '',
        '  differing in:',
        ...differing.map(
          (d) => `    ${d.part.padEnd(20)} server ${short(d.server)}   disk ${short(d.disk)}`
        ),
        '',
        'Restart it, then run again.',
        'A bite-proof taken against a reused dev server proves nothing — G-002.',
        '',
      ].join('\n')
    );
  }

  // --- 2. Has it been up long enough to have degraded? ----------------------
  const uptimeMs = body?.uptimeMs;
  if (typeof uptimeMs !== 'number' || uptimeMs <= MAX_AGE_MS) return;

  const hours = (uptimeMs / 3_600_000).toFixed(1);
  throw new Error(
    [
      '',
      `The dev server on ${baseURL} has been up for ${hours} hours.`,
      '',
      'Playwright reuses it, and a long-lived one degrades until the suite',
      'measures the server rather than the code: at seventeen hours, the',
      'accessibility suite ran two tests in ten minutes where a fresh server ran',
      'forty-nine in under three. A run against it is not evidence.',
      '',
      'Restart it, then run again. See G-035 in docs/gaps.md.',
      '',
    ].join('\n')
  );
}
