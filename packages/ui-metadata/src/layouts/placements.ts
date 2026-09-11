import type { ListDetailManifest } from './types';

/**
 * Placements, declared. `docs/METIS_CONSOLE_SPEC.md` Part 3: *"Placements |
 * List–detail | Named, slot count, per-placement policy."*
 *
 * The columns that matter are what decides and what delivers — one boolean
 * called `active` until ADR-013 split them, because it was answering two
 * questions that came apart exactly where this platform is: it decides on five
 * channels and delivers on one. The notice in the toolbar is that fact, said
 * above the list rather than left for somebody to count.
 */
export const placementsLayout = {
  id: 'placements',
  route: '/placements',
  formatVersion: 1,
  pattern: 'list-detail',
  title: 'Placements',
  description:
    'Every slot the platform decides for, and what carries the result to a customer. Deciding and delivering are separate questions — a slot can do the first without the second.',
  params: {
    list: {
      source: 'placements',
      title: 'name',
      subtitle: 'key',
      columns: ['channel', 'decidable', 'delivery.mode', { field: 'slotCount', unit: ['slot', 'slots'] }],
      facets: ['channel', 'decidable', 'delivery.mode'],
      sort: { field: 'channel', dir: 'asc' },
      empty: {
        title: 'No placements configured',
        description:
          'A placement is the slot a decision request names. Without one, decidePlacement has nothing to answer.',
      },
    },
    detail: {
      entity: 'Placement',
      description: 'description',
      footer: { editedAt: 'updatedAt', editedBy: 'updatedBy' },
    },
    detailRoute: null,
  },
  slots: {
    'list.toolbar': [{ id: 'undeliverable', panel: 'placements.undeliverable' }],
    'detail.tabs': [{ id: 'overview', panel: 'core.entity-overview', label: 'Overview' }],
  },
} as const satisfies ListDetailManifest;
