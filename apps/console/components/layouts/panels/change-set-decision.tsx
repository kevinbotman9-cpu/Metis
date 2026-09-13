'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import type { PanelProps } from '../panel';

const STATUS_TONE: Record<string, 'pass' | 'block' | 'hold' | 'neutral'> = {
  approved: 'pass',
  rejected: 'block',
  pending: 'hold',
  withdrawn: 'neutral',
};

/**
 * `change-sets.decision` — approve or reject the open change set.
 *
 * Offered only to somebody holding `approve:changes`. Anybody else sees which
 * permission the decision needs, rather than a button that answers 403 — and the
 * server refuses too, which `permissions-and-writes.spec.ts` asserts separately.
 * Approving applies the diff, so what the diff touches goes stale with it.
 */
export function ChangeSetDecision({ record, recordId, context }: PanelProps) {
  const queryClient = useQueryClient();
  const settle = () => {
    for (const key of [['change-sets'], ['targeting-policies'], ['audit']]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
  const approve = useMutation({ mutationFn: () => apiClient.approveChangeSet(String(recordId)), onSuccess: settle });
  const reject = useMutation({
    mutationFn: () => apiClient.rejectChangeSet(String(recordId), 'Rejected from the console.'),
    onSuccess: settle,
  });

  if (!record) return null;
  const decided = approve.data ?? reject.data;
  const status = decided?.status ?? String(record.status);
  const busy = approve.isPending || reject.isPending;
  const failed = approve.error ?? reject.error;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>
      {status === 'pending' ? (
        context.permissions.includes('approve:changes') ? (
          <>
            <Button variant="danger" size="sm" onClick={() => reject.mutate()} disabled={busy}>
              {reject.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
            <Button variant="primary" size="sm" onClick={() => approve.mutate()} disabled={busy}>
              {approve.isPending ? 'Approving…' : 'Approve'}
            </Button>
          </>
        ) : (
          <Badge tone="outline">approve:changes required</Badge>
        )
      ) : null}
      {decided ? (
        <p
          role="status"
          className={cn(
            'basis-full rounded border px-3 py-2 text-body font-medium',
            decided.status === 'approved' ? 'border-pass/40 bg-pass-subtle text-pass' : 'border-block/40 bg-block-subtle text-block'
          )}
        >
          {decided.status === 'approved'
            ? 'Approved. The change will publish on the next artifact promotion.'
            : 'Rejected. Nothing was published.'}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="basis-full rounded border border-block/40 bg-block-subtle px-3 py-2 text-body text-block">
          {failed instanceof ApiError ? failed.message : 'Could not record the decision.'}
        </p>
      ) : null}
    </div>
  );
}
