import { describe, it, expect } from 'vitest';
import { summariseCreative } from '@/lib/creative-summary';
import { creatives } from '@/mocks/fixtures/catalogue';

/**
 * The line the content library shows for each creative.
 *
 * Worth its own test because it is the only place the five channel shapes are
 * flattened into one column, and the failure mode is quiet: pick the wrong key
 * and the list shows a from-address or a sender id, which reads as content and
 * is not.
 */
describe('summariseCreative', () => {
  it('takes the headline key each channel actually uses', () => {
    expect(summariseCreative({ content: { channel: 'email', subject: 'Your network, unlimited' } as never })).toBe(
      'Your network, unlimited'
    );
    expect(summariseCreative({ content: { channel: 'web', headline: '900Mb full fibre' } as never })).toBe(
      '900Mb full fibre'
    );
    expect(summariseCreative({ content: { channel: 'push', title: 'Data nearly gone' } as never })).toBe(
      'Data nearly gone'
    );
    expect(summariseCreative({ content: { channel: 'sms', text: 'Add 10GB for £8.' } as never })).toBe(
      'Add 10GB for £8.'
    );
    expect(summariseCreative({ content: { channel: 'outbound_call', script: 'Confirm the end date.' } as never })).toBe(
      'Confirm the end date.'
    );
  });

  it('never shows an address or a sender id as if it were content', () => {
    // The failure this exists to prevent: "first string wins" surfaces
    // `fromAddress` on an email whose subject is empty.
    const line = summariseCreative({
      content: {
        channel: 'email',
        subject: '',
        preheader: '',
        body: 'Hello.',
        fromName: 'Meridian',
        fromAddress: 'offers@meridian.example',
      } as never,
    });
    expect(line).toBe('—');
  });

  it('prefers the more specific key when a shape has several', () => {
    const line = summariseCreative({
      content: { channel: 'push', title: 'Data nearly gone', body: 'Add 10GB in two taps.' } as never,
    });
    expect(line).toBe('Data nearly gone');
  });

  it('says nothing rather than nothing-shaped', () => {
    // An empty cell and a failed load must not look the same.
    expect(summariseCreative({ content: { channel: 'web' } as never })).toBe('—');
    expect(summariseCreative({ content: undefined as never })).toBe('—');
  });

  it('finds a line for every creative in the catalogue', () => {
    // A fixture whose line is a dash is a fixture nobody can identify in a list.
    for (const c of creatives) {
      expect(summariseCreative(c), `${c.id} has no line to show`).not.toBe('—');
    }
  });
});
