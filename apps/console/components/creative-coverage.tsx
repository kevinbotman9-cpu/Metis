'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  Field,
  Input,
  Select,
  EmptyState,
  LoadingState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FilterBlocks, type FilterBlock } from '@/components/ui/filter-blocks';
import type { CreativeDto, OfferDto, PlacementDto } from '@/lib/api-client';

/**
 * What the catalogue can and cannot deliver, offer by channel.
 *
 * ADR-012 §B3. The platform had two guards against an offer that cannot be
 * delivered and both were channel-blind, so the state they were meant to
 * prevent was reachable in bulk and visible nowhere: on 2026-09-10, **127 of
 * the 202 active offers had no active web creative**, 200 had nothing for an
 * outbound call, and 38 had nothing on any channel at all. The only surface
 * that said so was the storefront, rendering *"won this slot, and has no web
 * creative for it"* to whoever happened to be watching a demo.
 *
 * This is the same fact addressed to the person who can fix it. It is a join of
 * three reads the console already makes — the taxonomy, the creatives and the
 * placements — and adds no endpoint, because the data was never missing. Only
 * the question was.
 *
 * **Channels come from the placements, not from a list here.** A channel this
 * tenant does not serve is not a hole; it is a column that should not exist.
 * Switch a placement off and its channel leaves this table, which is the same
 * rule `offerMayBeActive` and `NO_DELIVERABLE_CREATIVE` now apply.
 */

export interface CreativeCoverageProps {
  offers: readonly OfferDto[];
  creatives: readonly CreativeDto[];
  placements: readonly PlacementDto[];
  isLoading?: boolean;
}

/** One offer's content on one channel. The three states have three remedies. */
type CellState = 'live' | 'off' | 'none';

const CELL: Record<CellState, { label: string; tone: 'pass' | 'hold' | 'block'; means: string }> = {
  live: { label: 'live', tone: 'pass', means: 'an active creative exists for this channel' },
  off: { label: 'off', tone: 'hold', means: 'content exists and every copy of it is switched off' },
  none: { label: 'none', tone: 'block', means: 'nothing is written for this channel' },
};

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  web: 'Web',
  push: 'Push',
  outbound_call: 'Call',
};

interface Row {
  offer: OfferDto;
  /** Channel → state, over the channels this tenant serves. */
  cells: Record<string, CellState>;
  /** Channels served where nothing can be sent. */
  holes: number;
  deliverable: boolean;
}

export function CreativeCoverage({
  offers,
  creatives,
  placements,
  isLoading,
}: CreativeCoverageProps) {
  const [lens, setLens] = useState('all');
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');

  /**
   * The channels this tenant can actually reach somebody on.
   *
   * `p.delivery`, not `p.active` — and the difference is the whole correction.
   * Until 2026-09-10 this counted content against every *decidable* slot, which
   * on the seeded tenant meant five channels, four of which have nothing that
   * sends. It reported 38 offers with "nothing to send" when the number that
   * can actually reach a customer is 127, and it showed 164 offers as "partly
   * covered" against holes on channels no message could have left through.
   *
   * That is the same shape of error as counting a decision that won a slot as
   * an impression (G-041): a denominator counting what the platform *decided*
   * where the question was what it can *deliver*. ADR-013 §2.
   */
  const channels = useMemo(
    () => [...new Set(placements.filter((p) => p.delivery).map((p) => p.channel))].sort(),
    [placements]
  );

  /** Slots that decide and have nothing to send the result. Named, not hidden. */
  const undeliverableChannels = useMemo(
    () =>
      [
        ...new Set(
          placements.filter((p) => p.decidable && !p.delivery).map((p) => p.channel)
        ),
      ].sort(),
    [placements]
  );

  const rows = useMemo<Row[]>(() => {
    const byOffer = new Map<string, CreativeDto[]>();
    for (const c of creatives) {
      const own = byOffer.get(c.offerId) ?? [];
      own.push(c);
      byOffer.set(c.offerId, own);
    }

    return offers.map((offer) => {
      const own = byOffer.get(offer.id) ?? [];
      const cells: Record<string, CellState> = {};
      for (const ch of channels) {
        const onChannel = own.filter((c) => c.channel === ch);
        cells[ch] = onChannel.some((c) => c.active)
          ? 'live'
          : onChannel.length > 0
            ? 'off'
            : 'none';
      }
      const holes = channels.filter((ch) => cells[ch] !== 'live').length;
      return { offer, cells, holes, deliverable: holes < channels.length };
    });
  }, [offers, creatives, channels]);

  // Only active offers can win a decision, so only they can render nothing.
  // A draft with no content is a draft, not a defect.
  const live = useMemo(() => rows.filter((r) => r.offer.status === 'active'), [rows]);

  const LENSES: (FilterBlock & { match: (r: Row) => boolean })[] = [
    {
      id: 'all',
      label: 'Active offers',
      sub: 'that can win a decision',
      value: live.length,
      match: () => true,
    },
    {
      id: 'undeliverable',
      label: 'Nothing to send',
      sub: 'on any channel served',
      tone: 'block',
      value: live.filter((r) => !r.deliverable).length,
      match: (r) => !r.deliverable,
    },
    {
      id: 'partial',
      label: 'Partly covered',
      sub: 'a hole on at least one channel',
      tone: 'hold',
      value: live.filter((r) => r.deliverable && r.holes > 0).length,
      match: (r) => r.deliverable && r.holes > 0,
    },
    {
      id: 'complete',
      label: 'Every channel',
      sub: 'nothing missing',
      tone: 'pass',
      value: live.filter((r) => r.holes === 0).length,
      match: (r) => r.holes === 0,
    },
  ];

  const filtered = useMemo(() => {
    const active = LENSES.find((l) => l.id === lens) ?? LENSES[0];
    const q = search.toLowerCase().trim();
    return live.filter((r) => {
      if (!active.match(r)) return false;
      if (channelFilter && r.cells[channelFilter] === 'live') return false;
      if (!q) return true;
      return (
        r.offer.name.toLowerCase().includes(q) || r.offer.key.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, lens, search, channelFilter]);

  const columns: Column<Row>[] = [
    {
      key: 'offer',
      header: 'Offer',
      width: 'w-72',
      sortValue: (r) => r.offer.name,
      cell: (r) => (
        <div className="min-w-0 max-w-[18rem]">
          {/* Every figure on this screen reaches the thing it counts. */}
          <Link
            href={`/offers/${r.offer.id}`}
            className="block truncate text-body font-medium text-accent underline-offset-2 hover:underline"
            title={r.offer.name}
          >
            {r.offer.name}
          </Link>
          <p className="truncate font-mono text-label text-content-subtle">{r.offer.key}</p>
        </div>
      ),
    },
    ...channels.map(
      (ch): Column<Row> => ({
        key: ch,
        header: CHANNEL_LABEL[ch] ?? ch,
        width: 'w-24',
        sortValue: (r) => ({ none: 0, off: 1, live: 2 })[r.cells[ch]],
        cell: (r) => {
          const state = CELL[r.cells[ch]];
          return <Badge tone={state.tone}>{state.label}</Badge>;
        },
      })
    ),
    {
      key: 'holes',
      header: 'Cannot send',
      width: 'w-32',
      align: 'right',
      sortValue: (r) => r.holes,
      cell: (r) => (
        <span className={r.holes === 0 ? 'text-content-subtle' : 'tnum text-content-muted'}>
          {r.holes === 0 ? '—' : `${r.holes} of ${channels.length}`}
        </span>
      ),
    },
  ];

  // `isLoading` first, because "no channel is being served" is a claim about
  // the tenant and until the placements arrive there is nothing to claim. This
  // rendered the empty state on every first paint until 2026-09-10, which is a
  // screen asserting a fact it had not been told yet.
  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <LoadingState label="Measuring content against the channels served" />
        </CardBody>
      </Card>
    );
  }

  if (channels.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            title="Nothing can be delivered"
            description="Coverage is measured against the channels a placement actually delivers on, and no placement has a delivery mode. Every slot here decides and nothing sends the result, so there is no denominator to measure content against."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <FilterBlocks
        blocks={LENSES.map(({ match: _match, ...b }) => b)}
        activeId={lens}
        onSelect={setLens}
        label="Filter by coverage"
        className="mb-stack"
      />

      <div className="mb-stack flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <Field label="Search offers" htmlFor="coverage-search">
            <Input
              id="coverage-search"
              value={search}
              placeholder="e.g. broadband, or the offer key"
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>
        <div className="w-56">
          <Field label="Missing on channel" htmlFor="coverage-channel">
            <Select
              id="coverage-channel"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
            >
              <option value="">Any channel</option>
              {channels.map((ch) => (
                <option key={ch} value={ch}>
                  {CHANNEL_LABEL[ch] ?? ch}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {undeliverableChannels.length > 0 ? (
        // Stated rather than silently excluded. These channels decide and
        // nothing sends the result, so counting content holes in them would be
        // measuring against a denominator that cannot deliver — but leaving
        // them off the screen entirely would hide the larger fact. ADR-013 §2.
        <Card className="mb-stack border-hold/40">
          <CardBody>
            <div className="flex flex-wrap items-start gap-3">
              <Badge tone="hold">Not counted</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-content">
                  {undeliverableChannels.length}{' '}
                  {undeliverableChannels.length === 1 ? 'channel decides' : 'channels decide'} and
                  nothing delivers the result
                </p>
                <p className="mt-1 text-body text-content-muted">
                  {undeliverableChannels
                    .map((ch) => CHANNEL_LABEL[ch] ?? ch)
                    .join(', ')}{' '}
                  — every slot on{' '}
                  {undeliverableChannels.length === 1 ? 'this channel' : 'these channels'} is
                  decidable and has no delivery mode, so content written for{' '}
                  {undeliverableChannels.length === 1 ? 'it' : 'them'} could not reach anybody.
                  Coverage below is measured against what can actually be delivered.
                </p>
                <p className="mt-1.5 text-label text-content-subtle">
                  ADR-013. The adapter is W-017, blocked on W-008 — there is no recipient
                  address in the profile schema.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Content coverage"
          description="One row per active offer, one column per channel this tenant can deliver on. An offer with nothing live on a channel wins that channel's slots and renders nothing in them."
        />
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.offer.id}
          isLoading={isLoading}
          defaultSort={{ key: 'holes', dir: 'desc' }}
          caption={`${filtered.length} of ${live.length} active offers`}
          emptyTitle="No offer matches"
          emptyDescription="Every active offer has live content on every channel this tenant serves."
        />
        {/* Legible rather than hoverable. A `title` reaches a mouse and nothing
            else, which is the defect W-055 already tracks — a three-state cell
            whose states are explained only on hover would add a fourth site of
            it. */}
        <CardBody className="border-t border-border pt-3">
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-label">
            {(['live', 'off', 'none'] as const).map((state) => (
              <div key={state} className="flex items-center gap-2">
                <dt>
                  <Badge tone={CELL[state].tone}>{CELL[state].label}</Badge>
                </dt>
                <dd className="text-content-muted">{CELL[state].means}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </>
  );
}
