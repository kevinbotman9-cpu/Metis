'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Badge,
  StatusBadge,
  Metric,
  Input,
  Field,
  ErrorState,
  PermissionDenied,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { apiClient, type PropositionDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

function money(m: { amount: number; currency: string }) {
  const symbol = m.currency === 'GBP' ? '£' : m.currency === 'USD' ? '$' : '€';
  return `${symbol}${(m.amount / 100).toFixed(2)}`;
}

function PropositionsView() {
  const router = useRouter();
  const [selected, setSelected] = useState<{ type: 'all' | 'issue' | 'group'; id?: string }>({
    type: 'all',
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => apiClient.getTaxonomy(),
  });

  const issues = data?.issues ?? [];
  const groups = data?.groups ?? [];
  const all = data?.propositions ?? [];

  const filtered = useMemo(() => {
    let rows = all;
    if (selected.type === 'issue') rows = rows.filter((p) => p.issueId === selected.id);
    if (selected.type === 'group') rows = rows.filter((p) => p.groupId === selected.id);
    if (status) rows = rows.filter((p) => p.status === status);
    const q = search.toLowerCase().trim();
    if (q) {
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.key.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [all, selected, search, status]);

  const countFor = (predicate: (p: PropositionDto) => boolean) =>
    all.filter(predicate).length;

  const columns: Column<PropositionDto>[] = [
    {
      key: 'name',
      header: 'Proposition',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-content">{p.name}</div>
          <div className="font-mono text-label text-content-subtle">{p.key}</div>
        </div>
      ),
    },
    {
      key: 'group',
      header: 'Group',
      width: 'w-44',
      secondary: true,
      sortValue: (p) => p.groupId,
      cell: (p) => (
        <span className="text-content-muted">
          {groups.find((g) => g.id === p.groupId)?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-24',
      sortValue: (p) => p.status,
      cell: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      width: 'w-24',
      sortValue: (p) => p.financials.price.amount,
      cell: (p) => (
        <span>
          {money(p.financials.price)}
          {!p.financials.oneOff && p.financials.price.amount > 0 ? (
            <span className="text-content-subtle">/mo</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'margin',
      header: 'Exp. margin',
      align: 'right',
      width: 'w-28',
      secondary: true,
      sortValue: (p) => p.financials.expectedMargin.amount,
      cell: (p) => (
        <span
          className={cn(
            p.financials.expectedMargin.amount < 0 ? 'text-block' : 'text-content-muted'
          )}
        >
          {money(p.financials.expectedMargin)}
        </span>
      ),
    },
    {
      key: 'lever',
      header: 'Lever',
      align: 'right',
      width: 'w-20',
      sortValue: (p) => p.lever,
      cell: (p) => (
        <span
          className={cn(
            'font-medium',
            p.lever > 1 ? 'text-pass' : p.lever < 1 ? 'text-hold' : 'text-content-muted'
          )}
        >
          {p.lever.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'treatments',
      header: 'Treatments',
      align: 'right',
      width: 'w-24',
      sortValue: (p) => p.treatmentIds.length,
      cell: (p) =>
        p.treatmentIds.length === 0 ? (
          <Badge tone="hold">none</Badge>
        ) : (
          <span className="text-content-muted">{p.treatmentIds.length}</span>
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
        title="Propositions"
        description="The offer catalogue, organised by business issue and product group. A strategy's candidate set is drawn from here."
        actions={
          <Button variant="primary" size="md">
            New proposition
          </Button>
        }
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Propositions" value={all.length} sub={`across ${issues.length} issues`} />
        <Metric
          label="Active"
          value={countFor((p) => p.status === 'active')}
          tone="pass"
        />
        <Metric
          label="Draft or paused"
          value={countFor((p) => p.status === 'draft' || p.status === 'paused')}
          tone="hold"
        />
        <Metric
          label="Missing treatments"
          value={countFor((p) => p.treatmentIds.length === 0 && p.status !== 'retired')}
          tone={countFor((p) => p.treatmentIds.length === 0 && p.status !== 'retired') > 0 ? 'block' : 'neutral'}
          sub="cannot be delivered"
        />
      </div>

      <div className="grid gap-stack lg:grid-cols-[260px_1fr]">
        {/* Hierarchy tree */}
        <Card className="h-fit">
          <CardHeader title="Hierarchy" description="Issue › Group" />
          <CardBody className="p-2">
            <button
              onClick={() => setSelected({ type: 'all' })}
              className={cn(
                'mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-body transition-colors',
                selected.type === 'all'
                  ? 'bg-accent-subtle font-medium text-accent'
                  : 'text-content-muted hover:bg-surface-sunken'
              )}
            >
              <span>All propositions</span>
              <span className="tnum text-label">{all.length}</span>
            </button>

            {issues.map((issue) => {
              const issueGroups = groups.filter((g) => g.issueId === issue.id);
              const issueCount = countFor((p) => p.issueId === issue.id);
              return (
                <div key={issue.id} className="mb-1">
                  <button
                    onClick={() => setSelected({ type: 'issue', id: issue.id })}
                    className={cn(
                      'flex w-full items-center justify-between rounded px-2 py-1.5 text-body transition-colors',
                      selected.type === 'issue' && selected.id === issue.id
                        ? 'bg-accent-subtle font-medium text-accent'
                        : 'font-medium text-content hover:bg-surface-sunken'
                    )}
                  >
                    <span className="truncate">{issue.name}</span>
                    <span className="tnum text-label text-content-subtle">{issueCount}</span>
                  </button>

                  <ul className="ml-2 border-l border-border pl-2">
                    {issueGroups.map((group) => {
                      const groupCount = countFor((p) => p.groupId === group.id);
                      return (
                        <li key={group.id}>
                          <button
                            onClick={() => setSelected({ type: 'group', id: group.id })}
                            className={cn(
                              'flex w-full items-center justify-between rounded px-2 py-1 text-body transition-colors',
                              selected.type === 'group' && selected.id === group.id
                                ? 'bg-accent-subtle font-medium text-accent'
                                : 'text-content-muted hover:bg-surface-sunken hover:text-content'
                            )}
                          >
                            <span className="truncate">{group.name}</span>
                            <span className="tnum text-label text-content-subtle">
                              {groupCount}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </CardBody>
        </Card>

        {/* Catalogue */}
        <Card>
          <CardHeader
            title={
              selected.type === 'all'
                ? 'All propositions'
                : selected.type === 'issue'
                  ? issues.find((i) => i.id === selected.id)?.name ?? ''
                  : groups.find((g) => g.id === selected.id)?.name ?? ''
            }
            description={`${filtered.length} shown`}
            actions={
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Search propositions"
                  placeholder="Search name, key or tag"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-52"
                />
                <select
                  aria-label="Filter by status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-8 rounded border border-border bg-surface px-2 text-body"
                >
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="paused">Paused</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            }
          />
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(p) => p.id}
            isLoading={isLoading}
            defaultSort={{ key: 'name', dir: 'asc' }}
            onRowClick={(p) => router.push(`/propositions/${p.id}`)}
            emptyTitle="No propositions here"
            emptyDescription="Change the filter, or create a proposition in this group."
            caption="Proposition catalogue"
          />
        </Card>
      </div>
    </PageBody>
  );
}

export default function PropositionsPage() {
  return (
    <RequireAuth>
      <Guarded />
    </RequireAuth>
  );
}

function Guarded() {
  const { hasPermission } = useAuth();
  if (!hasPermission('view:propositions')) {
    return (
      <PageBody>
        <PageHeader title="Propositions" />
        <PermissionDenied permission="view:propositions" />
      </PageBody>
    );
  }
  return <PropositionsView />;
}
