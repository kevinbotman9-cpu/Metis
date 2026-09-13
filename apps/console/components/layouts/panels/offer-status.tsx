'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/primitives';
import { apiClient, ApiError } from '@/lib/api-client';
import type { PanelProps } from '../panel';

/**
 * `offers.status` — activate or pause the open offer.
 *
 * In the detail pane's actions rather than the edit form, because the reason it
 * can be refused is in the same pane: an offer with no active creative cannot go
 * active, and its creatives are one tab away. The server's message is shown as
 * it is — it names the offer and says what to do, and paraphrasing it here would
 * be a second place to keep that wording right.
 */
export function OfferStatus({ record, recordId, context }: PanelProps) {
  const queryClient = useQueryClient();
  const setStatus = useMutation({
    mutationFn: (status: string) => apiClient.updateOffer(String(recordId), { status } as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer', recordId] });
    },
  });

  if (!record) return null;
  const status = String(record.status);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <StatusBadge status={status} />
      {context.canEdit('Offer') ? (
        <>
          {/* `createChangeSet` exists, and proposing one means building a diff
              of what would change — the approval surface reads a diff, not a
              form. Disabled with the reason until that is built. */}
          <Button
            variant="secondary"
            size="sm"
            disabled
            title="Not built: proposing a change set from this screen needs a diff builder."
          >
            Request change
          </Button>
          {status === 'active' ? (
            <Button variant="secondary" size="sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate('paused')}>
              Pause
            </Button>
          ) : (
            <Button variant="primary" size="sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate('active')}>
              Activate
            </Button>
          )}
        </>
      ) : null}
      {setStatus.error instanceof ApiError ? (
        <p
          role="alert"
          className="basis-full rounded border border-block/40 bg-block-subtle px-3 py-2 text-body text-block"
        >
          {setStatus.error.message}
        </p>
      ) : null}
    </div>
  );
}
