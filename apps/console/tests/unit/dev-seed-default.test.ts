import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedPlanFromEnv } from '@/mocks/store';
import { seededEnv } from '../../scripts/dev-seeded';

/**
 * Which console a developer gets, and how they get the other one.
 *
 * Decided by the product owner on 2026-09-17: `npm run dev` starts with the
 * tenant's catalogue and **no decision history** — offers, placements,
 * creatives, policies and flows kept; the ledger empty — so the numbers on
 * screen come from using the product. Change sets, releases and approvals are
 * authoring artifacts, not decision history, and stay. The seeded tenant is one
 * command away, `npm run dev:seeded`.
 *
 * Both halves are read through `seedPlanFromEnv`, the function the store itself
 * calls, so this cannot agree with a parse the store does not share. That
 * function is also why `0` can mean off here at all: until 2026-09-17 the store
 * read `METIS_SEED_LEDGER=0` as "seed everything".
 */

/** The value `.env.development` gives `METIS_SEED_LEDGER`, as `next dev` reads the file. */
function devValue(): string | undefined {
  const file = readFileSync(resolve(__dirname, '../../.env.development'), 'utf8').replace(/\r\n/g, '\n');
  const line = file.split('\n').find((l) => /^\s*METIS_SEED_LEDGER\s*=/.test(l));
  return line === undefined ? undefined : line.slice(line.indexOf('=') + 1).trim();
}

describe('a developer console starts with no decision history', () => {
  it('npm run dev seeds nothing', () => {
    // Asserted as the plan, not as the string: `0`, `off` and an empty value
    // all mean no seed, and which one the file uses is not the point.
    expect(devValue(), '.env.development no longer mentions METIS_SEED_LEDGER').not.toBeUndefined();
    expect(seedPlanFromEnv(devValue()), 'npm run dev would seed a decision history').toBeNull();
  });

  it('npm run dev:seeded seeds the whole history', () => {
    const env = seededEnv({});
    // `{ count: undefined }` is the whole corpus; `null` would be none, and a
    // number would be a partial seed nobody asked for.
    expect(seedPlanFromEnv(env.METIS_SEED_LEDGER)).toEqual({ count: undefined });
  });

  it('keeps the rest of the caller’s environment', () => {
    // A launcher that replaced the environment would drop PATH, and `npx` would
    // not be found — a failure that reads as a broken Node install.
    const env = seededEnv({ PATH: '/usr/bin', METIS_DATA_CLASS: 'synthetic', METIS_SEED_LEDGER: '0' });
    expect(env.PATH).toBe('/usr/bin');
    expect(env.METIS_DATA_CLASS).toBe('synthetic');
    expect(env.METIS_SEED_LEDGER).toBe('1');
  });
});
