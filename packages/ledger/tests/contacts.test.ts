import { describe, it, expect } from 'vitest';
import { capsApply, readContacts } from '../src/contacts';

/**
 * ADR-021: when the platform reads a customer's contacts, and what a failed
 * read becomes.
 */

const constraintFlow = { nodes: [{ id: 'n1', type: 'source' }, { id: 'n2', type: 'constraint' }] } as never;
const cap = (over: Record<string, unknown> = {}) => ({ id: 'cp', active: true, channel: 'web', ...over });

describe('whether a decision reads the ledger', () => {
  it('reads when the flow has a constraint node and a cap is active on the channel', () => {
    expect(capsApply(constraintFlow, { frequencyPolicies: [cap()] } as never, 'web')).toBe(true);
    // A cap with no channel applies on every channel.
    expect(capsApply(constraintFlow, { frequencyPolicies: [cap({ channel: null })] } as never, 'sms')).toBe(true);
  });

  it('does not read when nothing could hold a candidate to a cap', () => {
    expect(capsApply({ nodes: [{ id: 'n1', type: 'source' }] } as never, { frequencyPolicies: [cap()] } as never, 'web')).toBe(false);
    expect(capsApply(constraintFlow, { frequencyPolicies: [cap({ channel: 'email' })] } as never, 'web')).toBe(false);
    expect(capsApply(constraintFlow, { frequencyPolicies: [cap({ active: false })] } as never, 'web')).toBe(false);
    expect(capsApply(constraintFlow, { frequencyPolicies: [] } as never, 'web')).toBe(false);
  });
});

describe('reading a customer’s contacts', () => {
  const q = { tenantId: 't', customerRef: 'cust_1', channel: 'web', occurredAt: '2026-06-30T12:00:00.000Z' };

  it('returns what the ledger counted, for the decision’s channel and time', async () => {
    const asked: unknown[] = [];
    const read = await readContacts(
      { contactsFor: async (query) => (asked.push(query), { day: 1, week: 2, month: 3 }) },
      q
    );
    expect(read).toEqual({ status: 'read', channel: 'web', withinPeriod: { day: 1, week: 2, month: 3 } });
    expect(asked).toEqual([{ tenantId: 't', customerRef: 'cust_1', channel: 'web', until: q.occurredAt }]);
  });

  it('reads each scoped cap on the channel as the contacts about the offers its scope covers (ADR-021 §9)', async () => {
    const catalogue = {
      offers: [
        { id: 'off_disney_plus', objectiveId: 'iss_crosssell', categoryId: 'grp_entertainment' },
        { id: 'off_netflix', objectiveId: 'iss_crosssell', categoryId: 'grp_entertainment' },
        { id: 'off_fios_gigabit', objectiveId: 'iss_acquire', categoryId: 'grp_broadband' },
      ],
      frequencyPolicies: [
        { id: 'cpol_web_daily', active: true, channel: 'web', scope: { level: 'tenant', targetId: null } },
        { id: 'cpol_disney_web', active: true, channel: 'web', scope: { level: 'offer', targetId: 'off_disney_plus' } },
        { id: 'cpol_entertainment', active: true, channel: null, scope: { level: 'category', targetId: 'grp_entertainment' } },
        // Another channel's scoped cap, and an inactive one: neither is read.
        { id: 'cpol_disney_email', active: true, channel: 'email', scope: { level: 'offer', targetId: 'off_disney_plus' } },
        { id: 'cpol_off', active: false, channel: 'web', scope: { level: 'offer', targetId: 'off_netflix' } },
      ],
    } as never;
    const asked: { offerIds?: readonly string[] }[] = [];
    const read = await readContacts(
      {
        contactsFor: async (query) => {
          asked.push(query);
          return query.offerIds ? { day: query.offerIds.length, week: 0, month: 0 } : { day: 9, week: 9, month: 9 };
        },
      },
      { ...q, catalogue }
    );
    expect(asked.map((a) => a.offerIds ?? null)).toEqual([
      null,
      ['off_disney_plus'],
      ['off_disney_plus', 'off_netflix'],
    ]);
    expect(read).toEqual({
      status: 'read',
      channel: 'web',
      withinPeriod: { day: 9, week: 9, month: 9 },
      scoped: {
        cpol_disney_web: { day: 1, week: 0, month: 0 },
        cpol_entertainment: { day: 2, week: 0, month: 0 },
      },
    });
  });

  it('is unavailable, never zero, when the ledger cannot be read, and says why to the caller only', async () => {
    const reported: unknown[] = [];
    const read = await readContacts(
      {
        contactsFor: async () => {
          throw new Error('connection terminated');
        },
      },
      q,
      (e) => reported.push((e as Error).message)
    );
    expect(read).toEqual({ status: 'unavailable', channel: 'web' });
    expect(reported).toEqual(['connection terminated']);
  });
});
