import type { ListDetailManifest } from './types';

/**
 * Change sets awaiting a decision, declared.
 *
 * Part 3 lists two screens here: *"Change sets | List–detail + diff"* and
 * *"Approvals | Workbench — queue, quorum, four-eyes, tier."* What exists on
 * `/approvals` is the first: every change set, and the one open shows exactly
 * what approving it changes. Quorum and four-eyes are not built, so there is no
 * queue for a Workbench to hold yet. Until 2026-09-13 the detail was a page of
 * its own at `/approvals/[id]`; it is this screen's detail pane now, and that
 * route opens it.
 *
 * Who raised a change set and whether its simulation passed are derived by the
 * source, and filter like any other facet.
 */
export const approvalsLayout = {
  id: 'approvals',
  route: '/approvals',
  formatVersion: 1,
  pattern: 'list-detail',
  title: 'Approvals',
  description: 'Every change set, and exactly what approving one changes.',
  params: {
    list: {
      source: 'change-sets',
      title: 'title',
      subtitle: 'id',
      columns: ['status', { field: 'raisedBy', label: 'Raised by' }, { field: 'simulationResult', label: 'Simulation' }],
      facets: [
        'status',
        {
          field: 'raisedBy',
          label: 'Raised by',
          options: [
            { value: 'agent', label: 'An agent' },
            { value: 'person', label: 'A person' },
          ],
        },
        {
          field: 'simulationResult',
          label: 'Simulation',
          options: [
            { value: 'passed', label: 'Passed' },
            { value: 'failed', label: 'Failed' },
            { value: 'not-run', label: 'Not run' },
          ],
        },
      ],
      sort: { field: 'requestedAt', dir: 'desc' },
      empty: {
        title: 'No change sets',
        description: 'A change set is raised by a person or an agent, and waits here for somebody who can approve it.',
      },
    },
    detail: {
      entity: 'ChangeSet',
      description: 'description',
      footer: { state: 'status' },
    },
    detailRoute: '/approvals/[id]',
  },
  slots: {
    'detail.actions': [{ id: 'decision', panel: 'change-sets.decision' }],
    'detail.tabs': [
      { id: 'diff', panel: 'change-sets.diff', label: 'Proposed diff' },
      { id: 'details', panel: 'core.entity-overview', label: 'Details' },
    ],
  },
} as const satisfies ListDetailManifest;
