import type { ListDetailManifest } from './types';

/**
 * Offers, declared with what a manifest can say today, and nothing else.
 *
 * DRAFT — the experiment ADR-015's claim was held to: "a manifest and no
 * component code". The comments name what the hand-built page does that this
 * cannot, so the gap is in the file rather than in somebody's memory.
 */
export const offersLayout = {
  id: 'offers',
  route: '/offers',
  formatVersion: 1,
  pattern: 'list-detail',
  title: 'Offers',
  description:
    "The offer catalogue, organised by business objective and product category. A decision flow's candidate set is drawn from here.",
  params: {
    list: {
      source: 'taxonomy.offers',
      title: 'name',
      subtitle: 'key',
      // `status` is unmanaged in the Offer descriptor, so it needs a label here
      // and shows as its raw value. `tags` is a column so a typed filter still
      // finds an offer by tag, as the page's search did.
      columns: [
        'categoryId',
        { field: 'status', label: 'Status' },
        'financials.price',
        'boost',
        { field: 'creativeCount', label: 'Creatives', unit: ['creative', 'creatives'] },
        'tags',
      ],
      // None can be declared. `status` is unmanaged; `objectiveId` and
      // `categoryId` take their options from a source, and a facet counts a
      // closed static set. The page's hierarchy tree, its `?category=` link from
      // /objectives, and its three derived lenses have no parameter to fill.
      facets: [],
      sort: { field: 'name', dir: 'asc' },
      empty: {
        title: 'No offers here',
        description: 'Create an offer, then give it a creative so it can be delivered.',
      },
    },
    detail: {
      entity: 'Offer',
      description: 'description',
      footer: { state: 'status', editedAt: 'updatedAt', editedBy: 'updatedBy' },
    },
    detailRoute: null,
  },
  slots: {
    'detail.tabs': [
      { id: 'overview', panel: 'core.entity-overview', label: 'Overview' },
      {
        id: 'creatives',
        panel: 'core.related-list',
        label: 'Creatives',
        params: {
          source: 'creatives',
          entity: 'Creative',
          by: 'offerId',
          title: 'name',
          subtitle: 'locale',
          columns: ['channel', 'active'],
          empty: {
            title: 'No creatives yet',
            description:
              'An offer with no creative cannot reach a customer: a decision that picks it records NO_DELIVERABLE_CREATIVE and delivers nothing.',
          },
        },
      },
    ],
  },
} as const satisfies ListDetailManifest;
