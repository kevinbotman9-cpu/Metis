'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
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
import { Button } from '@/components/ui/button';
import { apiClient, type ConnectorDto } from '@/lib/api-client';

/** The tenant's latency budget. Connectors are measured against it here. */
const LATENCY_BUDGET_MS = 50;

const FAILURE_COPY: Record<ConnectorDto['onFailure'], { label: string; tone: 'pass' | 'hold' | 'block'; help: string }> = {
  fail: {
    label: 'Fail the decision',
    tone: 'block',
    help: 'An outage becomes a decision outage. Right for a field the policies depend on.',
  },
  omit: {
    label: 'Omit the field',
    tone: 'hold',
    help: 'The decision proceeds without it. Any rule reading the field will not evaluate.',
  },
  default: {
    label: 'Use the default',
    tone: 'pass',
    help: 'A stated fallback value is substituted, and the trace records that it was used.',
  },
};

function IntegrationsView() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = hasPermission('edit:integrations');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => apiClient.listConnectors(),
  });

  const toggle = useMutation({
    mutationFn: (c: ConnectorDto) => apiClient.updateConnector({ ...c, active: !c.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connectors'] }),
  });

  const rows = data?.connectors ?? [];
  const active = rows.filter((c) => c.active);
  const overBudget = rows.filter((c) => c.declaredP95Ms > LATENCY_BUDGET_MS);
  const suppliedFields = active.reduce((n, c) => n + c.provides.length, 0);

  const columns: Column<ConnectorDto>[] = [
    {
      key: 'name',
      header: 'Integration',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div>
          <div className="font-medium text-content">{c.name}</div>
          <div className="text-label text-content-muted">{c.description}</div>
          <div className="mt-0.5 font-mono text-[0.6875rem] text-content-subtle">{c.target}</div>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      width: 'w-32',
      sortValue: (c) => c.kind,
      cell: (c) => <Badge tone="outline">{c.kind.replace('-', ' ')}</Badge>,
    },
    {
      key: 'provides',
      header: 'Supplies',
      width: 'w-56',
      sortValue: (c) => c.provides.length,
      cell: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.provides.map((b) => (
            <span
              key={b.field}
              title={`${b.path} → ${b.field} (${b.type})`}
              className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.6875rem] text-content-muted"
            >
              {b.field}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'latency',
      header: 'Declared p95',
      width: 'w-36',
      align: 'right',
      sortValue: (c) => c.declaredP95Ms,
      cell: (c) => {
        const over = c.declaredP95Ms > LATENCY_BUDGET_MS;
        return (
          <div>
            <span className={`tnum ${over ? 'font-semibold text-block' : 'text-content'}`}>
              {c.declaredP95Ms}ms
            </span>
            <div className="text-[0.6875rem] text-content-subtle">
              {over
                ? `over the ${LATENCY_BUDGET_MS}ms budget`
                : `${Math.round((c.declaredP95Ms / LATENCY_BUDGET_MS) * 100)}% of budget`}
            </div>
          </div>
        );
      },
    },
    {
      key: 'onFailure',
      header: 'On failure',
      width: 'w-44',
      secondary: true,
      sortValue: (c) => c.onFailure,
      cell: (c) => (
        <div title={FAILURE_COPY[c.onFailure].help}>
          <Badge tone={FAILURE_COPY[c.onFailure].tone}>{FAILURE_COPY[c.onFailure].label}</Badge>
          <div className="mt-0.5 text-[0.6875rem] text-content-subtle">
            {c.cacheTtlSeconds > 0 ? `caches ${c.cacheTtlSeconds}s` : 'no cache'}
          </div>
        </div>
      ),
    },
    {
      key: 'active',
      header: 'Status',
      width: 'w-32',
      sortValue: (c) => (c.active ? 0 : 1),
      cell: (c) => (
        <div className="flex items-center gap-2">
          <Badge tone={c.active ? 'pass' : 'outline'}>{c.active ? 'Active' : 'Inactive'}</Badge>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggle.mutate(c)}
              disabled={toggle.isPending}
            >
              {c.active ? 'Deactivate' : 'Activate'}
            </Button>
          )}
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
        title="Integrations"
        description="Data the platform does not hold, fetched at decision time. A strategy's source node names the connectors it needs; the values it returns land in the input snapshot the decision is hashed from, so a replay six months later uses what was fetched then, not what the system would return today."
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Configured" value={rows.length} />
        <Metric label="Active" value={active.length} sub="callable at decision time" />
        <Metric
          label="Fields supplied"
          value={suppliedFields}
          sub="across active connectors"
        />
        <Metric
          label="Over budget"
          value={overBudget.length}
          tone={overBudget.length > 0 ? 'block' : 'neutral'}
          sub={`${LATENCY_BUDGET_MS}ms tenant budget`}
        />
      </div>

      {overBudget.length > 0 && (
        <Card className="mb-stack border-block/40">
          <CardHeader
            title="Some connectors cannot be called synchronously"
            description={`${overBudget
              .map((c) => `${c.name} declares ${c.declaredP95Ms}ms`)
              .join('; ')}. The compiler rejects any strategy whose source node names one of these, rather than letting it fail in production. Pre-compute the field into the feature store, or raise the budget.`}
          />
        </Card>
      )}

      <Card>
        <CardHeader
          title="Configured connectors"
          description="Latency is declared by whoever configured the integration, and the compiler adds it to the critical path. If the declaration is wrong, the budget is wrong."
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          isLoading={isLoading}
          defaultSort={{ key: 'active', dir: 'asc' }}
          emptyTitle="No integrations configured"
          emptyDescription="A strategy can only read what the request carries until a connector supplies more."
          caption="Configured integrations"
        />
      </Card>
    </PageBody>
  );
}

export default function IntegrationsPage() {
  return (
    <RequireAuth>
      <IntegrationsView />
    </RequireAuth>
  );
}
