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
  CardBody,
  Badge,
  Metric,
  Input,
  Select,
  Field,
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { apiClient, type DecisionDto } from '@/lib/api-client';

function DecisionsView() {
  const router = useRouter();
  const [filters, setFilters] = useState({
    customerId: '',
    channel: '',
    outcome: '',
    action: '',
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['decisions', filters],
    queryFn: () =>
      apiClient.searchDecisions({
        customerId: filters.customerId || undefined,
        channel: filters.channel || undefined,
        outcome: filters.outcome || undefined,
        action: filters.action || undefined,
        limit: 200,
      }),
  });

  const rows = data?.decisions ?? [];
  const offered = rows.filter((d) => d.winner).length;
  const suppressed = rows.length - offered;
  const avgLatency =
    rows.length > 0
      ? (rows.reduce((sum, d) => sum + d.totalMs, 0) / rows.length).toFixed(1)
      : '—';

  const columns: Column<DecisionDto>[] = [
    {
      key: 'id',
      header: 'Decision',
      width: 'w-44',
      sortValue: (d) => d.id,
      cell: (d) => <span className="font-mono text-label text-accent">{d.id}</span>,
    },
    {
      key: 'timestamp',
      header: 'When',
      width: 'w-40',
      sortValue: (d) => d.timestamp,
      cell: (d) => (
        <span className="tnum text-content-muted">
          {new Date(d.timestamp).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'customerId',
      header: 'Customer',
      width: 'w-32',
      sortValue: (d) => d.customerId,
      cell: (d) => <span className="font-mono text-label">{d.customerId}</span>,
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 'w-32',
      sortValue: (d) => d.channel,
      cell: (d) => <Badge tone="outline">{d.channel.replace('_', ' ')}</Badge>,
    },
    {
      key: 'winner',
      header: 'Outcome',
      sortValue: (d) => d.winner ?? 'zzz',
      cell: (d) =>
        d.winner ? (
          <Badge tone="pass">{d.winner}</Badge>
        ) : (
          <Badge tone="block">no offer</Badge>
        ),
    },
    {
      key: 'candidateCount',
      header: 'Candidates',
      align: 'right',
      width: 'w-24',
      secondary: true,
      sortValue: (d) => d.candidateCount,
      cell: (d) => <span className="text-content-muted">{d.candidateCount}</span>,
    },
    {
      key: 'artifactVersion',
      header: 'Artifact',
      width: 'w-24',
      secondary: true,
      sortValue: (d) => d.artifactVersion,
      cell: (d) => <span className="font-mono text-label text-content-muted">{d.artifactVersion}</span>,
    },
    {
      key: 'totalMs',
      header: 'Latency',
      align: 'right',
      width: 'w-24',
      sortValue: (d) => d.totalMs,
      cell: (d) => (
        <span className={d.totalMs > 20 ? 'text-hold' : 'text-content-muted'}>
          {d.totalMs.toFixed(1)}ms
        </span>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        title="Decisions"
        description="Every decision the platform made, with the full reasoning trace behind it. Open one to see why the winner won and to prove the result reproduces."
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Decisions" value={rows.length} sub="in the current filter" />
        <Metric label="Offer made" value={offered} tone="pass" />
        <Metric
          label="Suppressed"
          value={suppressed}
          tone={suppressed > 0 ? 'hold' : 'neutral'}
          sub="policy or consent"
        />
        <Metric label="Avg latency" value={`${avgLatency}ms`} sub="SLA 50ms" tone="accent" />
      </div>

      <Card>
        <CardHeader
          title="Search"
          description="Filters apply immediately."
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ customerId: '', channel: '', outcome: '', action: '' })}
            >
              Reset
            </Button>
          }
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Customer ID" htmlFor="f-cust">
              <Input
                id="f-cust"
                placeholder="cust_…"
                value={filters.customerId}
                onChange={(e) => setFilters({ ...filters, customerId: e.target.value })}
              />
            </Field>
            <Field label="Channel" htmlFor="f-chan">
              <Select
                id="f-chan"
                value={filters.channel}
                onChange={(e) => setFilters({ ...filters, channel: e.target.value })}
              >
                <option value="">All channels</option>
                <option value="web">Web</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="push">Push</option>
                <option value="outbound_call">Outbound call</option>
              </Select>
            </Field>
            <Field label="Outcome" htmlFor="f-out">
              <Select
                id="f-out"
                value={filters.outcome}
                onChange={(e) => setFilters({ ...filters, outcome: e.target.value })}
              >
                <option value="">Any outcome</option>
                <option value="offered">Offer made</option>
                <option value="suppressed">Suppressed</option>
              </Select>
            </Field>
            <Field label="Action" htmlFor="f-act">
              <Input
                id="f-act"
                placeholder="e.g. upsell_5g"
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <div className="mt-stack">
        <Card>
          <CardHeader
            title={`Results${data ? ` · ${data.total}` : ''}`}
            description="Select a row to open its trace."
          />
          {error ? (
            <ErrorState
              description={(error as Error).message}
              onRetry={() => refetch()}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(d) => d.id}
              isLoading={isLoading}
              defaultSort={{ key: 'timestamp', dir: 'desc' }}
              onRowClick={(d) => router.push(`/decisions/${d.id}`)}
              emptyTitle="No decisions match these filters"
              emptyDescription="Widen the date range or clear a filter."
              caption="Decision search results"
            />
          )}
        </Card>
      </div>
    </PageBody>
  );
}

export default function DecisionsPage() {
  return (
    <RequireAuth>
      <DecisionsView />
    </RequireAuth>
  );
}
