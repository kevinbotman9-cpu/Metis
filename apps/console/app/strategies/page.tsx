'use client';

import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  Badge,
  StatusBadge,
  Metric,
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { apiClient, type ArtifactSummaryDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

function StrategiesView() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['artifacts'],
    queryFn: () => apiClient.listArtifacts(),
  });

  const rows = data?.artifacts ?? [];
  const overBudget = rows.filter((a) => a.estimatedP95LatencyMs > 50).length;

  const columns: Column<ArtifactSummaryDto>[] = [
    {
      key: 'name',
      header: 'Strategy',
      sortValue: (a) => a.name,
      cell: (a) => (
        <div className="min-w-0">
          <div className="font-medium text-content">{a.name}</div>
          <div className="font-mono text-label text-content-subtle">{a.id}</div>
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Active version',
      width: 'w-32',
      sortValue: (a) => a.activeVersion,
      cell: (a) => (
        <div>
          <span className="font-mono text-label font-medium text-accent">{a.activeVersion}</span>
          <div className="text-[0.6875rem] text-content-subtle">
            {a.versions.length} versions
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      sortValue: (a) => a.status,
      cell: (a) => <StatusBadge status={a.status} />,
    },
    {
      key: 'nodes',
      header: 'Nodes',
      align: 'right',
      width: 'w-20',
      sortValue: (a) => a.nodeCount,
      cell: (a) => <span className="text-content-muted">{a.nodeCount}</span>,
    },
    {
      key: 'latency',
      header: 'Est. p95',
      align: 'right',
      width: 'w-24',
      sortValue: (a) => a.estimatedP95LatencyMs,
      cell: (a) => (
        <span className={cn(a.estimatedP95LatencyMs > 50 ? 'text-block' : 'text-pass')}>
          {a.estimatedP95LatencyMs.toFixed(1)}ms
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: 'w-40',
      secondary: true,
      sortValue: (a) => a.updatedAt,
      cell: (a) => (
        <div>
          <div className="tnum text-label text-content-muted">
            {new Date(a.updatedAt).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
            })}
          </div>
          <div className="truncate text-[0.6875rem] text-content-subtle">{a.updatedBy}</div>
        </div>
      ),
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
        title="Strategies"
        description="Compiled decision graphs. Each version is immutable and pinned to the node package versions it was compiled against, so any decision it made can be replayed exactly."
        actions={
          <Button variant="primary" size="md">
            New strategy
          </Button>
        }
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Strategies" value={rows.length} />
        <Metric
          label="Active"
          value={rows.filter((a) => a.status === 'active').length}
          tone="pass"
        />
        <Metric
          label="Draft"
          value={rows.filter((a) => a.status === 'draft').length}
          tone="hold"
        />
        <Metric
          label="Over latency budget"
          value={overBudget}
          tone={overBudget > 0 ? 'block' : 'pass'}
          sub="budget 50ms"
        />
      </div>

      <Card>
        <CardHeader
          title="Compiled artifacts"
          description="The canvas editor arrives in a later phase; this list is read-only for now."
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(a) => a.id}
          isLoading={isLoading}
          defaultSort={{ key: 'updated', dir: 'desc' }}
          emptyTitle="No strategies published"
          caption="Compiled strategy artifacts"
        />
      </Card>
    </PageBody>
  );
}

export default function StrategiesPage() {
  return (
    <RequireAuth>
      <StrategiesView />
    </RequireAuth>
  );
}
