'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

/**
 * Has this tenant ever decided anything?
 *
 * Seven screens read the ledger, and until 2026-09-17 not one of them had been
 * seen empty by a check: the e2e harness seeds 10,400 decisions before the
 * first test and the warm-up fails if it does not, so the state every new
 * tenant starts in was the one state nothing exercised.
 *
 * The three screens that had an empty state gave filter advice for it —
 * *"Narrow the filters or widen the window"*, *"Choose another flow"* — which
 * is the right sentence for a window that matched nothing and the wrong one
 * for a tenant that has never decided. A person who has just been provisioned
 * reads it as a broken screen and goes looking for the filter that is not
 * there. That is the blank-because-new against blank-because-broken
 * distinction, and a screen cannot make it from its own filtered count alone.
 *
 * So: the unfiltered total, which the ledger counts rather than pages
 * (`store.ledger.count`), asked for with `limit: 1` because the rows are not
 * wanted — only whether there are any. One query key for every screen, so the
 * seven ask once between them.
 *
 * `undefined` while it is in flight: a screen must not claim a tenant is new
 * before the answer arrives, because "nothing has ever happened here" is the
 * more alarming of the two sentences to show by mistake.
 */
export function useTenantHasDecisions(): boolean | undefined {
  const { data } = useQuery({
    queryKey: ['tenant-has-decisions'],
    queryFn: () => apiClient.searchDecisions({ limit: 1 }),
    // The answer flips once, the first time a flow answers a request, and
    // nothing on these screens is worth a refetch to catch it a minute sooner.
    staleTime: 5 * 60 * 1000,
  });
  return data ? data.total > 0 : undefined;
}
