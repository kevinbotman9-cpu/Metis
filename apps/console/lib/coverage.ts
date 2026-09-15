import type { CascadeStage } from '@/components/cascade-rail';
import type { CreativeDto, OfferDto, PlacementDto } from '@/lib/api-client';
import type { Formatter } from '@/lib/format';
import { pct } from '@/lib/loop';

/**
 * Content coverage as a decomposition — the arithmetic behind
 * `/creatives?view=coverage`, shared by its rail, its table and its evidence.
 *
 * ADR-012 §B3 measures an offer's content against the channels a placement
 * actually delivers on. Read as a Cascade (§4.7) it has a spine, and the spine is
 * the reason it earns a rail: of the offers that can win a decision, those with
 * content written for a delivering channel, of those the ones with that content
 * switched on, and of those the ones with nothing missing on any delivering
 * channel. Each stage is a subset of the one above.
 *
 * **The channels are not the stages.** Web, email and SMS are parallel; an offer
 * is on some and not others. They stay in the matrix in the middle pane, where
 * a reader looks up one offer on one channel. A rail of channels would be a
 * table of contents wearing a decomposition's clothes.
 */

/** One offer's content on one channel. The three states have three remedies. */
export type CellState = 'live' | 'off' | 'none';

/** What each state means, in the words the legend and the evidence both use. */
export const CELL: Record<CellState, { label: string; tone: 'pass' | 'hold' | 'block'; means: string }> = {
  live: { label: 'live', tone: 'pass', means: 'an active creative exists for this channel' },
  off: { label: 'off', tone: 'hold', means: 'content exists and every copy of it is switched off' },
  none: { label: 'none', tone: 'block', means: 'nothing is written for this channel' },
};

export interface CoverageRow {
  offer: OfferDto;
  /** Channel → state, over the channels this tenant delivers on. */
  cells: Record<string, CellState>;
  /** Delivering channels where nothing live can be sent. */
  holes: number;
  /** At least one delivering channel has live content. */
  deliverable: boolean;
}

/** The channels a placement delivers on — the only ones content is measured against. */
export function deliveringChannels(placements: readonly PlacementDto[]): string[] {
  return [...new Set(placements.filter((p) => p.delivery).map((p) => p.channel))].sort();
}

/** Channels where a slot decides and nothing sends the result. Named, not hidden. */
export function undeliverableChannels(placements: readonly PlacementDto[]): string[] {
  return [...new Set(placements.filter((p) => p.decidable && !p.delivery).map((p) => p.channel))].sort();
}

export function coverageRows(
  offers: readonly OfferDto[],
  creatives: readonly CreativeDto[],
  channels: readonly string[]
): CoverageRow[] {
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
      cells[ch] = onChannel.some((c) => c.active) ? 'live' : onChannel.length > 0 ? 'off' : 'none';
    }
    const holes = channels.filter((ch) => cells[ch] !== 'live').length;
    return { offer, cells, holes, deliverable: holes < channels.length };
  });
}

/** Only active offers can win a decision, so only they can render nothing. */
export const liveRows = (rows: readonly CoverageRow[]) => rows.filter((r) => r.offer.status === 'active');

export type CoverageStageId = 'active' | 'written' | 'switched_on' | 'every_channel';

const written = (r: CoverageRow) => Object.values(r.cells).some((s) => s !== 'none');

/** What a row has to be to reach a stage. Each implies the one before. */
const REACHES: Record<CoverageStageId, (r: CoverageRow) => boolean> = {
  active: () => true,
  written,
  switched_on: (r) => r.deliverable,
  every_channel: (r) => r.holes === 0,
};

const ORDER: CoverageStageId[] = ['active', 'written', 'switched_on', 'every_channel'];

/** The rows that reached the stage before this one and not this one. */
export function fellOutAt(stage: CoverageStageId, rows: readonly CoverageRow[]): CoverageRow[] {
  const i = ORDER.indexOf(stage);
  if (i <= 0) return [];
  const before = REACHES[ORDER[i - 1]];
  const here = REACHES[stage];
  return rows.filter((r) => before(r) && !here(r));
}

export function coverageStages(live: readonly CoverageRow[], format: Formatter): CascadeStage[] {
  const count = (id: CoverageStageId) => live.filter(REACHES[id]).length;
  const active = count('active');
  const writtenN = count('written');
  const on = count('switched_on');
  const every = count('every_channel');
  const nothingToSend = active - on;
  const share = (n: number) => (active === 0 ? 0 : (n / active) * 100);

  return [
    { id: 'active', label: 'Active offers', value: active, pct: 100, note: 'can win a decision' },
    {
      id: 'written',
      label: 'Written for a channel that delivers',
      value: writtenN,
      pct: share(writtenN),
      note: `${pct(writtenN, active, format)} of active`,
      tone: 'accent',
      removed: active - writtenN,
    },
    {
      id: 'switched_on',
      label: 'Switched on',
      value: on,
      pct: share(on),
      note: `${pct(on, writtenN, format)} of written`,
      tone: 'ok',
      removed: writtenN - on,
      // A break when any offer that can win has nothing live to send: it is
      // decided and reaches nobody, which is not a poor result but a broken one.
      broken:
        nothingToSend > 0
          ? `${format.number(nothingToSend)} active ${nothingToSend === 1 ? 'offer has' : 'offers have'} nothing live on any channel that delivers. ${nothingToSend === 1 ? 'It can' : 'They can'} win a decision and reach nobody.`
          : undefined,
    },
    {
      id: 'every_channel',
      label: 'Every delivering channel',
      value: every,
      pct: share(every),
      note: `${pct(every, on, format)} of switched on`,
      tone: 'ok',
      removed: on - every,
    },
  ];
}
