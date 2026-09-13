'use client';

import type { OfferDto } from '@/lib/api-client';
import { useFormat } from '@/components/tenant-format';
import { cn } from '@/lib/cn';
import type { PanelProps } from '../panel';

/**
 * Whether this offer has any pricing at all.
 *
 * A tenant authored from a brief that names products and not prices has none —
 * `telco-us` is one, and G-089 says why none was invented. Rendering "$0.00"
 * beside a margin would state a financial claim nobody made.
 */
const unpriced = (f: OfferDto['financials']) => f.price.amount === 0 && f.cost.amount === 0;

/** `V = expectedMargin / 60000`, which is what the ranking function reads. */
const valueTerm = (m: OfferDto['financials']['expectedMargin']) => (m.amount / 60000).toFixed(3);

/**
 * `offers.figures` — what an offer is worth, and where it is used.
 *
 * The commercial figures the catalogue row cannot fit, and the one warning that
 * belongs with them: a negative margin, which the ranking function reads as
 * value, so the offer can never win an arbitration it shares with a commercial
 * one. Kept apart from reach, which has a different cause and a different fix.
 */
export function OfferFigures({ record, context }: PanelProps) {
  const format = useFormat();
  if (!record) return null;
  const offer = record as unknown as OfferDto;
  const f = offer.financials;
  const noPrice = unpriced(f);
  const { Link } = context;

  const facts: [string, string, boolean?][] = [
    ['Price', noPrice ? '— not supplied' : format.money(f.price)],
    ['Cost to serve', noPrice ? '— not supplied' : format.money(f.cost)],
    [noPrice ? 'Value term (V)' : 'Expected margin', noPrice ? valueTerm(f.expectedMargin) : format.money(f.expectedMargin), f.expectedMargin.amount < 0],
    ['Business boost', offer.boost.toFixed(2)],
    ['Term', f.termMonths > 0 ? `${f.termMonths} months` : 'No commitment'],
  ];

  return (
    <section aria-label="Figures" className="rounded border border-border p-3">
      <h3 className="mb-2 text-label font-semibold text-content-subtle">Figures</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {facts.map(([label, value, negative]) => (
          <div key={label} className="min-w-0">
            <dt className="text-label text-content-subtle">{label}</dt>
            <dd className={cn('tnum text-body font-medium', negative ? 'text-block' : 'text-content')}>{value}</dd>
          </div>
        ))}
      </dl>

      {f.expectedMargin.amount < 0 ? (
        <p className="mt-3 border-l-2 border-block bg-block-subtle px-3 py-2 text-label text-content-muted">
          <strong className="font-semibold text-block">Negative expected margin.</strong> The ranking function reads
          value from expected margin, so this can never win an arbitration it shares with a commercial offer. If it
          should be selectable it needs its own decision flow, not a boost.
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
        {/* At least 24px tall each: two text links stacked are a target too small to hit otherwise. */}
        <Link
          href={`/decisions?action=${encodeURIComponent(offer.key)}`}
          className="inline-flex min-h-6 items-center text-label text-accent underline-offset-2 hover:underline"
        >
          Decisions that selected this
        </Link>
        <Link
          href="/arbitration"
          className="inline-flex min-h-6 items-center text-label text-accent underline-offset-2 hover:underline"
        >
          Boosts affecting this
        </Link>
      </div>
    </section>
  );
}
