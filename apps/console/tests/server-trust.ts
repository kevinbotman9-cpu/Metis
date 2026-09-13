import { fingerprintDiff, type SeedFingerprint } from '../mocks/fixtures/fingerprint';

/**
 * Whether the suite may believe the server answering it — as a pure function.
 *
 * `global-setup.ts` used to hold this logic inline, in Playwright's setup
 * process, where nothing could exercise it without booting a server. So the one
 * control on Rule 9 was proved by hand once and checked by nothing afterwards
 * (G-095). Pulled out here, every refusal is a unit test: hand it what a server
 * said and what this run expects, and assert what it refuses and why.
 *
 * ## What it refuses
 *
 * **A server this run did not start.** Since G-035 the harness owns the dev
 * server's lifecycle: `playwright.config.ts` starts one on its own port with its
 * own dist directory, hands it a run token, and never reuses anything. The
 * server echoes the token from `GET /api/_test/uptime`. A server that echoes a
 * different token, or none, is somebody else's — and a reused server is how
 * results were corrupted twice: once by fixtures it never reloaded (G-002),
 * once by accumulated work that slowed it from twenty tests a minute to one
 * mid-suite (G-035).
 *
 * **A server whose seed is not the fixtures on disk.** Kept after the run token
 * made it nearly unreachable, because it is the check that names *what* is
 * wrong. A fixture edited between the server starting and the suite reaching
 * this point is still a stale seed.
 *
 * The run token is checked first: if the server is not ours, what it seeded is
 * beside the point.
 */

export interface ServerIdentity {
  /** The run token the server was started with, or absent if it predates one. */
  run?: string | null;
  /** What the server seeded, hashed per part. */
  seed?: SeedFingerprint;
}

/** Twelve characters: enough to be unambiguous, short enough to compare by eye. */
const short = (h: string) => h.slice(0, 12);

/**
 * The reason not to run against this server, or null if it can be trusted.
 *
 * Returns the message rather than throwing it, so the decision can be asserted
 * without a Playwright process around it.
 */
export function serverRefusal(
  baseURL: string,
  served: ServerIdentity,
  expectedRun: string,
  disk: SeedFingerprint
): string | null {
  if (!served.run || served.run !== expectedRun) {
    return [
      '',
      `The server answering on ${baseURL} is not the one this run started.`,
      '',
      `  this run started   ${expectedRun}`,
      `  the server says    ${served.run ?? 'nothing — it predates the run token'}`,
      '',
      'The harness starts its own dev server, on its own port and dist directory,',
      'and never reuses one. A reused server corrupted results twice: it kept',
      'answering from fixtures it had never reloaded (G-002), and it degraded',
      'from twenty tests a minute to one partway through a suite (G-035).',
      'Something else is answering on this port instead.',
      '',
      'Stop whatever owns the port and run again.',
      '',
    ].join('\n');
  }

  if (!served.seed) {
    return [
      '',
      `The server on ${baseURL} did not say what it seeded, so there is no way`,
      'to know whether it is serving the fixtures on disk. Every server this',
      'console starts reports its seed; one that does not is not this console.',
      '',
    ].join('\n');
  }

  if (served.seed.overall !== disk.overall) {
    const differing = fingerprintDiff(served.seed, disk);
    return [
      '',
      `The dev server on ${baseURL} seeded fixtures that are no longer the`,
      'ones on disk. It builds its seed at module load, so every assertion',
      'below would run against data you have already changed.',
      '',
      `  server seeded  ${short(served.seed.overall)}`,
      `  disk is        ${short(disk.overall)}`,
      '',
      '  differing in:',
      ...differing.map(
        (d) => `    ${d.part.padEnd(20)} server ${short(d.server)}   disk ${short(d.disk)}`
      ),
      '',
      'Run again: the harness starts a fresh server every time.',
      'A bite-proof taken against a stale seed proves nothing — G-002.',
      '',
    ].join('\n');
  }

  return null;
}
