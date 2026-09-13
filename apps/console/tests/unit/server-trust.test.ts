import { describe, it, expect } from 'vitest';
import { serverRefusal } from '../server-trust';
import type { SeedFingerprint } from '@/mocks/fixtures/fingerprint';

/**
 * The refusals, without a server.
 *
 * G-095 recorded that the check deciding whether every other check can be
 * trusted was proved by hand once and exercised by nothing. The decision now
 * lives in a pure function, so each refusal is asserted here and a refactor
 * that quietly stops one from refusing fails this file.
 *
 * What this still does not cover is the wiring: that `global-setup.ts` calls
 * the function, and that the server really echoes its token. The first is one
 * line; the second is proved in `e2e-harness.test.ts` by what the config hands
 * the server, and end to end by the suite refusing a foreign listener.
 */

const URL = 'http://localhost:3200';
const RUN = 'run-5f0c';

const seed = (parts: Record<string, string>): SeedFingerprint => ({
  overall: Object.entries(parts)
    .map(([k, v]) => `${k}=${v}`)
    .join(';')
    .padEnd(64, '0'),
  parts,
});

const DISK = seed({ connectors: 'c'.repeat(64), offers: 'o'.repeat(64) });

describe('a server this run did not start is refused', () => {
  it('trusts the server this run started, serving the fixtures on disk', () => {
    expect(serverRefusal(URL, { run: RUN, seed: DISK }, RUN, DISK)).toBeNull();
  });

  it('refuses a server that carries no run token, and says it predates one', () => {
    const message = serverRefusal(URL, { seed: DISK }, RUN, DISK);
    expect(message).toMatch(/not the one this run started/);
    expect(message).toMatch(/predates the run token/);
    expect(message).toContain(RUN);
  });

  it('refuses a server started by another run, naming both tokens', () => {
    const message = serverRefusal(URL, { run: 'run-other', seed: DISK }, RUN, DISK);
    expect(message).toContain(RUN);
    expect(message).toContain('run-other');
  });

  it('checks the token before the seed, because a foreign server’s seed is beside the point', () => {
    const stale = seed({ connectors: 'x'.repeat(64), offers: 'o'.repeat(64) });
    const message = serverRefusal(URL, { run: 'run-other', seed: stale }, RUN, DISK);
    expect(message).toMatch(/not the one this run started/);
    expect(message).not.toMatch(/differing in/);
  });
});

describe('a server serving other fixtures is refused', () => {
  it('names the part that differs, both sides', () => {
    const stale = seed({ connectors: 'x'.repeat(64), offers: 'o'.repeat(64) });
    const message = serverRefusal(URL, { run: RUN, seed: stale }, RUN, DISK)!;
    expect(message).toMatch(/differing in:/);
    // The part that moved, and only that one.
    expect(message).toMatch(/connectors\s+server x{12}\s+disk c{12}/);
    expect(message).not.toMatch(/offers\s+server/);
  });

  it('refuses a server that does not say what it seeded', () => {
    expect(serverRefusal(URL, { run: RUN }, RUN, DISK)).toMatch(/did not say what it seeded/);
  });
});
