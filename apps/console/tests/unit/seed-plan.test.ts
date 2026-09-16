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
