'use client';

import { EmptyState } from '@/components/ui/primitives';
import { useTenantHasDecisions } from '@/lib/tenant-history';

/**
 * What a screen shows before the tenant has decided anything.
 *
 * Two blanks look identical and mean opposite things. A filtered window that
 * matched nothing is a thing the reader can fix by changing the filter. A
 * tenant with no history at all is a thing the reader fixes by making a
 * decision happen, and telling them to widen a window sends them looking for a
 * control that will not help.
 *
 * **Every use of this says what will appear here.** "Nothing to show" is a
 * screen that cannot distinguish itself from a broken one; naming the figures
 * that will arrive, and what has to happen first, is the difference. The
 * product owner asked for exactly this on 2026-09-17, and it is the reason the
 * component takes `shows` rather than a description.
 */
export function NoDecisionsYet({
  /** What this screen will show, once there is a history. Two to four items. */
  shows,
  /**
   * What the reader does next, when this screen is not where they would start.
   * The storefront is the only surface in the product that makes a decision by
   * being used, so most screens point there.
   */
  action = 'storefront',
}: {
  shows: string[];
  action?: 'storefront' | 'none';
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-card py-12 text-center">
      <p className="text-body font-medium text-content">Nothing has been decided yet</p>

      <p className="max-w-md text-body text-content-muted">
        This tenant has no decision history. Nothing is wrong with this screen — a decision is
        made when a flow answers a request, and none has been asked for.
      </p>

      <div className="max-w-md text-left">
        <p className="mb-1 text-label font-medium text-content-subtle">What will appear here</p>
        <ul className="list-disc space-y-0.5 pl-4 text-label text-content-muted">
          {shows.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>

      {action === 'storefront' ? (
        <p className="mt-1 max-w-md text-label text-content-subtle">
          The{' '}
          {/* A static file under `public/`, not a route, so a plain anchor:
              `next/link` would attempt a client navigation to something the
              router does not have. */}
          <a href="/storefront/index.html" className="text-accent hover:underline">
            storefront demo
          </a>{' '}
          asks for a decision every time a page renders, which is the shortest way to put one
          here.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The same choice every ledger-backed screen makes, in one place.
 *
 * `hasHistory === undefined` is the query in flight. A screen must not claim a
 * tenant is new before the answer arrives: of the two sentences, "nothing has
 * ever happened here" is the worse one to show by mistake, and it flashes on
 * every load of a seeded tenant if this returns eagerly.
 */
export function useEmptyReason(): 'loading' | 'new-tenant' | 'filtered' {
  const hasHistory = useTenantHasDecisions();
  if (hasHistory === undefined) return 'loading';
  return hasHistory ? 'filtered' : 'new-tenant';
}

/** A filtered window that matched nothing, which is a different sentence. */
export function NothingInWindow({ description }: { description: string }) {
  return <EmptyState title="Nothing has been decided in this window" description={description} />;
}
