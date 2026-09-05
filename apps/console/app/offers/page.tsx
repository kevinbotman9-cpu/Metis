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
  ErrorState,
  PermissionDenied,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { apiClient, type OfferDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

function money(m: { amount: number; currency: string }) {
  const symbol = m.currency === 'GBP' ? '£' : m.currency === 'USD' ? '$' : '€';
  return `${symbol}${(m.amount / 100).toFixed(2)}`;
}

function OffersView() {
  const router = useRouter();
  const [selected, setSelected] = useState<{ type: 'all' | 'objective' | 'category'; id?: string }>({
    type: 'all',
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => apiClient.getTaxonomy(),
  });

  const objectives = data?.objectives ?? [];
  const categories = data?.categories ?? [];
  // Memoised so the empty-array fallback keeps a stable identity between
  // renders; otherwise every render invalidates the filter below.
  const all = useMemo(() => data?.offers ?? [], [data]);

  const filtered = useMemo(() => {
    let rows = all;
    if (selected.type === 'objective') rows = rows.filter((p) => p.objectiveId === selected.id);
    if (selected.type === 'category') rows = rows.filter((p) => p.categoryId === selected.id);
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

  const countFor = (predicate: (p: OfferDto) => boolean) =>
    all.filter(predicate).length;

  const columns: Column<OfferDto>[] = [
    {
      key: 'name',
      header: 'Offer',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium text-content">{p.name}</div>
          <div className="font-mono text-label text-content-subtle">{p.key}</div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: 'w-44',
      secondary: true,
      sortValue: (p) => p.categoryId,
      cell: (p) => (
        <span className="text-content-muted">
          {categories.find((g) => g.id === p.categoryId)?.name ?? '—'}
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
      key: 'boost',
      header: 'Boost',
      align: 'right',
      width: 'w-20',
      sortValue: (p) => p.boost,
      cell: (p) => (
        <span
          className={cn(
            'font-medium',
            p.boost > 1 ? 'text-pass' : p.boost < 1 ? 'text-hold' : 'text-content-muted'
          )}
        >
          {p.boost.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'creatives',
      header: 'Creatives',
      align: 'right',
      width: 'w-24',
      sortValue: (p) => p.creativeIds.length,
      cell: (p) =>
        p.creativeIds.length === 0 ? (
          <Badge tone="hold">none</Badge>
        ) : (
          <span className="text-content-muted">{p.creativeIds.length}</span>
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
        title="Offers"
        description="The offer catalogue, organised by business objective and product category. A decision flow's candidate set is drawn from here."
        actions={
          <Button variant="primary" size="md">
            New offer
          </Button>
        }
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Offers" value={all.length} sub={`across ${objectives.length} objectives`} />
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
          label="Missing creatives"
          value={countFor((p) => p.creativeIds.length === 0 && p.status !== 'retired')}
          tone={countFor((p) => p.creativeIds.length === 0 && p.status !== 'retired') > 0 ? 'block' : 'neutral'}
          sub="cannot be delivered"
        />
      </div>

      <div className="grid gap-stack lg:grid-cols-[260px_1fr]">
        {/* Hierarchy tree */}
        <Card className="h-fit">
          <CardHeader title="Hierarchy" description="Objective › Category" />
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
              <span>All offers</span>
              <span className="tnum text-label">{all.length}</span>
            </button>

            {objectives.map((objective) => {
              const objectiveCategories = categories.filter((g) => g.objectiveId === objective.id);
              const objectiveCount = countFor((p) => p.objectiveId === objective.id);
              return (
                <div key={objective.id} className="mb-1">
                  <button
                    onClick={() => setSelected({ type: 'objective', id: objective.id })}
                    className={cn(
                      'flex w-full items-center justify-between rounded px-2 py-1.5 text-body transition-colors',
                      selected.type === 'objective' && selected.id === objective.id
                        ? 'bg-accent-subtle font-medium text-accent'
                        : 'font-medium text-content hover:bg-surface-sunken'
                    )}
                  >
                    <span className="truncate">{objective.name}</span>
                    <span className="tnum text-label text-content-subtle">{objectiveCount}</span>
                  </button>

                  <ul className="ml-2 border-l border-border pl-2">
                    {objectiveCategories.map((category) => {
                      const categoryCount = countFor((p) => p.categoryId === category.id);
                      return (
                        <li key={category.id}>
                          <button
                            onClick={() => setSelected({ type: 'category', id: category.id })}
                            className={cn(
                              'flex w-full items-center justify-between rounded px-2 py-1 text-body transition-colors',
                              selected.type === 'category' && selected.id === category.id
                                ? 'bg-accent-subtle font-medium text-accent'
                                : 'text-content-muted hover:bg-surface-sunken hover:text-content'
                            )}
                          >
                            <span className="truncate">{category.name}</span>
                            <span className="tnum text-label text-content-subtle">
                              {categoryCount}
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
                ? 'All offers'
                : selected.type === 'objective'
                  ? objectives.find((i) => i.id === selected.id)?.name ?? ''
                  : categories.find((g) => g.id === selected.id)?.name ?? ''
            }
            description={`${filtered.length} shown`}
            actions={
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Search offers"
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
            onRowClick={(p) => router.push(`/offers/${p.id}`)}
            emptyTitle="No offers here"
            emptyDescription="Change the filter, or create an offer in this category."
            caption="Offer catalogue"
          />
        </Card>
      </div>
    </PageBody>
  );
}

export default function OffersPage() {
  return (
    <RequireAuth>
      <Guarded />
    </RequireAuth>
  );
}

function Guarded() {
  const { hasPermission } = useAuth();
  if (!hasPermission('view:offers')) {
    return (
      <PageBody>
        <PageHeader title="Offers" />
        <PermissionDenied permission="view:offers" />
      </PageBody>
    );
  }
  return <OffersView />;
}
