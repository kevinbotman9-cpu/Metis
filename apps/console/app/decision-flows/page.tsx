'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  StatusBadge,
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { HealthSummary, BigStat, Sparkline, StatusDot } from '@/components/ui/health-summary';
import { Button } from '@/components/ui/button';
import { apiClient, type ArtifactSummaryDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

function FlowsView() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['artifacts'],
    queryFn: () => apiClient.listArtifacts(),
  });
  const decisions = useQuery({
    queryKey: ['decisions', 'by-flow'],
    queryFn: () => apiClient.searchDecisions({ limit: 5000 }),
  });

  const rows = data?.artifacts ?? [];
  const failing = rows.filter((a) => a.compileOk === false).length;
  const warning = rows.filter((a) => a.compileOk !== false && (a.warningCount ?? 0) > 0).length;

  /**
   * Decision volume per flow, bucketed by day over the window.
   * Derived from the real decisions rather than invented, so the shape means
   * something.
   */
  const decisionsByFlow = new Map<string, number[]>();
  for (const d of decisions.data?.decisions ?? []) {
    const day = new Date(d.timestamp).getUTCDate();
    const series = decisionsByFlow.get(d.artifactId) ?? new Array(7).fill(0);
    series[day % 7] += 1;
    decisionsByFlow.set(d.artifactId, series);
  }
  const activityFor = (id: string) => decisionsByFlow.get(id) ?? new Array(7).fill(0);

  const columns: Column<ArtifactSummaryDto>[] = [
    {
      key: 'name',
      header: 'Decision flow',
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
      key: 'compile',
      header: 'Compiles',
      width: 'w-28',
      sortValue: (a) => (a.compileOk === false ? 0 : a.warningCount ? 1 : 2),
      cell: (a) => (
        <span className="flex items-center gap-1.5">
          <StatusDot
            state={a.compileOk === false ? 'fail' : a.warningCount ? 'risk' : 'pass'}
            label={
              a.compileOk === false
                ? `${a.errorCount} compile error${a.errorCount === 1 ? '' : 's'}`
                : a.warningCount
                  ? `${a.warningCount} compile warning${a.warningCount === 1 ? '' : 's'}`
                  : 'Compiles cleanly'
            }
          />
          <span className="text-label text-content-muted">
            {a.compileOk === false
              ? `${a.errorCount} error${a.errorCount === 1 ? '' : 's'}`
              : a.warningCount
                ? `${a.warningCount} warning${a.warningCount === 1 ? '' : 's'}`
                : 'clean'}
          </span>
        </span>
      ),
    },
    {
      key: 'budget',
      header: 'Budget',
      width: 'w-24',
      sortValue: (a) => a.estimatedP95LatencyMs,
      cell: (a) => (
        <StatusDot
          state={
            a.estimatedP95LatencyMs > 50
              ? 'fail'
              : a.estimatedP95LatencyMs > 40
                ? 'risk'
                : 'pass'
          }
          label={`${a.estimatedP95LatencyMs.toFixed(1)}ms of the 50ms budget`}
        />
      ),
    },
    {
      key: 'activity',
      header: 'Activity',
      width: 'w-32',
      secondary: true,
      cell: (a) => (
        <Sparkline
          // Decision volume per flow over the window, bucketed by day.
          values={activityFor(a.id)}
          label={`Recent decision volume for ${a.name}`}
          tone={a.status === 'active' ? 'accent' : 'hold'}
        />
      ),
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
        title="Decision flows"
        description="Compiled decision graphs. Each version is immutable and pinned to the node package versions it was compiled against, so any decision it made can be replayed exactly."
        actions={
          <Button variant="primary" size="md">
            New flow
          </Button>
        }
      />

      <div className="mb-stack grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BigStat label="Decision flows" value={rows.length} sub="in this tenant" />
        <BigStat
          label="Decisions served"
          value={(decisions.data?.total ?? 0).toLocaleString('en-GB')}
          sub="across all decision flows"
        />
        <HealthSummary
          label="Lifecycle"
          segments={[
            {
              label: 'active',
              count: rows.filter((a) => a.status === 'active').length,
              tone: 'pass',
            },
            {
              label: 'draft',
              count: rows.filter((a) => a.status === 'draft').length,
              tone: 'hold',
            },
            {
              label: 'retired',
              count: rows.filter((a) => a.status === 'retired').length,
              tone: 'neutral',
            },
          ]}
        />
        <HealthSummary
          label="Compilation"
          segments={[
            { label: 'clean', count: rows.length - failing - warning, tone: 'pass' },
            { label: 'warnings', count: warning, tone: 'hold' },
            { label: 'blocked', count: failing, tone: 'block' },
          ]}
        />
      </div>

      <Card>
        <CardHeader
          title="Compiled artifacts"
          description="Select a decision flow to open its graph."
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(a) => a.id}
          isLoading={isLoading}
          defaultSort={{ key: 'updated', dir: 'desc' }}
          onRowClick={(a) => router.push(`/decision-flows/${a.id}`)}
          emptyTitle="No decision flows published"
          caption="Compiled decision flow artifacts"
        />
      </Card>
    </PageBody>
  );
}

export default function FlowsPage() {
  return (
    <RequireAuth>
      <FlowsView />
    </RequireAuth>
  );
}
