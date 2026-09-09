'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
  EmptyState,
  ErrorState,
  PermissionDenied,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { ObjectiveFormDialog, CategoryFormDialog } from '@/components/taxonomy-form-dialog';
import { apiClient, type CategoryDto, type ObjectiveDto } from '@/lib/api-client';

/**
 * The taxonomy, authored.
 *
 * `docs/METIS_CONSOLE_SPEC.md` Part 3: *"Objectives | List–detail | Top of
 * taxonomy. Owns categories."* This is that screen, and it is the first step of
 * Spine 1 — the one the marketer could not take. Until 2026-09-09 the two top
 * levels of the taxonomy could only be authored by editing a seed file in the
 * repository and redeploying. Every step of the marketer's journey after this
 * one had a screen; the first one did not.
 *
 * List–detail rather than two flat screens, per §4.1: selecting a row fills the
 * right pane rather than navigating, and a category is authored from inside the
 * objective that owns it, because that is the relationship the entity has.
 *
 * There is no form in this file. Both dialogs are the generic renderer reading
 * `packages/ui-metadata/src/registry/{objective,category}.ts`, which is what
 * makes adding a field to either one an edit to a descriptor and the OpenAPI
 * schema, and no change here.
 */

function TaxonomyView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [creatingObjective, setCreatingObjective] = useState(false);
  const [editingObjective, setEditingObjective] = useState<ObjectiveDto | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);

  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:offers');

  // Which objective is open lives in the URL: navigation state belongs there,
  // the back button then returns to the previous objective rather than leaving
  // the screen, and a link to one is a link somebody can send.
  const openId = params.get('objective');
  const setOpenId = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('objective', id);
    else next.delete('objective');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => apiClient.getTaxonomy(),
  });

  const objectives = useMemo(
    () => [...(data?.objectives ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [data]
  );
  const categories = useMemo(() => data?.categories ?? [], [data]);
  const offers = useMemo(() => data?.offers ?? [], [data]);

  const countsFor = (objectiveId: string) => {
    const own = categories.filter((c) => c.objectiveId === objectiveId);
    const ids = new Set(own.map((c) => c.id));
    return { categories: own.length, offers: offers.filter((o) => ids.has(o.categoryId)).length };
  };

  // Falls back to the first objective so the detail pane is never empty on a
  // screen whose whole shape is list plus detail.
  const open = objectives.find((o) => o.id === openId) ?? objectives[0] ?? null;
  const openCategories = open
    ? [...categories.filter((c) => c.objectiveId === open.id)].sort(
        (a, b) => a.sortOrder - b.sortOrder
      )
    : [];

  const columns: Column<ObjectiveDto>[] = [
    {
      key: 'name',
      header: 'Objective',
      sortValue: (o) => o.sortOrder,
      cell: (o) => (
        <div className="min-w-0 max-w-[18rem]">
          <p className="truncate text-body font-medium text-content">{o.name}</p>
          <p className="truncate font-mono text-label text-content-subtle">{o.key}</p>
        </div>
      ),
    },
    {
      key: 'categories',
      header: 'Categories',
      width: 'w-28',
      align: 'right',
      sortValue: (o) => countsFor(o.id).categories,
      cell: (o) => <span className="tnum text-content-muted">{countsFor(o.id).categories}</span>,
    },
    {
      key: 'offers',
      header: 'Offers',
      width: 'w-24',
      align: 'right',
      secondary: true,
      sortValue: (o) => countsFor(o.id).offers,
      cell: (o) => <span className="tnum text-content-muted">{countsFor(o.id).offers}</span>,
    },
  ];

  if (error) {
    return (
      <PageBody>
        <ErrorState
          title="Could not load the taxonomy"
          description={(error as Error).message}
          onRetry={() => void refetch()}
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title="Objectives"
        description="The top of the taxonomy: what the business is trying to achieve. Categories are filed under an objective, and offers under a category."
        actions={
          canEdit ? (
            <Button variant="primary" size="md" onClick={() => setCreatingObjective(true)}>
              New objective
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Taxonomy"
            description="Select an objective to see what is filed under it."
          />
          <DataTable
            columns={columns}
            rows={objectives}
            rowKey={(o) => o.id}
            isLoading={isLoading}
            onRowClick={(o) => setOpenId(o.id)}
            defaultSort={{ key: 'name', dir: 'asc' }}
            caption={`${objectives.length} objectives`}
            emptyTitle="No objectives yet"
            emptyDescription="An objective is the first thing in the catalogue. Everything else is filed under one."
          />
        </Card>

        {open ? (
          <Card>
            <CardHeader
              title={open.name}
              description={open.description || 'No description.'}
              actions={
                canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingObjective(open)}
                      aria-label={`Edit objective ${open.name}`}
                    >
                      Edit objective
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => setCreatingCategory(true)}>
                      New category
                    </Button>
                  </div>
                ) : null
              }
            />
            <CardBody>
              <dl className="mb-stack flex flex-wrap gap-x-6 gap-y-2 text-label">
                <div>
                  <dt className="text-content-subtle">Key</dt>
                  <dd className="font-mono text-content-muted">{open.key}</dd>
                </div>
                <div>
                  <dt className="text-content-subtle">Sort order</dt>
                  <dd className="tnum text-content-muted">{open.sortOrder}</dd>
                </div>
                <div>
                  <dt className="text-content-subtle">Categories</dt>
                  <dd className="tnum text-content-muted">{openCategories.length}</dd>
                </div>
              </dl>

              {openCategories.length === 0 ? (
                <EmptyState
                  title="No categories under this objective"
                  description="A category is a product or service grouping. Offers are filed under one, so an objective with no category has nothing to sell."
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {openCategories.map((c) => {
                    const own = offers.filter((o) => o.categoryId === c.id);
                    return (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded border px-cell py-cell-y"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-body font-medium text-content">{c.name}</p>
                          <p className="truncate text-label text-content-subtle">
                            <span className="font-mono">{c.key}</span>
                            {c.description ? ` · ${c.description}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge tone="outline">
                            {own.length} {own.length === 1 ? 'offer' : 'offers'}
                          </Badge>
                          <Link
                            href={`/offers?category=${c.id}`}
                            className="text-label text-accent underline-offset-2 hover:underline"
                          >
                            Offers
                          </Link>
                          {canEdit ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditingCategory(c)}
                              aria-label={`Edit category ${c.name}`}
                            >
                              Edit
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>

      <ObjectiveFormDialog
        open={creatingObjective}
        onOpenChange={setCreatingObjective}
        nextSortOrder={objectives.length + 1}
        onSaved={(created) => setOpenId(created.id)}
      />
      {editingObjective ? (
        <ObjectiveFormDialog
          open
          onOpenChange={(next) => !next && setEditingObjective(null)}
          record={editingObjective}
        />
      ) : null}

      {open ? (
        <CategoryFormDialog
          open={creatingCategory}
          onOpenChange={setCreatingCategory}
          objectiveId={open.id}
          nextSortOrder={openCategories.length + 1}
        />
      ) : null}
      {editingCategory ? (
        <CategoryFormDialog
          open
          onOpenChange={(next) => !next && setEditingCategory(null)}
          record={editingCategory}
        />
      ) : null}
    </PageBody>
  );
}

export default function ObjectivesPage() {
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
        <PageHeader title="Objectives" />
        <PermissionDenied permission="view:offers" />
      </PageBody>
    );
  }
  return <TaxonomyView />;
}
