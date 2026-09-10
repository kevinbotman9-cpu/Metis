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
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { PlacementFormDialog } from '@/components/placement-form-dialog';
import { apiClient, type PlacementDto } from '@/lib/api-client';

/**
 * The slots this platform decides for, and what carries the result.
 *
 * `docs/METIS_CONSOLE_SPEC.md` Part 3: *"Placements | List–detail | Named, slot
 * count, per-placement policy."* Declared in the nav since it was written and
 * absent until 2026-09-10, which meant every placement was authored in a seed
 * file and reachable from nowhere: three of the five slots the seeded corpus
 * decides for were not in the registry at all, and `decidePlacement` would have
 * answered 404 for all three.
 *
 * The two columns that matter are **Decides** and **Delivered by**, and they
 * were one boolean called `active` until ADR-013 split them. That boolean was
 * answering two questions — may a decision be made, and does anything send the
 * result — which came apart exactly where this platform is: it decides on five
 * channels and delivers on one.
 */

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  web: 'Web',
  push: 'Push',
  outbound_call: 'Outbound call',
};

const DELIVERED_BY: Record<string, string> = {
  caller: 'Whoever asked',
  adapter: 'An adapter',
};

function PlacementsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PlacementDto | null>(null);

  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:integrations');

  // Which slot is open lives in the URL, so it can be linked and gone back from.
  const openKey = params.get('placement');
  const setOpenKey = (key: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (key) next.set('placement', key);
    else next.delete('placement');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['placements'],
    queryFn: () => apiClient.listPlacements(),
  });

  const placements = useMemo(() => data?.placements ?? [], [data]);
  const open = placements.find((p) => p.key === openKey) ?? placements[0] ?? null;

  const undeliverable = placements.filter((p) => p.decidable && !p.delivery);

  const columns: Column<PlacementDto>[] = [
    {
      key: 'name',
      header: 'Placement',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0 max-w-[16rem]">
          <p className="truncate text-body font-medium text-content">{p.name}</p>
          <p className="truncate font-mono text-label text-content-subtle">{p.key}</p>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 'w-32',
      sortValue: (p) => p.channel,
      cell: (p) => <Badge tone="outline">{CHANNEL_LABEL[p.channel] ?? p.channel}</Badge>,
    },
    {
      key: 'decidable',
      header: 'Decides',
      width: 'w-28',
      sortValue: (p) => (p.decidable ? 1 : 0),
      cell: (p) => (
        <Badge tone={p.decidable ? 'pass' : 'neutral'}>{p.decidable ? 'yes' : 'refuses'}</Badge>
      ),
    },
    {
      key: 'delivery',
      header: 'Delivered by',
      width: 'w-40',
      sortValue: (p) => p.delivery?.mode ?? '',
      cell: (p) =>
        p.delivery ? (
          <Badge tone="pass">{DELIVERED_BY[p.delivery.mode] ?? p.delivery.mode}</Badge>
        ) : (
          // Not an error state. A slot worth deciding for with no far end is
          // the honest condition of four of this tenant's five channels.
          <Badge tone="hold">nothing</Badge>
        ),
    },
    {
      key: 'slots',
      header: 'Slots',
      width: 'w-20',
      align: 'right',
      secondary: true,
      sortValue: (p) => p.slotCount,
      cell: (p) => <span className="tnum text-content-muted">{p.slotCount}</span>,
    },
  ];

  if (error) {
    return (
      <PageBody>
        <ErrorState
          title="Could not load placements"
          description={(error as Error).message}
          onRetry={() => void refetch()}
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title="Placements"
        description="Every slot the platform decides for, and what carries the result to a customer. Deciding and delivering are separate questions — a slot can do the first without the second."
        actions={
          canEdit ? (
            <Button variant="primary" size="md" onClick={() => setCreating(true)}>
              New placement
            </Button>
          ) : null
        }
      />

      {undeliverable.length > 0 ? (
        <Card className="mb-stack border-hold/40">
          <CardBody>
            <div className="flex flex-wrap items-start gap-3">
              <Badge tone="hold">{undeliverable.length} decide, nothing delivers</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-body text-content-muted">
                  {undeliverable.map((p) => p.name).join(', ')} —{' '}
                  {undeliverable.length === 1 ? 'this slot decides' : 'these slots decide'} and
                  nothing sends what {undeliverable.length === 1 ? 'it produces' : 'they produce'}.
                  Every decision made for {undeliverable.length === 1 ? 'it' : 'them'} records a
                  suppressed delivery attempt saying so.
                </p>
                <p className="mt-1.5 text-label text-content-subtle">
                  ADR-013. An adapter is W-017, blocked on W-008 — no recipient address exists
                  anywhere in the profile schema.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader
            title="Configured slots"
            description="Select a placement to see what answers it."
          />
          <DataTable
            columns={columns}
            rows={placements}
            rowKey={(p) => p.key}
            isLoading={isLoading}
            onRowClick={(p) => setOpenKey(p.key)}
            defaultSort={{ key: 'channel', dir: 'asc' }}
            caption={`${placements.length} placements`}
            emptyTitle="No placements configured"
            emptyDescription="A placement is the slot a decision request names. Without one, decidePlacement has nothing to answer."
          />
        </Card>

        {open ? (
          <Card>
            <CardHeader
              title={open.name}
              description={open.description || 'No description.'}
              actions={
                canEdit ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditing(open)}
                    aria-label={`Edit placement ${open.name}`}
                  >
                    Edit
                  </Button>
                ) : null
              }
            />
            <CardBody>
              <dl className="flex flex-col gap-3 text-label">
                <div>
                  <dt className="text-content-subtle">Key</dt>
                  <dd className="font-mono text-content-muted">{open.key}</dd>
                </div>
                <div>
                  <dt className="text-content-subtle">Answered by</dt>
                  <dd>
                    <Link
                      href={`/decision-flows/${open.artifactId}`}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      {open.artifactId}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-content-subtle">Decides for this slot</dt>
                  <dd className="text-content-muted">
                    {open.decidable
                      ? 'Yes — a request for it is answered.'
                      : 'No — a request for it is refused.'}
                  </dd>
                </div>
                <div>
                  <dt className="text-content-subtle">Delivered by</dt>
                  <dd className="text-content-muted">
                    {open.delivery
                      ? open.delivery.mode === 'caller'
                        ? 'Whoever asked, rendering the slate. That is what the storefront does for web.'
                        : `An adapter${open.delivery.adapterId ? ` — ${open.delivery.adapterId}` : ''}.`
                      : 'Nothing. The slot decides and no message leaves the platform.'}
                  </dd>
                </div>
                <div>
                  <dt className="text-content-subtle">Slots</dt>
                  <dd className="tnum text-content-muted">
                    {open.slotCount}
                    {open.type ? ` · ${open.type.replace(/_/g, ' ')}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-content-subtle">Last changed</dt>
                  <dd className="text-content-muted">
                    {new Date(open.updatedAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    by {open.updatedBy}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        ) : null}
      </div>

      <PlacementFormDialog open={creating} onOpenChange={setCreating} onSaved={(p) => setOpenKey(p.key)} />
      {editing ? (
        <PlacementFormDialog
          open
          onOpenChange={(next) => !next && setEditing(null)}
          record={editing}
        />
      ) : null}
    </PageBody>
  );
}

export default function PlacementsPage() {
  // `view:flows` is enforced by `RequireAuth`, from the manifest entry the
  // navigation rail reads. This page wrote the check itself while the
  // manifest declared nothing, so the rail drew a link it would then refuse.
  return (
    <RequireAuth>
      <PlacementsView />
    </RequireAuth>
  );
}
