import { describe, it, expect } from 'vitest';
import { seedPlanFromEnv } from '@/mocks/store';

/**
 * `METIS_SEED_LEDGER` decides whether a console starts with a decision history.
 *
 * Until 2026-09-17 the call site was `if (process.env.METIS_SEED_LEDGER)`. An
 * environment variable is a string, so `METIS_SEED_LEDGER=0` took the branch —
 * `"0"` is truthy — parsed to `0`, failed the `> 1` test that selects a partial
 * seed, and fell through to `undefined`, which means the whole corpus. The one
 * value a person reaches for to turn seeding off seeded all 10,400 decisions.
 *
 * It failed silently, which is what makes it worth a test rather than a
 * one-line fix: the startup line reports what was seeded and nothing reports
 * that it was not asked for, so the only visible symptom was a console that
 * took twelve seconds to start and was full of decisions the person had asked
 * not to have.
 *
 * `null` means seed nothing. A plan with `count: undefined` means the whole
 * history, which is what `seedLedger` reads an absent count as.
 */

describe('METIS_SEED_LEDGER decides whether anything is seeded', () => {
  describe('off means off', () => {
    // `'0'` is the regression. The rest are here because a person who reaches
    // for one reaches for the others, and a flag that honours one spelling of
    // off and silently inverts another is the same defect wearing a different
    // string.
    it.each(['0', '', ' ', 'false', 'FALSE', 'no', 'off', 'Off'])(
      'seeds nothing for %o',
      (raw) => {
        expect(seedPlanFromEnv(raw)).toBeNull();
      }
    );

    it('seeds nothing when the variable is absent', () => {
      expect(seedPlanFromEnv(undefined)).toBeNull();
    });
  });

  describe('on means the whole history', () => {
    it.each(['1', 'true', 'yes', 'on'])('seeds every decision for %o', (raw) => {
      // `count: undefined` is not "seed none". `seedLedger` reads an absent
      // count as the whole corpus, which is why the distinction between this
      // and `null` above is the entire point of the function.
      expect(seedPlanFromEnv(raw)).toEqual({ count: undefined });
    });
  });

  describe('a number is a count', () => {
    it('seeds the number asked for', () => {
      expect(seedPlanFromEnv('300')).toEqual({ count: 300 });
      expect(seedPlanFromEnv('10400')).toEqual({ count: 10_400 });
    });

    it('treats 1 as the whole history rather than a single decision', () => {
      // `.env.development` and `playwright.config.ts` both say `1`, and both
      // mean "seed it". A one-decision corpus is not a thing anyone has asked
      // for, and reading `1` as one would have emptied every seeded run.
      expect(seedPlanFromEnv('1')).toEqual({ count: undefined });
    });

    it('ignores surrounding space, which a .env file leaves behind', () => {
      expect(seedPlanFromEnv(' 300 ')).toEqual({ count: 300 });
      expect(seedPlanFromEnv(' 0 ')).toBeNull();
    });
  });
});
