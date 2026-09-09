'use client';

import { cn } from '@/lib/cn';

/**
 * Channel coverage for an offer.
 *
 * A bare count answers "how many creatives" — which is not the question. The
 * question is whether this offer can be delivered at all, and on how much of
 * the channel set it is missing. Zero is not "one less than one"; it is a
 * different kind of fact, because the compiler refuses to publish a decision
 * flow whose candidate set includes an offer with no deliverable creative.
 *
 * So zero is rendered in the block colour across the full track rather than as
 * an empty bar. An empty bar reads as "nothing measured yet"; a full block bar
 * reads as "this is the problem", which is what it is.
 *
 * Retired offers pass `total: 0` and get no bar at all — coverage is not a
 * fact about something that can never be selected.
 */
export interface CoverageBarProps {
  /** Channels with at least one active creative. */
  covered: number;
  /** What could be covered. 0 means coverage is not applicable. */
  total: number;
  /** Suppresses the block styling for offers that can never be selected. */
  selectable?: boolean;
  /**
   * What is being counted. The catalogue list only knows how many creatives an
   * offer has, not which channels they are on — two could share one. So the
   * list says "creatives" and the drawer, which fetches them and can see the
   * channel on each, says "channels". Naming the unit is cheaper than a bar
   * that quietly claims more than the data supports.
   */
  noun?: string;
  className?: string;
}

export function coverageLabel(
  covered: number,
  total: number,
  selectable = true,
  noun = 'channels'
): string {
  if (total === 0) return 'not applicable';
  if (covered === 0 && selectable) return 'no creative — cannot be delivered';
  return `${covered} of ${total} ${noun}`;
}

export function CoverageBar({
  covered,
  total,
  selectable = true,
  noun = 'channels',
  className,
}: CoverageBarProps) {
  const blocked = covered === 0 && selectable;
  const pct = total === 0 ? 0 : Math.min(100, Math.round((covered / total) * 100));
  const label = coverageLabel(covered, total, selectable, noun);

  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span
        className="h-2 w-[4.5rem] shrink-0 overflow-hidden rounded-full bg-surface-sunken"
        // The bar is decoration; the text beside it carries the value, so the
        // track is hidden rather than given a redundant second announcement.
        aria-hidden="true"
      >
        <span
          className={cn('block h-full rounded-full', blocked ? 'bg-block' : 'bg-accent')}
          style={{ width: blocked ? '100%' : `${pct}%` }}
        />
      </span>
      <span
        className={cn(
          'whitespace-nowrap text-label tnum',
          blocked ? 'font-medium text-block' : 'text-content-subtle'
        )}
      >
        {total === 0 ? '—' : blocked ? 'none' : `${covered} of ${total}`}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
