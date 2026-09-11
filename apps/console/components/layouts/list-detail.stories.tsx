import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { placementDescriptor, placementsLayout, type ListDetailManifest } from '@metis/ui-metadata';
import { placements, users } from '@/mocks/fixtures/catalogue';
import { artifacts } from '@/mocks/fixtures/artifacts';
import { NO_FILTER, type ListFilter } from '@/lib/layouts/list';
import type { Row } from '@/lib/layouts/sources';
import { ListDetail } from './list-detail';
import type { LinkProps, PanelContext, SourceState } from './panel';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * Every story is the real placements manifest over the seeded placements and
 * the real descriptor, so a story that looks wrong is the renderer being
 * wrong. The host's two jobs — resolving sources and keeping state in the URL —
 * are played here by React state, which is all the renderer can tell apart.
 *
 * The five states UX_CONTRACT.md §4 requires are **Populated**, **Loading**,
 * **Failed**, **Empty** and **Dense**. Dense is the worst case it names:
 * ten thousand rows, long strings, and optional fields missing. Try the
 * keyboard on it — `j`/`k` should move without the pane falling behind.
 */

const manifest = placementsLayout as ListDetailManifest;
const seeded = placements as unknown as Row[];
const identity = (r: Row) => String(r.key);
const marcus = users.find((u) => u.email.startsWith('marcus'))!;

const Anchor = ({ href, className, children }: LinkProps) => (
  <a href={href} className={className}>
    {children}
  </a>
);

const context = (rows: Row[], status: SourceState['status'], editable: boolean): PanelContext => ({
  sources: { placements: { rows, status } },
  optionSources: {
    flows: artifacts
      .filter((a) => a.status === 'active')
      .map((a) => ({ value: a.id, label: a.name, href: `/decision-flows/${a.id}` })),
  },
  permissions: marcus.permissions,
  canEdit: () => editable,
  create: (entity, defaults) => console.info('create', entity, defaults),
  edit: (entity, record) => console.info('edit', entity, record.key),
  Link: Anchor,
});

interface Args {
  rows: Row[];
  status: SourceState['status'];
  editable: boolean;
  initialFilter?: ListFilter;
}

/** Plays the host: selection, tab and filter held in state rather than the URL. */
function Host({ rows, status, editable, initialFilter = NO_FILTER }: Args) {
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>(initialFilter);
  return (
    <ListDetail
      manifest={manifest}
      descriptor={placementDescriptor}
      identity={identity}
      list={{ rows, status }}
      error={status === 'error' ? 'listPlacements answered 503: the registry is not reachable.' : undefined}
      onRetry={() => console.info('retry')}
      selected={selected}
      onSelect={setSelected}
      tab={tab}
      onTab={setTab}
      filter={filter}
      onFilter={setFilter}
      onCreate={editable ? () => console.info('create') : undefined}
      onEdit={editable ? (r) => console.info('edit', r.key) : undefined}
      context={context(rows, status, editable)}
    />
  );
}

/**
 * Ten thousand placements made from the seeded nine: every name long enough to
 * truncate, and every other one missing its description and shape.
 */
function dense(): Row[] {
  return Array.from({ length: 10_000 }, (_, i) => {
    const from = seeded[i % seeded.length];
    const row: Row = {
      ...from,
      key: `${String(from.key)}_${i}`,
      name: `${String(from.name)} — regional variant ${i} for the long-tail acquisition programme in the northern territories`,
    };
    if (i % 2) {
      delete row.description;
      delete row.type;
    }
    return row;
  });
}

const meta: Meta<typeof Host> = {
  title: 'Layouts/ListDetail',
  component: Host,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Host>;

export const Populated: Story = { args: { rows: seeded, status: 'ready', editable: true } };

export const Loading: Story = { args: { rows: [], status: 'loading', editable: true } };

export const Failed: Story = { args: { rows: [], status: 'error', editable: true } };

export const Empty: Story = { args: { rows: [], status: 'ready', editable: true } };

export const Dense: Story = { args: { rows: dense(), status: 'ready', editable: true } };

/** Somebody who may look and not change: no create, no edit, nothing disabled and unexplained. */
export const ReadOnly: Story = { args: { rows: seeded, status: 'ready', editable: false } };

/** Facets narrowing to the slots that decide and deliver nothing. */
export const Faceted: Story = {
  args: {
    rows: seeded,
    status: 'ready',
    editable: true,
    initialFilter: { query: '', facets: { decidable: 'true', 'delivery.mode': '' } },
  },
};

/** A filter nothing meets, which is not the same state as an empty list. */
export const NothingMatches: Story = {
  args: { rows: seeded, status: 'ready', editable: true, initialFilter: { query: 'zzz', facets: {} } },
};
