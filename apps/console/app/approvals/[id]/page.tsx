'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Metric,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';

const STATUS_TONE: Record<string, 'pass' | 'block' | 'hold' | 'neutral'> = {
  approved: 'pass',
  rejected: 'block',
  pending: 'hold',
  withdrawn: 'neutral',
};

function ChangeRequestDetail({ id }: { id: string }) {
  const { hasPermission } = useAuth();
  const canApprove = hasPermission('approve:changes');
  const queryClient = useQueryClient();

  const { data: cr, isLoading, error, refetch } = useQuery({
    queryKey: ['change-request', id],
    queryFn: () => apiClient.getChangeRequest(id),
    retry: false,
  });

  const approve = useMutation({
    mutationFn: () => apiClient.approveChangeRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['change-request', id] }),
  });

  const reject = useMutation({
    mutationFn: () => apiClient.rejectChangeRequest(id, 'Rejected from the console.'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['change-request', id] }),
  });

  if (isLoading) {
    return (
      <PageBody>
        <LoadingState label="Loading change request" />
      </PageBody>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <PageBody>
        <PageHeader
          title="Change request"
          breadcrumb={
            <Link href="/approvals" className="text-label text-accent hover:underline">
              ← Approvals
            </Link>
          }
        />
        {notFound ? (
          <Card>
            <EmptyState
              title={`No change request with ID ${id}`}
              action={
                <Link href="/approvals">
                  <Button variant="primary">Back to approvals</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <ErrorState description={(error as Error).message} onRetry={() => refetch()} />
        )}
      </PageBody>
    );
  }

  if (!cr) return null;

  const decided = approve.data ?? reject.data;
  const status = decided?.status ?? cr.status;
  const isPending = status === 'pending';
  const byAgent = cr.requestedBy.startsWith('agent-');

  return (
    <PageBody>
      <PageHeader
        breadcrumb={
          <Link href="/approvals" className="text-label text-accent hover:underline">
            ← Approvals
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {cr.title}
            <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>
          </span>
        }
        description={cr.description}
        actions={
          isPending && canApprove ? (
            <>
              <Button
                variant="danger"
                size="md"
                onClick={() => reject.mutate()}
                disabled={reject.isPending || approve.isPending}
              >
                {reject.isPending ? 'Rejecting…' : 'Reject'}
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => approve.mutate()}
                disabled={approve.isPending || reject.isPending}
              >
                {approve.isPending ? 'Approving…' : 'Approve'}
              </Button>
            </>
          ) : isPending ? (
            <Badge tone="outline">approve:changes required</Badge>
          ) : null
        }
      />

      {decided && (
        <div
          className={cn(
            'mb-stack rounded border px-card py-3',
            decided.status === 'approved'
              ? 'border-pass/40 bg-pass-subtle'
              : 'border-block/40 bg-block-subtle'
          )}
        >
          <p
            className={cn(
              'text-body font-medium',
              decided.status === 'approved' ? 'text-pass' : 'text-block'
            )}
          >
            {decided.status === 'approved'
              ? 'Approved. The change will publish on the next artifact promotion.'
              : 'Rejected. Nothing was published.'}
          </p>
        </div>
      )}

      <div className="grid gap-stack lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-stack">
          <Card>
            <CardHeader
              title="Proposed diff"
              description="Exactly what changes if this is approved."
            />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-body">
                  <thead>
                    <tr className="border-b border-border text-label uppercase tracking-wide text-content-subtle">
                      <th className="px-cell py-2 text-left font-semibold">Field</th>
                      <th className="px-cell py-2 text-left font-semibold">Before</th>
                      <th className="px-cell py-2 text-left font-semibold">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cr.diff.map((d) => (
                      <tr key={d.field} className="border-b border-border/60">
                        <td className="px-cell py-cell-y font-mono text-label">{d.field}</td>
                        <td className="px-cell py-cell-y">
                          <code className="rounded-sm bg-block-subtle px-1.5 py-0.5 font-mono text-label text-block">
                            {d.before}
                          </code>
                        </td>
                        <td className="px-cell py-cell-y">
                          <code className="rounded-sm bg-pass-subtle px-1.5 py-0.5 font-mono text-label text-pass">
                            {d.after}
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {cr.simulation && (
            <Card
              className={cn(
                cr.simulation.passed ? '' : 'border-block/50'
              )}
            >
              <CardHeader
                title="Simulation"
                description="Replayed against a historical population before anything ships."
                actions={
                  <Badge tone={cr.simulation.passed ? 'pass' : 'block'}>
                    {cr.simulation.passed ? 'passed' : 'failed'}
                  </Badge>
                }
              />
              <CardBody>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <Metric
                    label="Population"
                    value={cr.simulation.populationSize.toLocaleString('en-GB')}
                    sub="customers replayed"
                  />
                  <Metric
                    label="Margin impact"
                    value={cr.simulation.projectedMarginDelta}
                    tone={
                      cr.simulation.projectedMarginDelta.trim().startsWith('-')
                        ? 'block'
                        : 'pass'
                    }
                  />
                  <Metric
                    label="Bias ratio"
                    value={cr.simulation.biasRatio.toFixed(2)}
                    tone={cr.simulation.biasRatio > 1.2 ? 'block' : 'pass'}
                    sub="gate 1.20"
                  />
                </div>
                <p
                  className={cn(
                    'mt-3 rounded border px-3 py-2 text-body',
                    cr.simulation.passed
                      ? 'border-border bg-surface-sunken text-content-muted'
                      : 'border-block/40 bg-block-subtle text-block'
                  )}
                >
                  {cr.simulation.notes}
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-stack">
          <Card>
            <CardHeader title="Provenance" />
            <CardBody>
              <dl className="space-y-2 text-body">
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Raised by</dt>
                  <dd className="flex items-center gap-1.5">
                    <Badge tone={byAgent ? 'accent' : 'outline'}>
                      {byAgent ? 'agent' : 'person'}
                    </Badge>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-content-subtle">Identity</dt>
                  <dd className="truncate text-right font-mono text-label">{cr.requestedBy}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Raised at</dt>
                  <dd>{new Date(cr.requestedAt).toLocaleString('en-GB')}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Autonomy tier</dt>
                  <dd>Tier {cr.autonomyTier}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Change type</dt>
                  <dd>{cr.changeType.replace(/_/g, ' ')}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Scope</dt>
                  <dd className="text-right">
                    <Badge tone="outline">{cr.targetScope.level}</Badge>
                    {cr.targetScope.targetId && (
                      <div className="mt-0.5 font-mono text-[0.6875rem] text-content-subtle">
                        {cr.targetScope.targetId}
                      </div>
                    )}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {cr.decidedBy && (
            <Card>
              <CardHeader title="Decision" />
              <CardBody>
                <p className="text-body text-content-muted">{cr.decisionReason}</p>
                <p className="mt-2 text-label text-content-subtle">
                  {cr.decidedBy} ·{' '}
                  {cr.decidedAt ? new Date(cr.decidedAt).toLocaleString('en-GB') : ''}
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </PageBody>
  );
}

export default function ApprovalDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <RequireAuth>{id ? <ChangeRequestDetail id={id} /> : null}</RequireAuth>;
}
