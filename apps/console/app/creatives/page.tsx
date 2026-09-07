'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import {
  PageBody,
  PageHeader,
  Badge,
  Input,
  Select,
  Field,
  ErrorState,
  PermissionDenied,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FilterBlocks, type FilterBlock } from '@/components/ui/filter-blocks';
import { Button } from '@/components/ui/button';
import { CreativeFormDialog } from '@/components/creative-form-dialog';
import { apiClient, type CreativeDto, type OfferDto } from '@/lib/api-client';
import { summariseCreative } from '@/lib/creative-summary';
import { PLACEMENT_TYPES } from '@metis/core/domain';

/**
 * The content library.
 *
 * Creatives were reachable only through the offer that owns them, so a whole
 * class of question had no answer: what content do we have, what is switched
 * off, which offers have nothing on a channel, where else did we use that line.
 * For a console whose north star is the compliance officer, "show me every
 * piece of content that says X" being unanswerable was the sharp end of it.
 *
 * This changes no modelling. A creative still belongs to exactly one offer —
 * `offerId` is a foreign key — and whether that should stay true is a real
 * question this page exists partly to inform: it is the first surface that can
 * show how much content is duplicated across offers, which is the evidence
 * anyone should want before making creatives shareable.
 */

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  web: 'Web',
  push: 'Push',
  outbound_call: 'Outbound call',
};

const TYPE_LABEL = new Map<string, string>(PLACEMENT_TYPES.map((p) => [p.id, p.label]));

function CreativesView() {
  const [lens, setLens] = useState('all');
  const [channel, setChannel] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CreativeDto | null>(null);

  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:offers');

  const creatives = useQuery({
    queryKey: ['creatives'],
    queryFn: () => apiClient.listAllCreatives(),
    retry: false,
  });

  // The owning offers, for the name and the link. Fetched rather than embedded
  // in the creative: an offer's name is the offer's fact, and duplicating it
  // into every creative is how the two start disagreeing.
  const offers = useQuery({
    queryKey: ['offers'],
    queryFn: () => apiClient.listOffers(),
    retry: false,
  });

  const byOffer = useMemo(
    () => new Map((offers.data?.offers ?? []).map((o: OfferDto) => [o.id, o])),
    [offers.data]
  );

  const all = creatives.data?.creatives ?? [];

  const LENSES: (FilterBlock & { match: (c: CreativeDto) => boolean })[] = [
    { id: 'all', label: 'Creatives', sub: 'in this catalogue', value: all.length, match: () => true },
    {
      id: 'active',
      label: 'Delivering',
      sub: 'active, on an active offer',
      tone: 'pass',
      value: all.filter((c) => c.active && byOffer.get(c.offerId)?.status === 'active').length,
      match: (c) => c.active && byOffer.get(c.offerId)?.status === 'active',
    },
    {
      id: 'off',
      label: 'Switched off',
      sub: 'written, not delivering',
      tone: 'hold',
      value: all.filter((c) => !c.active).length,
      match: (c) => !c.active,
    },
    {
      id: 'unshaped',
      label: 'No placement',
      sub: 'web creatives with no slot',
      tone: 'neutral',
      value: all.filter(
        (c) => c.channel === 'web' && !(c.content as { placement?: string }).placement
      ).length,
      match: (c) => c.channel === 'web' && !(c.content as { placement?: string }).placement,
    },
  ];

  const filtered = useMemo(() => {
    const active = LENSES.find((l) => l.id === lens) ?? LENSES[0];
    const q = search.toLowerCase().trim();
    return all.filter((c) => {
      if (!active.match(c)) return false;
      if (channel && c.channel !== channel) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        summariseCreative(c).toLowerCase().includes(q) ||
        (byOffer.get(c.offerId)?.name ?? '').toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, lens, channel, search, byOffer]);

  const columns: Column<CreativeDto>[] = [
    {
      key: 'name',
      header: 'Creative',
      width: 'w-72',
      sortValue: (c) => c.name,
      cell: (c) => (
        // Bounded, not just `truncate`. The table lays out automatically, so a
        // column width is a hint and a long line of copy overrides it — one SMS
        // stretched this column to 1226px and pushed every other column off the
        // side. `truncate` needs a width to truncate against.
        <div className="min-w-0 max-w-[16rem]">
          <p className="truncate text-body font-medium text-content">{c.name}</p>
          <p className="truncate text-label text-content-subtle">{summariseCreative(c)}</p>
        </div>
      ),
    },
    {
      key: 'offer',
      header: 'Offer',
      width: 'w-56',
      sortValue: (c) => byOffer.get(c.offerId)?.name ?? '',
      cell: (c) => {
        const offer = byOffer.get(c.offerId);
        if (!offer) {
          // Should not happen — the endpoint refuses a creative whose offer
          // does not exist — so say so rather than rendering a blank cell.
          return <span className="text-label text-block">orphaned: {c.offerId}</span>;
        }
        return (
          // Truncated rather than wrapped: a three-line offer name makes every
          // row in the table as tall as the longest one.
          <Link
            href={`/offers/${offer.id}`}
            className="block truncate text-body text-accent underline-offset-2 hover:underline"
            title={offer.name}
          >
            {offer.name}
          </Link>
        );
      },
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 'w-32',
      sortValue: (c) => c.channel,
      cell: (c) => <Badge tone="outline">{CHANNEL_LABEL[c.channel] ?? c.channel}</Badge>,
    },
    {
      key: 'placement',
      header: 'Placement',
      width: 'w-44',
      secondary: true,
      sortValue: (c) => (c.content as { placement?: string }).placement ?? '',
      cell: (c) => {
        if (c.channel !== 'web') return <span className="text-content-subtle">—</span>;
        const content = c.content as { placement?: string; placementType?: string };
        return (
          <div className="min-w-0">
            <p className="truncate font-mono text-label text-content-muted">
              {content.placement || 'any slot'}
            </p>
            <p className="truncate text-label text-content-subtle">
              {content.placementType ? TYPE_LABEL.get(content.placementType) : 'any shape'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'locale',
      header: 'Locale',
      width: 'w-20',
      // Hidden on narrow viewports, along with Placement. Everything is en-GB
      // until i18n exists (ADR-005), so it is the column worth losing first —
      // and losing it keeps Edit on screen rather than behind a scroll.
      secondary: true,
      sortValue: (c) => c.locale,
      cell: (c) => <span className="font-mono text-label text-content-muted">{c.locale}</span>,
    },
    {
      key: 'active',
      header: 'Delivery',
      width: 'w-28',
      sortValue: (c) => (c.active ? 1 : 0),
      cell: (c) => (
        <Badge tone={c.active ? 'pass' : 'hold'}>{c.active ? 'active' : 'off'}</Badge>
      ),
    },
    {
      key: 'edit',
      header: <span className="sr-only">Actions</span>,
      width: 'w-20',
      align: 'right',
      cell: (c) =>
        canEdit ? (
          <Button variant="secondary" size="sm" onClick={() => setEditing(c)}>
            Edit
          </Button>
        ) : null,
    },
  ];

  if (creatives.error || offers.error) {
    return (
      <PageBody>
        <ErrorState
          title="Could not load the content library"
          description={(creatives.error ?? offers.error)?.message ?? 'Unknown error'}
          onRetry={() => {
            void creatives.refetch();
            void offers.refetch();
          }}
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title="Creatives"
        description="Every piece of content in the catalogue, across offers. A creative belongs to one offer and is delivered on one channel."
      />

      <FilterBlocks
        blocks={LENSES.map(({ match: _match, ...b }) => b)}
        activeId={lens}
        onSelect={setLens}
        label="Filter creatives"
        className="mb-stack"
      />

      <div className="mb-stack flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          {/* Not "Search": the header carries a global search with that
              accessible name, and two controls called the same thing on one
              page is an ambiguity for anyone navigating by name rather than by
              eye. Found by a test that could not tell them apart either. */}
          <Field label="Search content" htmlFor="creative-search">
            <Input
              id="creative-search"
              value={search}
              placeholder="e.g. unlimited, or the offer name"
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-48">
          <Field label="Channel" htmlFor="creative-channel-filter">
            <Select
              id="creative-channel-filter"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="">All channels</option>
              {Object.entries(CHANNEL_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(c) => c.id}
        isLoading={creatives.isLoading || offers.isLoading}
        caption={`${filtered.length} of ${all.length} creatives`}
        defaultSort={{ key: 'name', dir: 'asc' }}
        emptyTitle="No creatives match"
        emptyDescription="Content is written on an offer. Open one and add a creative there."
      />

      {editing ? (
        <CreativeFormDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          offerId={editing.offerId}
          creative={editing}
        />
      ) : null}
    </PageBody>
  );
}

export default function CreativesPage() {
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
        <PermissionDenied permission="view:offers" />
      </PageBody>
    );
  }
  return <CreativesView />;
}
