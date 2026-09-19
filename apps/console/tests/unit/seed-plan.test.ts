import { describe, it, expect } from 'vitest';
import { planSeed, type SeedRequest } from '@/mocks/seed-plan';

/**
 * The refusals around a destructive command — ADR-018 clause 3.
 *
 * Every case here is a way somebody could lose a ledger: a reset with no tenant
 * named, a reset against a real data class, a reset in a database holding
 * another tenant, an unaudited reset. The command is a few lines of wiring over
 * this function, so these are the checks that matter.
 */

const base: SeedRequest = {
  tenant: 'telco-us',
  reset: false,
  by: undefined,
  dataClass: 'synthetic',
  tenantsInLedger: [],
  existingForTenant: 0,
};

describe('seeding a ledger over PostgreSQL', () => {
  it('seeds a tenant whose ledger is empty', () => {
    expect(planSeed(base)).toEqual({ kind: 'seed' });
  });

  it('leaves a tenant that already holds decisions, and says how to replace them', () => {
    const plan = planSeed({ ...base, existingForTenant: 10_400 });
    expect(plan.kind).toBe('leave');
    expect((plan as { reason: string }).reason).toMatch(/already holds 10,?400 decisions|already holds 10400 decisions/);
    expect((plan as { reason: string }).reason).toMatch(/--reset --tenant telco-us --by/);
  });

  it('resets and seeds when the tenant is named, audited, and alone in the ledger', () => {
    expect(planSeed({ ...base, reset: true, by: 'marcus.webb', existingForTenant: 10_400 })).toEqual({
      kind: 'reset-and-seed',
    });
  });
});

describe('what it refuses', () => {
  const refusal = (over: Partial<SeedRequest>) => {
    const plan = planSeed({ ...base, ...over });
    expect(plan.kind, JSON.stringify(plan)).toBe('refuse');
    return (plan as { reason: string }).reason;
  };

  it('refuses without a tenant, with no default and no all-tenants form', () => {
    expect(refusal({ tenant: undefined })).toMatch(/--tenant <id>.*no default and no all-tenants form/s);
  });

  it('refuses a ledger that is not synthetic, seeding or resetting', () => {
    expect(refusal({ dataClass: 'real' })).toMatch(/not synthetic/);
    expect(refusal({ dataClass: undefined })).toMatch(/unset, not synthetic/);
    expect(refusal({ dataClass: 'real', reset: true, by: 'marcus.webb' })).toMatch(/real ledger is evidence/);
  });

  it('refuses an unaudited reset', () => {
    expect(refusal({ reset: true })).toMatch(/--by <who> is required/);
  });

  it('refuses a reset in a database holding another tenant, and names it', () => {
    const reason = refusal({
      reset: true,
      by: 'marcus.webb',
      tenantsInLedger: ['telco-us', 'telco-uk'],
    });
    expect(reason).toMatch(/also holds telco-uk/);
    expect(reason).toMatch(/append-only triggers are never bypassed/);
  });
});

/**
 * A history made by hand is not regenerable (ADR-019 §7, amended 2026-09-17).
 *
 * The product owner's durable console holds decisions somebody made by clicking
 * through the storefront, and ADR-019's reseed is the first thing that will ask
 * for a reset. Every refusal above protects a ledger that is real or shared;
 * this one protects a synthetic ledger that cannot be made again. Asked for on
 * 2026-09-18, before the reseed.
 */
describe('a reset of decisions made by hand', () => {
  const reset = { ...base, reset: true, by: 'marcus.webb', existingForTenant: 10_437 };

  it('refuses, says how many would go, and says how to discard them', () => {
    const plan = planSeed({ ...reset, madeByHand: 37 });
    expect(plan.kind).toBe('refuse');
    const reason = (plan as { reason: string }).reason;
    expect(reason).toMatch(/holds 37 decisions made by using the console/);
    expect(reason).toMatch(/nothing can regenerate them/);
    expect(reason).toMatch(/--discard-made-by-hand 37\b/);
  });

  it('refuses a count that is not exactly the one the ledger holds', () => {
    // A number typed from memory, or from yesterday, is not an acknowledgement
    // of what is about to be lost.
    const plan = planSeed({ ...reset, madeByHand: 37, discardMadeByHand: 36 });
    expect(plan.kind).toBe('refuse');
    expect((plan as { reason: string }).reason).toMatch(/said 36; it must be exactly 37/);
    expect(planSeed({ ...reset, madeByHand: 37, discardMadeByHand: 38 }).kind).toBe('refuse');
  });

  it('resets when the exact count is acknowledged', () => {
    expect(planSeed({ ...reset, madeByHand: 37, discardMadeByHand: 37 })).toEqual({ kind: 'reset-and-seed' });
  });

  it('resets and seeds nothing when asked for an empty ledger', () => {
    expect(planSeed({ ...reset, empty: true })).toEqual({ kind: 'reset' });
    // Every refusal still stands in front of it.
    expect(planSeed({ ...reset, empty: true, madeByHand: 3 }).kind).toBe('refuse');
    expect(planSeed({ ...reset, empty: true, dataClass: 'real' }).kind).toBe('refuse');
  });

  it('refuses --empty without --reset, rather than seeding or doing nothing', () => {
    const plan = planSeed({ ...base, empty: true });
    expect(plan.kind).toBe('refuse');
    expect((plan as { reason: string }).reason).toMatch(/needs --reset/);
  });

  it('asks nothing of a ledger holding only the seeded history', () => {
    expect(planSeed({ ...reset, madeByHand: 0 })).toEqual({ kind: 'reset-and-seed' });
  });

  it('still refuses first for a real ledger or a second tenant, whatever is acknowledged', () => {
    expect(planSeed({ ...reset, madeByHand: 1, discardMadeByHand: 1, dataClass: 'real' }).kind).toBe('refuse');
    const shared = planSeed({ ...reset, madeByHand: 1, discardMadeByHand: 1, tenantsInLedger: ['telco-us', 'telco-uk'] });
    expect((shared as { reason: string }).reason).toMatch(/also holds telco-uk/);
  });
});
