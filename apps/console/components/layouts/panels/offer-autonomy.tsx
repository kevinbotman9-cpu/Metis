'use client';

import { AutonomyBadge, ErrorState, LoadingState } from '@/components/ui/primitives';
import type { OfferDetailDto } from '@/lib/api-client';
import type { PanelProps } from '../panel';

type Autonomy = NonNullable<OfferDetailDto['autonomy']>;

/**
 * `offers.autonomy` — the autonomy an agent has over this offer, and why.
 *
 * Resolved most-specific-first by the platform — offer, then category, then
 * objective, then tenant — so the level shown may be inherited, and the scope it
 * came from is said rather than implied. Read from the one-offer source, because
 * only `getOffer` resolves it.
 */
export function OfferAutonomy({ occupant, context }: PanelProps) {
  const source = context.sources[String(occupant.params?.source)];
  const { Link } = context;

  let body;
  if (!source || source.status === 'loading') body = <LoadingState label="Loading autonomy" />;
  else if (source.status === 'error') body = <ErrorState title="Could not resolve autonomy" />;
  else {
    const autonomy = source.rows[0] as unknown as Autonomy | undefined;
    body = autonomy ? (
      <>
        <div className="flex items-center gap-2">
          <AutonomyBadge level={autonomy.level} />
          <span className="text-label text-content-muted">inherited from {autonomy.scope.level}</span>
        </div>
        <p className="mt-2 text-body text-content-muted">{autonomy.rationale}</p>
        <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-label">
          <div className="flex justify-between gap-2">
            <dt className="text-content-subtle">Blast radius</dt>
            <dd className="tnum">{autonomy.guardrails.maxBlastRadiusPct}%</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-content-subtle">Max boost delta</dt>
            <dd className="tnum">±{(autonomy.guardrails.maxBoostDelta * 100).toFixed(0)}%</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-content-subtle">Bias gate</dt>
            <dd className="tnum">{autonomy.guardrails.biasGateThreshold.toFixed(2)}</dd>
          </div>
        </dl>
      </>
    ) : (
      <p className="text-body text-content-muted">No autonomy setting resolves for this offer.</p>
    );
  }

  return (
    <section aria-label="Agentic autonomy" className="rounded border border-border p-3">
      <h3 className="mb-2 text-label font-semibold text-content-subtle">Agentic autonomy</h3>
      {body}
      <Link href="/agentic" className="mt-3 inline-flex min-h-6 items-center text-label text-accent underline-offset-2 hover:underline">
        Manage autonomy
      </Link>
    </section>
  );
}
