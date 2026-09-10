'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  StatusBadge,
  Input,
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { FilterBlocks, type FilterBlock } from '@/components/ui/filter-blocks';
import { CoverageBar } from '@/components/ui/coverage-bar';
import { OfferDrawer } from '@/components/offer-drawer';
import { OfferFormDialog } from '@/components/offer-form-dialog';
import { apiClient, type OfferDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

/** email, sms, web, push, outbound_call — the channels a creative can target. */
const CHANNEL_COUNT = 5;

function money(m: { amount: number; currency: string }) {
  const symbol = m.currency === 'GBP' ? '£' : m.currency === 'USD' ? '$' : '€';
  return `${symbol}${(m.amount / 100).toFixed(2)}`;
}

/**
 * The summary blocks and what each one filters to.
 *
 * Kept beside the predicates rather than expressed as a status string, because
 * two of them are not statuses: "blocked" is a derived fact (no creative, and
 * not retired, so it will actually stop a publish) and "boosted" is a property
 * of the catalogue. A `status` filter could not express either.
 */
const LENSES: { id: string; label: string; sub?: string; tone?: FilterBlock['tone'];
  match: (p: OfferDto) => boolean }[] = [
  { id: 'all', label: 'Offers', sub: 'in this catalogue', match: () => true },
  { id: 'live', label: 'Selectable', sub: 'active, with content', tone: 'pass',
    match: (p) => p.status === 'active' && p.creativeIds.length > 0 },
  // "has no creative", not "no active creative", because that is what this can
  // see: the list returns offers, and an offer carries the ids of its creatives
  // and not whether any is switched on. An offer whose only creative is
  // inactive is undeliverable and is not counted here. It cannot be *active*
  // and undeliverable — the API refuses that — so what escapes this lens is a
  // draft or paused offer, which was not going to be delivered anyway.
  { id: 'blocked', label: 'Cannot be delivered', sub: 'has no creative', tone: 'block',
    match: (p) => p.creativeIds.length === 0 && p.status !== 'retired' },
  { id: 'boosted', label: 'Boosted', sub: 'above 1.0', tone: 'hold',
    match: (p) => p.boost > 1 },
];

function OffersView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // `?category=` so the taxonomy screen can send someone here: an offer count
  // shown against a category on /objectives has to reach the offers it counted,
  // or it is a number with nothing behind it. Read once, as the initial
  // selection, because the tree on the left is then in charge of it.
  const [selected, setSelected] = useState<{ type: 'all' | 'objective' | 'category'; id?: string }>(
    () => {
      const category = params.get('category');
      return category ? { type: 'category', id: category } : { type: 'all' };
    }
  );
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [lens, setLens] = useState('all');
  const [creating, setCreating] = useState(false);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:offers');

  // Which offer the drawer is showing lives in the URL, not in component
  // state: navigation state belongs there, the back button then closes the
  // drawer rather than leaving the page, and a reviewer can send someone a
  // link to the offer they are looking at.
  const openId = params.get('offer');
  const setOpenId = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('offer', id);
    else next.delete('offer');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

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
    const active = LENSES.find((l) => l.id === lens);
    if (active && active.id !== 'all') rows = rows.filter(active.match);
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
  }, [all, selected, search, status, lens]);

  const countFor = (predicate: (p: OfferDto) => boolean) =>
    all.filter(predicate).length;

  const openIndex = openId ? filtered.findIndex((p) => p.id === openId) : -1;

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
      width: 'w-40',
      sortValue: (p) => p.creativeIds.length,
      // The list knows how many creatives an offer has, not which channels
      // they cover, so the unit here is "creatives". The drawer fetches them
      // and can say "channels".
      cell: (p) => (
        <CoverageBar
          covered={p.creativeIds.length}
          total={p.status === 'retired' ? 0 : CHANNEL_COUNT}
          selectable={p.status !== 'retired'}
          noun="creatives"
        />
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
          canEdit ? (
            <Button variant="primary" size="md" onClick={() => setCreating(true)}>
              New offer
            </Button>
          ) : null
        }
      />

      {/* The summary is the filter. Previously these were four inert tiles:
          you could read "1 cannot be delivered" and then had to construct
          that filter by hand. */}
      <FilterBlocks
        className="mb-stack"
        label="Filter the catalogue"
        activeId={lens}
        onSelect={setLens}
        blocks={LENSES.map((l) => ({
          id: l.id,
          label: l.label,
          sub: l.id === 'all' ? `across ${objectives.length} objectives` : l.sub,
          tone: l.tone,
          value: l.id === 'all' ? all.length : countFor(l.match),
        }))}
      />

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
            onRowClick={(p) => setOpenId(p.id)}
            emptyTitle="No offers here"
            emptyDescription="Change the filter, or create an offer in this category."
            caption="Offer catalogue"
          />
        </Card>
      </div>

      {/* Paging walks the filtered list, not the whole catalogue: if you have
          narrowed to the offers that cannot be delivered, "next" should mean
          the next one of those. */}
      <OfferDrawer
        offerId={openId}
        summary={filtered.find((p) => p.id === openId) ?? all.find((p) => p.id === openId)}
        onClose={() => setOpenId(null)}
        onPrev={openIndex > 0 ? () => setOpenId(filtered[openIndex - 1].id) : undefined}
        onNext={
          openIndex >= 0 && openIndex < filtered.length - 1
            ? () => setOpenId(filtered[openIndex + 1].id)
            : undefined
        }
        prevLabel={openIndex > 0 ? filtered[openIndex - 1].name : undefined}
        nextLabel={
          openIndex >= 0 && openIndex < filtered.length - 1
            ? filtered[openIndex + 1].name
            : undefined
        }
      />

      <OfferFormDialog
        open={creating}
        onOpenChange={setCreating}
        // Straight to the new offer: it has no creative yet, so it cannot be
        // delivered, and the detail page is where that gets fixed.
        onSaved={(offer) => router.push(`/offers/${offer.id}`)}
      />
    </PageBody>
  );
}

export default function OffersPage() {
  // `view:offers` is enforced by `RequireAuth`, from the same manifest
  // entry the navigation rail reads. It was written out longhand here
  // until 2026-09-10, which was fine for this page and no help at all
  // to the sixteen routes that never wrote it.
  return (
    <RequireAuth>
      <OffersView />
    </RequireAuth>
  );
}
