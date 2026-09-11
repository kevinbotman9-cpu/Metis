import type { ListDetailManifest } from './types';

/**
 * Objectives, declared. `docs/METIS_CONSOLE_SPEC.md` Part 3: *"Objectives |
 * List–detail | Top of taxonomy. Owns categories."*
 *
 * The first step of Spine 1. A category is authored from inside the objective
 * that owns it, because that is the relationship the entity has — so the
 * detail pane opens on the categories, and a new one arrives already filed
 * under the objective it was created from.
 *
 * The second screen ADR-015 converted, and the one that tested the pattern:
 * see the pull request that introduced it for what it cost beyond this file.
 */
export const objectivesLayout = {
  id: 'objectives',
  route: '/objectives',
  formatVersion: 1,
  pattern: 'list-detail',
  title: 'Objectives',
  description:
    'The top of the taxonomy: what the business is trying to achieve. Categories are filed under an objective, and offers under a category.',
  params: {
    list: {
      source: 'taxonomy.objectives',
      title: 'name',
      subtitle: 'key',
      columns: [
        { field: 'categoryCount', label: 'Categories', unit: ['category', 'categories'] },
        { field: 'offerCount', label: 'Offers', unit: ['offer', 'offers'] },
      ],
      facets: [],
      sort: { field: 'sortOrder', dir: 'asc' },
      empty: {
        title: 'No objectives yet',
        description: 'An objective is the first thing in the catalogue. Everything else is filed under one.',
      },
    },
    detail: {
      entity: 'Objective',
      description: 'description',
      footer: { editedAt: 'updatedAt' },
    },
    detailRoute: null,
  },
  slots: {
    'detail.tabs': [
      {
        id: 'categories',
        panel: 'core.related-list',
        label: 'Categories',
        params: {
          source: 'taxonomy.categories',
          entity: 'Category',
          by: 'objectiveId',
          title: 'name',
          subtitle: 'key',
          description: 'description',
          sort: 'sortOrder',
          columns: [{ field: 'offerCount', label: 'Offers', unit: ['offer', 'offers'] }],
          link: { label: 'Offers', href: '/offers?category={id}' },
          empty: {
            title: 'No categories under this objective',
            description:
              'A category is a product or service grouping. Offers are filed under one, so an objective with no category has nothing to sell.',
          },
        },
      },
      { id: 'details', panel: 'core.entity-overview', label: 'Details' },
    ],
  },
} as const satisfies ListDetailManifest;
