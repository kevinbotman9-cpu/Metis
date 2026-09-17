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
