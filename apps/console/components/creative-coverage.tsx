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
import { CascadeRail } from '@/components/cascade-rail';
import { CascadePanes } from '@/components/cascade-panes';
import {
  EvidenceAction,
  EvidenceFields,
  EvidenceLabel,
  EvidencePick,
  EvidenceQuote,
  EvidenceRow,
} from '@/components/ui/evidence';
import { useFormat } from '@/components/tenant-format';
import {
  CELL,
  coverageRows,
  coverageStages,
  deliveringChannels,
  fellOutAt,
  liveRows,
  undeliverableChannels as undeliverableOf,
  type CoverageRow,
  type CoverageStageId,
} from '@/lib/coverage';
import type { CreativeDto, OfferDto, PlacementDto } from '@/lib/api-client';

/**
 * What the catalogue can and cannot deliver, offer by channel — as a Cascade.
 *
 * ADR-012 §B3. The platform had two guards against an offer that cannot be
 * delivered and both were channel-blind, so the state they were meant to
 * prevent was reachable in bulk and visible nowhere: on 2026-09-10, **127 of
 * the 202 active offers had no active web creative**, 200 had nothing for an
 * outbound call, and 38 had nothing on any channel at all.
 *
 * **It earns a rail (§4.7) because it has a spine.** Of the offers that can win
 * a decision, those with content written for a delivering channel, of those the
 * ones switched on, and of those the ones missing nothing — each a subset of the
 * one above, and the first question is where it falls off. The arithmetic is
 * `lib/coverage.ts`. The four filter blocks this replaced were a partition, not
 * stages: "nothing to send", "partly covered" and "every channel" divided the
 * active offers, and a rail over them would have claimed a nesting that is not
 * there.
 *
 * **The channels stay in the matrix, not the rail.** They are parallel, and a
 * reader looks up one offer on one channel.
 *
 * **Channels come from the placements, not from a list here.** A channel this
 * tenant does not serve is not a hole; it is a column that should not exist.
 */

export interface CreativeCoverageProps {
  offers: readonly OfferDto[];
  creatives: readonly CreativeDto[];
  placements: readonly PlacementDto[];
  isLoading?: boolean;
}

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  web: 'Web',
  push: 'Push',
  outbound_call: 'Call',
};

/** What falls out at each stage, in the words the legend already uses. */
const FELL_OUT_BECAUSE: Record<Exclude<CoverageStageId, 'active'>, string> = {
  written: `On every channel that delivers, ${CELL.none.means}.`,
  switched_on: `On every channel that delivers, either ${CELL.off.means} or ${CELL.none.means}.`,
  every_channel: `Live somewhere, and on at least one channel that delivers, ${CELL.off.means} or ${CELL.none.means}.`,
};

export function CreativeCoverage({ offers, creatives, placements, isLoading }: CreativeCoverageProps) {
  const format = useFormat();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');

  /**
   * The channels this tenant can actually reach somebody on.
   *
   * `p.delivery`, not `p.active` — and the difference is the whole correction.
   * Until 2026-09-10 this counted content against every *decidable* slot, which
   * on the seeded tenant meant five channels, four of which have nothing that
   * sends. ADR-013 §2.
   */
  const channels = useMemo(() => deliveringChannels(placements), [placements]);
  const undeliverableChannels = useMemo(() => undeliverableOf(placements), [placements]);
  const live = useMemo(() => liveRows(coverageRows(offers, creatives, channels)), [offers, creatives, channels]);
  const stages = useMemo(() => coverageStages(live, format), [live, format]);
  const stage = stages.find((s) => s.id === selected) ?? null;

  const inView = useMemo(() => {
    const base = stage && stage.id !== 'active' ? fellOutAt(stage.id as CoverageStageId, live) : live;
    const q = search.toLowerCase().trim();
    return base.filter((r) => {
      if (channelFilter && r.cells[channelFilter] === 'live') return false;
      if (!q) return true;
      return r.offer.name.toLowerCase().includes(q) || r.offer.key.toLowerCase().includes(q);
    });
  }, [stage, live, search, channelFilter]);

  const columns: Column<CoverageRow>[] = [
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
      (ch): Column<CoverageRow> => ({
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
  // the tenant and until the placements arrive there is nothing to claim.
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

  const breakStage = stages.find((s) => s.broken);
  const firstFallen = stage && stage.id !== 'active' ? fellOutAt(stage.id as CoverageStageId, live)[0] : undefined;

  return (
    <>
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
                  {undeliverableChannels.length === 1 ? 'channel decides' : 'channels decide'} and nothing
                  delivers the result
                </p>
                <p className="mt-1 text-body text-content-muted">
                  {undeliverableChannels.map((ch) => CHANNEL_LABEL[ch] ?? ch).join(', ')}: content here
                  can&apos;t reach anyone. Coverage below counts deliverable channels only.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <CascadePanes
        rail={
          <CascadeRail
            label="Coverage, by stage"
            stages={stages}
            selected={selected}
            onSelect={setSelected}
            foot={
              <>
                Counts active offers against the <strong className="font-semibold">channels that deliver</strong>.
                Each stage is within the one above.
              </>
            }
          />
        }
        evidence={
          stage ? (
            <>
              <EvidenceLabel>{stage.label}</EvidenceLabel>
              <EvidencePick>
                {format.number(stage.value)} · {stage.note}
              </EvidencePick>
              {stage.broken ? (
                <EvidenceQuote title="Why it breaks here" tone="block">
                  {stage.broken}
                </EvidenceQuote>
              ) : stage.id !== 'active' ? (
                <EvidenceQuote title="What falls out here" tone="hold">
                  {FELL_OUT_BECAUSE[stage.id as Exclude<CoverageStageId, 'active'>]}
                </EvidenceQuote>
              ) : null}
              <EvidenceFields>
                {stage.id !== 'active' ? (
                  <EvidenceRow label="Fell out at this stage">
                    <span className="tnum">{format.number(stage.removed ?? 0)}</span>
                  </EvidenceRow>
                ) : null}
                {channels.map((ch) => (
                  <EvidenceRow key={ch} label={`Live on ${CHANNEL_LABEL[ch] ?? ch}`}>
                    <span className="tnum">
                      {format.number(live.filter((r) => r.cells[ch] === 'live').length)}
                    </span>
                  </EvidenceRow>
                ))}
              </EvidenceFields>
              {firstFallen ? (
                <EvidenceAction href={`/offers/${firstFallen.offer.id}`} primary sub="Its content, channel by channel">
                  Open the first offer that fell out here
                </EvidenceAction>
              ) : null}
            </>
          ) : (
            <>
              <EvidenceLabel>Coverage</EvidenceLabel>
              <EvidencePick>
                {format.number(stages.find((s) => s.id === 'switched_on')!.value)} of{' '}
                {format.number(live.length)} active offers can send something
              </EvidencePick>
              {breakStage?.broken ? (
                <EvidenceQuote title="Where it breaks" tone="block">
                  {breakStage.broken}
                </EvidenceQuote>
              ) : null}
              <EvidenceFields>
                {channels.map((ch) => (
                  <EvidenceRow key={ch} label={`Live on ${CHANNEL_LABEL[ch] ?? ch}`}>
                    <span className="tnum">
                      {format.number(live.filter((r) => r.cells[ch] === 'live').length)}
                    </span>
                  </EvidenceRow>
                ))}
              </EvidenceFields>
              <p className="mt-3 text-label text-content-subtle">Select a stage to see the offers that fell out there.</p>
            </>
          )
        }
      >
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
              <Select id="coverage-channel" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
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

        <Card>
          <CardHeader
            title="Content coverage"
            description={
              stage && stage.id !== 'active'
                ? `${format.number(stage.removed ?? 0)} active offers reached the stage before ${stage.label.toLowerCase()} and not this one.`
                : undefined
            }
          />
          <DataTable
            columns={columns}
            rows={inView}
            rowKey={(r) => r.offer.id}
            isLoading={isLoading}
            defaultSort={{ key: 'holes', dir: 'desc' }}
            caption={`${inView.length} of ${live.length} active offers`}
            emptyTitle="No offer matches"
            emptyDescription="Every active offer in view has live content on every channel this tenant serves."
          />
          {/* Legible rather than hoverable. A `title` reaches a mouse and nothing
              else, which is the defect W-055 already tracks. */}
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
      </CascadePanes>
    </>
  );
}
