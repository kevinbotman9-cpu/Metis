import type { ListDetailManifest } from './types';

/**
 * Models, declared. `docs/METIS_CONSOLE_SPEC.md` Part 3 puts Models under
 * Intelligence; ADR-009 §4 says what one is.
 *
 * A row is a version, not a model: two versions of one scorer are two things a
 * flow can pin, and each declares its own cost. The columns are the ones a
 * compile refusal is about — the version a pin names, whether a score node can
 * read the kind, and the p95 that joins the critical path.
 */
export const modelsLayout = {
  id: 'models',
  route: '/models',
  formatVersion: 1,
  pattern: 'list-detail',
  title: 'Models',
  description: 'The scorers a flow can pin, and what each declares it costs.',
  params: {
    list: {
      source: 'models',
      title: 'name',
      subtitle: 'id',
      columns: [
        'version',
        'kind',
        { field: 'declaredP95Ms', label: 'Declared p95', unit: ['ms', 'ms'] },
        { field: 'featureCount', label: 'Reads', unit: ['feature', 'features'] },
      ],
      facets: ['kind'],
      sort: { field: 'id', dir: 'asc' },
      empty: {
        title: 'No models published',
        description: 'A score node pinning a model the registry does not hold is refused when its flow compiles.',
      },
    },
    detail: {
      entity: 'Model',
      description: 'description',
      footer: { version: 'version', editedAt: 'publishedAt', editedBy: 'publishedBy' },
    },
    detailRoute: null,
  },
  slots: {
    'detail.tabs': [{ id: 'overview', panel: 'core.entity-overview', label: 'Overview' }],
  },
} as const satisfies ListDetailManifest;
