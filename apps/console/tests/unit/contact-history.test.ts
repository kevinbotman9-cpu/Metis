import { describe, it, expect } from 'vitest';
import { contactHistoryStatement } from '@/lib/contact-history';
import { formatterFor } from '@/lib/format';

/**
 * What a trace says about the contact history its caps were held to. ADR-021 §5,
 * and the product owner's rule: a decision the platform did not read for and one
 * it read for and found nothing must never render the same way.
 */

const F = formatterFor({ locale: 'en-US', currency: 'USD' });
const CAPS = ['cpol_web_daily'];

describe('the contact history a trace states', () => {
  const notRead = contactHistoryStatement(undefined, CAPS, F);
  const noCaps = contactHistoryStatement(undefined, [], F);
  const none = contactHistoryStatement({ status: 'read', channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } }, CAPS, F);
  const some = contactHistoryStatement({ status: 'read', channel: 'web', withinPeriod: { day: 2, week: 5, month: 9 } }, CAPS, F);
  const unavailable = contactHistoryStatement({ status: 'unavailable', channel: 'web' }, CAPS, F);

  it('says each of its states in its own words', () => {
    expect(notRead.text).toBe('Not read from the ledger. The caps counted only what the caller sent.');
    expect(none.text).toBe('Read from the ledger for Web: no contacts in the last 30 days.');
    expect(some.text).toBe('Read from the ledger for Web: 2 in the last 24 hours, 5 in 7 days, 9 in 30 days — added to what the caller sent.');
    expect(unavailable.text).toBe(
      'Could not be read from the ledger for Web. Every offer a cap covers was held back rather than treated as never contacted.'
    );
    expect(noCaps.text).toBe('No frequency policy applied, so the platform did not read the contact history.');
  });

  it('never renders "not read" like "read, and found none"', () => {
    expect(notRead.kind).not.toBe(none.kind);
    expect(notRead.text).not.toBe(none.text);
    expect(notRead.tone).not.toBe(none.tone);
    const all = [notRead, noCaps, none, some, unavailable];
    expect(new Set(all.map((s) => s.text)).size).toBe(all.length);
    expect(new Set(all.map((s) => s.kind)).size).toBe(all.length);
  });
});
