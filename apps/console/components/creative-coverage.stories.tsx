import type { Meta, StoryObj } from '@storybook/react';
import { CreativeCoverage } from './creative-coverage';
import type { CreativeDto, OfferDto, PlacementDto } from '@/lib/api-client';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The state worth looking hardest at is "Nothing served". Coverage is measured
 * against the channels the tenant's active placements deliver on, so a tenant
 * with none has no columns to measure against — and the screen has to say that
 * rather than render an empty grid that looks like perfect coverage.
 *
 * The three cell states are the reason this screen exists rather than a count:
 * *none* needs content written, *off* needs somebody to switch one on, and the
 * remedies are not the same. The old check could not tell them apart.
 */

const offer = (over: Partial<OfferDto>): OfferDto =>
  ({
    id: 'prop_x',
    key: 'x',
    name: 'Offer',
    description: '',
    objectiveId: 'iss_acquisition',
    categoryId: 'grp_new_mobile',
    status: 'active',
    financials: {
      price: { amount: 3500, currency: 'GBP' },
      cost: { amount: 1200, currency: 'GBP' },
      expectedMargin: { amount: 2300, currency: 'GBP' },
      termMonths: 24,
      oneOff: false,
    },
    validity: { startsAt: '2026-01-01', endsAt: null },
    boost: 1,
    policyIds: [],
    creativeIds: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'x@y.z',
    ...over,
  }) as OfferDto;

const creative = (over: Partial<CreativeDto>): CreativeDto =>
  ({
    id: 'cr',
    offerId: 'prop_x',
    name: 'Creative',
    channel: 'web',
    locale: 'en-GB',
    active: true,
    content: { channel: 'web', headline: 'H', subheadline: 'S', ctaLabel: 'Go' },
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'x@y.z',
    ...over,
  }) as CreativeDto;

const placement = (key: string, channel: string, active = true): PlacementDto =>
  ({
    id: `plc_${key}`,
    key,
    name: key,
    description: '',
    channel,
    slotCount: 1,
    artifactId: 'next-best-action',
    active,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'x@y.z',
  }) as PlacementDto;

const placements = [
  placement('homepage_hero', 'web'),
  placement('weekly_offers_send', 'email'),
  placement('triggered_outbound', 'sms'),
];

const offers = [
  offer({ id: 'p_full', key: 'covered_everywhere', name: 'Covered on every channel' }),
  offer({ id: 'p_partial', key: 'web_only', name: 'Web only — wins email and sends nothing' }),
  offer({ id: 'p_off', key: 'switched_off', name: 'Written, and every copy switched off' }),
  offer({ id: 'p_none', key: 'nothing_at_all', name: 'Active with nothing written' }),
  offer({ id: 'p_draft', key: 'a_draft', name: 'A draft, so not a defect', status: 'draft' }),
];

const creatives = [
  creative({ id: 'c1', offerId: 'p_full', channel: 'web' }),
  creative({ id: 'c2', offerId: 'p_full', channel: 'email' }),
  creative({ id: 'c3', offerId: 'p_full', channel: 'sms' }),
  creative({ id: 'c4', offerId: 'p_partial', channel: 'web' }),
  creative({ id: 'c5', offerId: 'p_off', channel: 'web', active: false }),
  creative({ id: 'c6', offerId: 'p_off', channel: 'email', active: false }),
];

const meta: Meta<typeof CreativeCoverage> = {
  title: 'Catalogue/CreativeCoverage',
  component: CreativeCoverage,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof CreativeCoverage>;

export const AllThreeStates: Story = {
  args: { offers, creatives, placements },
  name: 'live, off and none — three states with three remedies',
};

export const NothingServed: Story = {
  args: { offers, creatives, placements: [placement('homepage_hero', 'web', false)] },
  name: 'No channel served — nothing to measure against',
};

export const Loading: Story = {
  args: { offers: [], creatives: [], placements: [], isLoading: true },
  name: 'Loading — before it can claim anything about the tenant',
};

export const FullyCovered: Story = {
  args: {
    offers: [offers[0]],
    creatives: creatives.slice(0, 3),
    placements,
  },
  name: 'Nothing missing — the state the screen exists to reach',
};
