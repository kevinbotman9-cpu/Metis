import type { Provenance } from '@metis/client';
import { cn } from '@/lib/cn';

/**
 * Says whether the numbers below it describe anybody.
 *
 * The demo tenant crossed from obviously-fake to indistinguishable on
 * 2026-09-09: 10,400 decisions, 2,101 measured outcomes, plausible rates, and
 * realised value in pounds. The only marker was a badge in the corner of the
 * nav rail — which a screenshot of the report does not include, and which no
 * exported file or API response carried at all.
 *
 * So this sits **above the numbers**, inside the content column, at a width a
 * screenshot cannot crop without also losing the figures it is about. That is
 * the whole design constraint and it is worth being explicit about, because the
 * obvious placements — a corner chip, a footer, a tooltip — all fail it.
 *
 * It is deliberately not styled as an error. The demo tenant working is not a
 * fault; presenting its output as evidence is. So the tone is the one a caption
 * uses, not the one a warning uses, and it stays legible rather than loud.
 */
export function ProvenanceBanner({
  provenance,
  className,
}: {
  provenance: Provenance | null | undefined;
  className?: string;
}) {
  // Absent rather than assumed. A response with no provenance is a response
  // this component cannot vouch for, and inventing "recorded" would be the
  // exact false reassurance the banner exists to prevent.
  if (!provenance) return null;
  // Nothing to warn about when every figure came from something that happened.
  if (provenance.source === 'recorded') return null;

  const synthetic = provenance.source === 'synthetic';

  return (
    <div
      data-testid="provenance-banner"
      data-provenance={provenance.source}
      role="note"
      aria-label={synthetic ? 'Synthetic data' : 'Partly synthetic data'}
      className={cn(
        'mb-stack flex items-start gap-3 rounded-lg border px-card py-3',
        'border-hold/40 bg-hold-subtle text-body text-content',
        className
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 shrink-0 rounded border border-hold/50 px-1.5 py-0.5 text-label font-semibold uppercase tracking-wide text-hold"
      >
        {synthetic ? 'Synthetic' : 'Mixed'}
      </span>
      <p className="min-w-0">
        {provenance.note}
        {typeof provenance.syntheticCount === 'number' &&
        typeof provenance.recordedCount === 'number' &&
        provenance.source === 'mixed' ? (
          <span className="ml-1 text-content-muted">
            {provenance.syntheticCount.toLocaleString('en-GB')} generated,{' '}
            {provenance.recordedCount.toLocaleString('en-GB')} recorded.
          </span>
        ) : null}
      </p>
    </div>
  );
}
