import type { Formatter } from '@/lib/format';

/** The served field, as the generated client types it. */
type ContactsRead = {
  status: 'read' | 'unavailable';
  channel: string;
  withinPeriod?: { day: number; week: number; month: number };
  scoped?: Record<string, { day: number; week: number; month: number }>;
};
import { channelLabel } from '@/lib/loop';

/**
 * What a trace says about the contact history its caps were held to. ADR-021 §5.
 *
 * Four statements, and the product owner's rule is that the first two never read
 * alike: a decision the platform did not read for, and one it read for and found
 * nothing. The first says the caps saw only what a caller sent; the second that
 * the platform looked and the customer was clear.
 */
export interface ContactHistoryStatement {
  kind: 'not_read' | 'no_caps' | 'read_none' | 'read' | 'unavailable';
  tone: 'neutral' | 'hold' | 'block';
  text: string;
}

export function contactHistoryStatement(
  read: ContactsRead | undefined,
  capsApplied: readonly string[],
  format: Formatter
): ContactHistoryStatement {
  if (!read) {
    return capsApplied.length === 0
      ? { kind: 'no_caps', tone: 'neutral', text: 'No frequency policy applied, so the platform did not read the contact history.' }
      : {
          kind: 'not_read',
          tone: 'hold',
          text: 'Not read from the ledger. The caps counted only what the caller sent.',
        };
  }
  const channel = channelLabel(read.channel);
  if (read.status === 'unavailable' || !read.withinPeriod) {
    return {
      kind: 'unavailable',
      tone: 'block',
      text: `Could not be read from the ledger for ${channel}. Every offer a cap covers was held back rather than treated as never contacted.`,
    };
  }
  const { day, week, month } = read.withinPeriod;
  if (month === 0) {
    return {
      kind: 'read_none',
      tone: 'neutral',
      text: `Read from the ledger for ${channel}: no contacts in the last 30 days.`,
    };
  }
  // A cap scoped to an offer, category or objective was held to the contacts
  // about its scope, not the channel's (ADR-021 §9), and the trace says which
  // count each one saw rather than leaving the channel's to stand for all.
  const scoped = Object.entries(read.scoped ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, w]) =>
        `${id}: ${format.number(w.day)} in 24 hours, ${format.number(w.week)} in 7 days, ${format.number(w.month)} in 30 days`
    );
  return {
    kind: 'read',
    tone: 'neutral',
    text:
      `Read from the ledger for ${channel}: ${format.number(day)} in the last 24 hours, ` +
      `${format.number(week)} in 7 days, ${format.number(month)} in 30 days — added to what the caller sent.` +
      (scoped.length > 0
        ? ` Caps scoped narrower than the channel counted only the contacts about their scope — ${scoped.join('; ')}.`
        : ''),
  };
}
