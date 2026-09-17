'use client';

import { useTenantHasDecisions } from '@/lib/tenant-history';

/**
 * What a screen says when the ledger has nothing for it — **above the screen,
 * never instead of it.**
 *
 * The rule, from the product owner on 2026-09-17: *data can be zero; structure
 * cannot vanish.* The first version of these empty states replaced each
 * screen's content with a paragraph and a list headed "What will appear here",
 * so a new user was told about a rail, a funnel and three value cards they
 * could not see. The screens now render their structure at zero — the rail's
 * five stages reading 0, the funnel drawn empty, the cards present — and this
 * note sits above it and says why the numbers are zero. Once the thing itself
 * is on screen, a list describing it is redundant, so there is no list.
 *
 * Two blanks still look alike and mean opposite things, which is why the note
 * has two sentences. A filtered window that matched nothing is the reader's to
 * fix by changing the filter. A tenant with no history is fixed by making a
 * decision happen, and telling that reader to widen a window sends them looking
 * for a control that will not help.
 */
export function EmptyLedgerNote({
  reason,
  filtered,
}: {
  /** From `useEmptyReason`; `'loading'` renders nothing. */
  reason: EmptyReason;
  /** What to say when the tenant has a history and this view's filters exclude all of it. */
  filtered?: string;
}) {
  if (reason === 'loading') return null;

  if (reason === 'filtered') {
    return (
      <div className="mb-stack rounded-lg border border-border bg-surface px-card py-3">
        <p className="text-body font-medium text-content">Nothing has been decided in this window</p>
        {filtered ? <p className="mt-0.5 text-label text-content-muted">{filtered}</p> : null}
      </div>
    );
  }

  return (
    <div className="mb-stack rounded-lg border border-border bg-surface px-card py-3">
      <p className="text-body font-medium text-content">Nothing has been decided yet</p>
      <p className="mt-0.5 text-label text-content-muted">
        This tenant has no decision history, so every figure below reads zero until a flow answers a
        request. Nothing is wrong with this screen. The{' '}
        {/* A static file under `public/`, not a route, so a plain anchor:
            `next/link` would attempt a client navigation to something the
            router does not have. */}
        <a href="/storefront/index.html" className="text-accent hover:underline">
          storefront demo
        </a>{' '}
        asks for a decision every time a page renders.
      </p>
    </div>
  );
}

/**
 * The one screen that cannot render its structure at zero: a single decision's
 * trace, reached by an id that does not resolve.
 *
 * Every other ledger screen summarises a population, and a population can be
 * empty. A trace is one record — its candidates, the rules that removed them,
 * the ranking terms, the chain hash — and every part of it is *of* that record.
 * Drawn at zero it would be a trace of a decision that was never made, which is
 * the one thing a trace must never show. So this screen keeps a not-found state,
 * and keeps naming what a trace holds, because here — alone — the structure is
 * not on screen to speak for itself.
 */
export function NoTraceYet({ shows }: { shows: string[] }) {
  return (
    <div className="flex flex-col items-center gap-3 px-card py-12 text-center">
      <p className="text-body font-medium text-content">Nothing has been decided yet</p>
      <p className="max-w-md text-body text-content-muted">
        This tenant has no decision history, so no link to a decision can resolve. Nothing is wrong with
        this screen — a trace exists once a flow answers a request.
      </p>
      <div className="max-w-md text-left">
        <p className="mb-1 text-label font-medium text-content-subtle">What a trace shows</p>
        <ul className="list-disc space-y-0.5 pl-4 text-label text-content-muted">
          {shows.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export type EmptyReason = 'loading' | 'new-tenant' | 'filtered';

/**
 * Which of the two blanks a screen is showing.
 *
 * `'loading'` while the tenant-level question is in flight: a screen must not
 * claim a tenant is new before the answer arrives, because of the two sentences
 * "nothing has ever happened here" is the worse one to flash by mistake.
 */
export function useEmptyReason(): EmptyReason {
  const hasHistory = useTenantHasDecisions();
  if (hasHistory === undefined) return 'loading';
  return hasHistory ? 'filtered' : 'new-tenant';
}
