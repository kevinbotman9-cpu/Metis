import type { FullConfig } from '@playwright/test';
import { seedFingerprint, type SeedFingerprint } from '../mocks/fixtures/fingerprint';
import { serverRefusal } from './server-trust';
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
 * Refuse a server this suite cannot trust.
 *
 * The decision is `serverRefusal` in `./server-trust.ts`, a pure function with
 * its own unit tests; this file only gathers what the server says and what is
 * on disk, and throws what the function returns.
 *
 * Two things made a reused server a lie, and both are now closed at the source
 * rather than estimated:
 *
 * - **G-002, stale fixtures.** The store seeds at module load, so a fixture
 *   edited after the server started never reached it, and a bite-proof against
 *   it read as "this check does not bite".
 * - **G-035, a worn server.** One went from twenty tests a minute to one
 *   partway through a suite, forty minutes after it started. The two-hour
 *   uptime refusal that stood here could not have caught it: the damage tracked
 *   work served, not age, and a check made before the suite cannot see a
 *   server degrade during it.
 *
 * `playwright.config.ts` now starts a fresh server every run, on its own port
 * and dist directory, and never reuses one. This setup checks the server that
 * answers is that one — by the run token it was handed — and that its seed is
 * the fixtures on disk.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  const expectedRun = process.env.METIS_E2E_RUN;
  if (!expectedRun) {
    throw new Error(
      'METIS_E2E_RUN is not set. playwright.config.ts sets it before anything else runs; ' +
        'a setup that cannot see it is not running under that config.'
    );
  }

  const res = await fetch(`${baseURL}/api/_test/uptime`).catch(() => null);
  if (!res || !res.ok) {
    // By now Playwright has started the server and waited for it, so nothing
    // answering — or something answering without this endpoint — is not this
    // console. Refused rather than skipped: the old code returned quietly on a
    // refused connection, which was right when reuse was optional and is a hole
    // now that it is not. G-082.
    throw new Error(
      [
        '',
        `GET ${baseURL}/api/_test/uptime answered ${res ? res.status : 'nothing'}.`,
        'The harness started a console on this port and waited for it, so a server',
        'that cannot answer its own test endpoint is not that console. Most likely',
        'its module graph broke during start-up; the [WebServer] lines above say why.',
        '',
      ].join('\n')
    );
  }
  const served = (await res.json()) as { run?: string | null; seed?: SeedFingerprint };

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

  const refusal = serverRefusal(baseURL, served, expectedRun, disk);
  if (refusal) throw new Error(refusal);
}
