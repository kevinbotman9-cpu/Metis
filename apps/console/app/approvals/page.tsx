'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  Badge,
  Metric,
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { apiClient, type ChangeRequestDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

const STATUS_TONE: Record<string, 'pass' | 'block' | 'hold' | 'neutral'> = {
  approved: 'pass',
  rejected: 'block',
  pending: 'hold',
  withdrawn: 'neutral',
};

function ApprovalsView() {
  const router = useRouter();
  const [status, setStatus] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['change-requests', status],
    queryFn: () => apiClient.listChangeRequests(status || undefined),
  });

  const rows = data?.changeRequests ?? [];
  const pending = rows.filter((c) => c.status === 'pending').length;
  const fromAgents = rows.filter((c) => c.requestedBy.startsWith('agent-')).length;
  const simFailed = rows.filter((c) => c.simulation && !c.simulation.passed).length;

  const columns: Column<ChangeRequestDto>[] = [
    {
      key: 'title',
      header: 'Change request',
      sortValue: (c) => c.title,
      cell: (c) => (
        <div className="min-w-0">
          <div className="font-medium text-content">{c.title}</div>
          <div className="font-mono text-label text-content-subtle">{c.id}</div>
        </div>
      ),
    },
    {
      key: 'requestedBy',
      header: 'Raised by',
      width: 'w-48',
      sortValue: (c) => c.requestedBy,
      cell: (c) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={c.requestedBy.startsWith('agent-') ? 'accent' : 'outline'}>
            {c.requestedBy.startsWith('agent-') ? 'agent' : 'person'}
          </Badge>
          <span className="truncate text-label text-content-muted">{c.requestedBy}</span>
        </div>
      ),
    },
    {
      key: 'changeType',
      header: 'Type',
      width: 'w-40',
      secondary: true,
      sortValue: (c) => c.changeType,
      cell: (c) => <Badge tone="outline">{c.changeType.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'simulation',
      header: 'Simulation',
      width: 'w-32',
      sortValue: (c) => (c.simulation ? (c.simulation.passed ? 2 : 0) : 1),
      cell: (c) =>
        !c.simulation ? (
          <span className="text-label text-content-subtle">not run</span>
        ) : (
          <Badge tone={c.simulation.passed ? 'pass' : 'block'}>
            {c.simulation.passed ? 'passed' : 'failed'}
          </Badge>
        ),
    },
    {
      key: 'requestedAt',
      header: 'Raised',
      width: 'w-32',
      sortValue: (c) => c.requestedAt,
      cell: (c) => (
        <span className="tnum text-label text-content-muted">
          {new Date(c.requestedAt).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
          })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      sortValue: (c) => c.status,
      cell: (c) => <Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Badge>,
    },
  ];

  if (error) {
    return (
      <PageBody>
        <ErrorState description={(error as Error).message} onRetry={() => refetch()} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title="Approvals"
        description="Every change to a proposition, policy, lever or strategy arrives here as a change request — whether a person or an agent raised it."
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Total" value={rows.length} />
        <Metric label="Pending" value={pending} tone={pending > 0 ? 'hold' : 'pass'} />
        <Metric label="Raised by agents" value={fromAgents} tone="accent" />
        <Metric
          label="Simulation failed"
          value={simFailed}
          tone={simFailed > 0 ? 'block' : 'neutral'}
        />
      </div>

      <div className="mb-stack flex flex-wrap gap-1">
        {['', 'pending', 'approved', 'rejected'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={cn(
              'rounded border px-2.5 py-1 text-label font-medium capitalize transition-colors',
              status === s
                ? 'border-accent bg-accent text-on-accent'
                : 'border-border text-content-muted hover:bg-surface-sunken'
            )}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title="Change requests" description="Select a row to review the diff." />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          isLoading={isLoading}
          defaultSort={{ key: 'requestedAt', dir: 'desc' }}
          onRowClick={(c) => router.push(`/approvals/${c.id}`)}
          emptyTitle="No change requests"
          emptyDescription="Nothing matches this status filter."
          caption="Change requests"
        />
      </Card>
    </PageBody>
  );
}

export default function ApprovalsPage() {
  return (
    <RequireAuth>
      <ApprovalsView />
    </RequireAuth>
  );
}
