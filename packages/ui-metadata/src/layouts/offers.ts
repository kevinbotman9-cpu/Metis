import type { ListDetailManifest } from './types';

/**
 * Offers, declared. `docs/METIS_CONSOLE_SPEC.md` Part 3: *"Offers | List–detail |
 * Properties, versions, effective dates, creatives beneath."*
 *
 * Until 2026-09-13 an offer was three surfaces: a catalogue table, a drawer over
 * it, and `/offers/[id]`, a page reached by leaving the list. §4.1 asks for none
 * of that — *no page navigation between list and detail* — so the drawer and the
 * page are one detail pane, and `/offers/[id]` is this screen with that offer
 * open. Every link already written to an offer, from a trace or the coverage
 * screen, still lands on it.
 *
 * The catalogue's summary blocks were derived filters — an offer that can be
 * selected, one that cannot be delivered, one that is boosted — and are derived
 * facets here, counted like any other. The objective › category tree is two
 * facets over the taxonomy's own options.
 */
export const offersLayout = {
  id: 'offers',
  route: '/offers',
  formatVersion: 1,
  pattern: 'list-detail',
  title: 'Offers',
  description: 'The offer catalogue, organised by business objective and product category.',
  params: {
    list: {
      source: 'offers',
      title: 'name',
      subtitle: 'key',
      columns: [{ field: 'status', label: 'Status' }, 'categoryId', 'boost'],
      facets: [
        'objectiveId',
        'categoryId',
        {
          field: 'status',
          label: 'Status',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
            { value: 'retired', label: 'Retired' },
          ],
        },
        {
          // "has no creative", not "no active creative": the list carries an
          // offer's creative ids and not whether any is switched on. The Reach
          // tab, which reads the creatives, can say which channels.
          field: 'reach',
          label: 'Deliverable',
          options: [
            { value: 'selectable', label: 'Selectable — active, with content' },
            { value: 'undeliverable', label: 'Cannot be delivered — has no creative' },
            { value: 'not-live', label: 'Not live' },
          ],
        },
        {
          field: 'boosted',
          label: 'Boost',
          options: [
            { value: 'true', label: 'Above 1.0' },
            { value: 'false', label: '1.0 or below' },
          ],
        },
      ],
      sort: { field: 'name', dir: 'asc' },
      empty: {
        title: 'No offers yet',
        description: 'An offer is filed under a category, and starts as a draft until it has something to deliver.',
      },
    },
    detail: {
      entity: 'Offer',
      description: 'description',
      footer: { state: 'status', editedAt: 'updatedAt', editedBy: 'updatedBy' },
    },
    detailRoute: '/offers/[id]',
  },
  slots: {
    'detail.actions': [{ id: 'status', panel: 'offers.status' }],
    'detail.tabs': [
      { id: 'overview', panel: 'core.entity-overview', label: 'Overview' },
      {
        id: 'creatives',
        panel: 'core.related-list',
        label: 'Creatives',
        params: {
          source: 'offer.creatives',
          entity: 'Creative',
          title: 'name',
          subtitle: 'locale',
          columns: ['channel', 'active'],
          empty: {
            title: 'No creatives yet',
            description:
              'An offer needs at least one active creative before it can be delivered. This one cannot currently win a decision.',
          },
        },
      },
      { id: 'reach', panel: 'offers.reach', label: 'Reach', params: { source: 'offer.creatives' } },
      {
        id: 'policies',
        panel: 'core.related-list',
        label: 'Targeting policy',
        params: {
          source: 'offer.policies',
          entity: 'TargetingPolicy',
          title: 'name',
          description: 'description',
          columns: ['kind', 'active'],
          empty: {
            title: 'No policy bound to this offer',
            description: 'Nothing narrows who it is offered to beyond the policies that apply to every offer.',
          },
        },
      },
    ],
    'detail.aside': [
      { id: 'figures', panel: 'offers.figures' },
      { id: 'autonomy', panel: 'offers.autonomy', params: { source: 'offer.autonomy' } },
    ],
  },
} as const satisfies ListDetailManifest;
