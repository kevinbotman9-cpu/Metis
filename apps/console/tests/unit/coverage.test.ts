import { describe, it, expect } from 'vitest';
import {
  coverageRows,
  coverageStages,
  deliveringChannels,
  fellOutAt,
  liveRows,
  undeliverableChannels,
  type CoverageStageId,
} from '@/lib/coverage';
import { formatterFor } from '@/lib/format';
import type { CreativeDto, OfferDto, PlacementDto } from '@/lib/api-client';

/**
 * Content coverage as a decomposition. The rail on `/creatives?view=coverage`
 * rests on the stages nesting — active, written for a delivering channel,
 * switched on, every delivering channel — so these hold that, and that the
 * offers falling out at each stage and the survivors add back up to the active
 * offers.
 */

const F = formatterFor({ locale: 'en-US', currency: 'USD' });

const offer = (id: string, status = 'active') => ({ id, key: id, name: id, status }) as unknown as OfferDto;
const creative = (offerId: string, channel: string, active: boolean) =>
  ({ id: `${offerId}_${channel}`, offerId, channel, active }) as unknown as CreativeDto;
const placement = (channel: string, delivery: boolean, decidable = true) =>
  ({ id: `pl_${channel}`, channel, delivery: delivery ? 'push' : null, decidable }) as unknown as PlacementDto;

const placements = [placement('web', true), placement('email', true), placement('sms', false)];
const offers = [
  offer('everywhere'), // live on web and email
  offer('web_only'), // live on web, nothing on email
  offer('switched_off'), // written on email, switched off
  offer('nothing'), // no content at all
  offer('sms_only'), // content only on a channel that does not deliver
  offer('a_draft', 'draft'), // not active, never counted
];
const creatives = [
  creative('everywhere', 'web', true),
  creative('everywhere', 'email', true),
  creative('web_only', 'web', true),
  creative('switched_off', 'email', false),
  creative('sms_only', 'sms', true),
];

const channels = deliveringChannels(placements);
const live = liveRows(coverageRows(offers, creatives, channels));
const stages = coverageStages(live, F);
const value = (id: CoverageStageId) => stages.find((s) => s.id === id)!.value;

describe('coverage as a decomposition', () => {
  it('measures against delivering channels only, and names the ones that decide and send nothing', () => {
    expect(channels).toEqual(['email', 'web']);
    expect(undeliverableChannels(placements)).toEqual(['sms']);
  });

  it('counts active offers only', () => {
    expect(live.map((r) => r.offer.id)).not.toContain('a_draft');
    expect(value('active')).toBe(5);
  });

  it('nests: every stage is within the one above', () => {
    expect(stages.map((s) => s.id)).toEqual(['active', 'written', 'switched_on', 'every_channel']);
    // written: everywhere, web_only, switched_off. Content on SMS alone is not
    // written for a channel that delivers.
    expect(stages.map((s) => s.value)).toEqual([5, 3, 2, 1]);
    for (let i = 1; i < stages.length; i++) expect(stages[i].value).toBeLessThanOrEqual(stages[i - 1].value);
  });

  it('accounts for every active offer: what fell out at each stage, and what reached the last', () => {
    const fell = (['written', 'switched_on', 'every_channel'] as const).map((id) => fellOutAt(id, live).map((r) => r.offer.id));
    expect(fell).toEqual([['nothing', 'sms_only'], ['switched_off'], ['web_only']]);
    expect(fell.flat().length + value('every_channel')).toBe(value('active'));
  });

  it('draws the break where an active offer has nothing live to send, and says how many', () => {
    const on = stages.find((s) => s.id === 'switched_on')!;
    expect(on.broken).toMatch(/^3 active offers have nothing live on any channel that delivers/);
  });

  it('draws no break when every active offer has something live', () => {
    const covered = liveRows(coverageRows([offer('everywhere')], creatives, channels));
    expect(coverageStages(covered, F).some((s) => s.broken)).toBe(false);
  });
});
