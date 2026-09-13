import { describe, it, expect } from 'vitest';
import { formatterFor } from '@/lib/format';

/**
 * The tenant formatter. G-092.
 *
 * The point of a tenant locale is that the same instant and the same amount
 * read differently to different tenants, so these assert the *difference*,
 * with the zone pinned to UTC so the answer does not depend on the machine
 * running the test.
 *
 * ICU separates a trailing currency symbol with a no-break space; that is
 * normalised before comparing, because the claim here is about order and
 * separators, not about which space character ICU prefers this release.
 */

const plain = (s: string) => s.replace(/ | /g, ' ');

const US = formatterFor({ locale: 'en-US', currency: 'USD' });
const GB = formatterFor({ locale: 'en-GB', currency: 'GBP' });
const DE = formatterFor({ locale: 'de-DE', currency: 'EUR' });

/** The fifth of September, which en-GB and en-US write as each other's ninth of May. */
const WHEN = '2026-09-05T14:30:00Z';
const UTC = { timeZone: 'UTC' } as const;

describe('a date reads the way its tenant reads dates', () => {
  it('puts the month first for a US tenant and the day first for a UK one', () => {
    expect(US.date(WHEN, UTC)).toBe('9/5/2026');
    expect(GB.date(WHEN, UTC)).toBe('05/09/2026');
    expect(DE.date(WHEN, UTC)).toBe('5.9.2026');
  });

  it('keeps the shape a surface asked for, and only the locale moves', () => {
    const shape = { ...UTC, day: '2-digit', month: 'short', year: 'numeric' } as const;
    expect(US.date(WHEN, shape)).toBe('Sep 05, 2026');
    expect(GB.date(WHEN, shape)).toBe('05 Sept 2026');
  });

  it('formats a time on the tenant’s clock convention', () => {
    expect(US.time(WHEN, UTC)).toMatch(/^2:30:00\sPM$/);
    expect(GB.time(WHEN, UTC)).toBe('14:30:00');
  });
});

describe('a number and an amount read the way their tenant reads them', () => {
  it('groups thousands with the tenant’s separator', () => {
    expect(US.number(12345)).toBe('12,345');
    expect(DE.number(12345)).toBe('12.345');
  });

  it('renders an amount in its own currency, in the tenant’s locale', () => {
    const dollars = { amount: 123456, currency: 'USD' };
    expect(US.money(dollars)).toBe('$1,234.56');
    expect(plain(DE.money(dollars))).toBe('1.234,56 $');
  });

  it('renders minor units with no currency of their own in the tenant’s currency', () => {
    expect(US.minor(123456)).toBe('$1,234.56');
    expect(plain(DE.minor(123456))).toBe('1.234,56 €');
    expect(GB.minor(123456)).toBe('£1,234.56');
  });
});
