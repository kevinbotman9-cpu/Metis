/**
 * Every date, count and amount the console shows, formatted in the tenant's
 * locale. G-092.
 *
 * Until 2026-09-13 there was no tenant locale anywhere. `'en-GB'` was written at
 * 77 call sites across 36 files, so a US tenant read every date day-first —
 * `05/09` was the fifth of September to the console and the ninth of May to the
 * customer reading it — and four files each carried their own copy of a
 * `GBP ? '£' : USD ? '$' : '€'` symbol map.
 *
 * The fix is not a different literal at each site. The tenant carries a locale
 * and a currency (`GET /tenants/{tenantId}/settings`), and this is the one
 * place that turns them into formatting. A call site says *what* it is showing —
 * a date, a count, an amount — and keeps its own choice of shape (short month,
 * seconds or not), which is a presentation decision about that surface; the
 * locale is never its to choose.
 *
 * `tests/unit/locale-formatting.test.ts` fails if a component, page or lib file
 * formats a date or number anywhere but here.
 */

export interface FormatSettings {
  /** BCP 47. */
  locale: string;
  /** ISO 4217, for an amount that carries no currency of its own. */
  currency: string;
}

type When = string | number | Date;

export interface Formatter {
  readonly locale: string;
  readonly currency: string;
  /** A number: `12,345` in en-US, `12.345` in de-DE. */
  number(n: number, options?: Intl.NumberFormatOptions): string;
  /** A calendar date. */
  date(value: When, options?: Intl.DateTimeFormatOptions): string;
  /** A date and a time. */
  dateTime(value: When, options?: Intl.DateTimeFormatOptions): string;
  /** A time of day. */
  time(value: When, options?: Intl.DateTimeFormatOptions): string;
  /** An amount that carries its own currency, in minor units. */
  money(m: { amount: number; currency: string }): string;
  /** Minor units with no currency of their own: the tenant's. */
  minor(amount: number): string;
}

const toDate = (value: When) => (value instanceof Date ? value : new Date(value));

/**
 * A formatter for one set of settings.
 *
 * Pure, so it can be tested and used outside React; `useFormat()` in
 * `components/tenant-format.tsx` is how a screen gets the tenant's.
 *
 * Minor units are divided by 100: `Money` holds GBP, USD and EUR, all of which
 * have two decimal places, and the settings endpoint refuses any other currency.
 */
export function formatterFor({ locale, currency }: FormatSettings): Formatter {
  return {
    locale,
    currency,
    number: (n, options) => n.toLocaleString(locale, options),
    date: (value, options) => toDate(value).toLocaleDateString(locale, options),
    dateTime: (value, options) => toDate(value).toLocaleString(locale, options),
    time: (value, options) => toDate(value).toLocaleTimeString(locale, options),
    money: (m) => (m.amount / 100).toLocaleString(locale, { style: 'currency', currency: m.currency }),
    minor: (amount) => (amount / 100).toLocaleString(locale, { style: 'currency', currency }),
  };
}
