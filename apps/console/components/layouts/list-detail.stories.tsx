import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  approvalsLayout,
  changeSetDescriptor,
  objectiveDescriptor,
  objectivesLayout,
  offerDescriptor,
  offersLayout,
  placementDescriptor,
  placementsLayout,
  type EntityDescriptor,
  type ListDetailManifest,
} from '@metis/ui-metadata';
import {
  autonomySettings,
  categories,
  creatives,
  objectives,
  offers,
  placements,
  targetingPolicies,
  users,
} from '@/mocks/fixtures/catalogue';
import { changeSets } from '@/mocks/fixtures/governance';
import { artifacts } from '@/mocks/fixtures/artifacts';
import { NO_FILTER, type ListFilter } from '@/lib/layouts/list';
import { LIST_SOURCES, type Row } from '@/lib/layouts/sources';
import { ListDetail } from './list-detail';
import type { LinkProps, PanelContext, SourceState } from './panel';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * Every story is a real manifest over the seeded records and the real
 * descriptor — placements, and objectives with their categories through the
 * host's own source — so a story that looks wrong is the renderer being wrong. The host's two jobs — resolving sources and keeping state in the URL —
 * are played here by React state, which is all the renderer can tell apart.
 *
 * The five states UX_CONTRACT.md §4 requires are **Populated**, **Loading**,
 * **Failed**, **Empty** and **Dense**. Dense is the worst case it names:
 * ten thousand rows, long strings, and optional fields missing. Try the
 * keyboard on it — `j`/`k` should move without the pane falling behind.
 */

const seeded = placements as unknown as Row[];
const taxonomy = { objectives, categories, offers };
const resolved = (name: string) => LIST_SOURCES[name].select(taxonomy);

const asRows = (xs: unknown) => xs as Row[];

/**
 * Each screen's manifest, descriptor and identity, and the sources its panels
 * read. A record-scoped source is given the rows for the record that is open,
 * as the host resolves it — the offer's own creatives, not the tenant's.
 */
const SCREENS = {
  placements: {
    manifest: placementsLayout as ListDetailManifest,
    descriptor: placementDescriptor,
    identity: (r: Row) => String(r.key),
    extra: (): Record<string, Row[]> => ({}),
  },
  objectives: {
    manifest: objectivesLayout as ListDetailManifest,
    descriptor: objectiveDescriptor as EntityDescriptor,
    identity: (r: Row) => String(r.id),
    extra: (): Record<string, Row[]> => ({ 'taxonomy.categories': resolved('taxonomy.categories') }),
  },
  offers: {
    manifest: offersLayout as ListDetailManifest,
    descriptor: offerDescriptor as EntityDescriptor,
    identity: (r: Row) => String(r.id),
    extra: (open: string | null): Record<string, Row[]> => {
      const offer = offers.find((o) => o.id === open);
      const autonomy = autonomySettings.find((a) => a.scope.targetId === open);
      return {
        'offer.creatives': asRows(creatives.filter((c) => c.offerId === open)),
        'offer.policies': asRows(targetingPolicies.filter((p) => offer?.policyIds.includes(p.id))),
        'offer.autonomy': autonomy ? asRows([autonomy]) : [],
      };
    },
  },
  approvals: {
    manifest: approvalsLayout as ListDetailManifest,
    descriptor: changeSetDescriptor as EntityDescriptor,
    identity: (r: Row) => String(r.id),
    extra: (): Record<string, Row[]> => ({}),
  },
};
type ScreenName = keyof typeof SCREENS;
const marcus = users.find((u) => u.email.startsWith('marcus'))!;

const Anchor = ({ href, className, children }: LinkProps) => (
  <a href={href} className={className}>
    {children}
  </a>
);

const context = (
  screen: ScreenName,
  rows: Row[],
  status: SourceState['status'],
  editable: boolean,
  noChildren: boolean,
  open: string | null
): PanelContext => ({
  sources: {
    [SCREENS[screen].manifest.params.list.source]: { rows, status },
    ...Object.fromEntries(
      Object.entries(SCREENS[screen].extra(open)).map(([k, v]) => [k, { rows: noChildren ? [] : v, status }])
    ),
  },
  optionSources: {
    'taxonomy.objectives': objectives.map((o) => ({ value: o.id, label: o.name })),
    'taxonomy.categories': categories.map((c) => ({ value: c.id, label: c.name, objectiveId: c.objectiveId })),
    flows: artifacts
      .filter((a) => a.status === 'active')
      .map((a) => ({ value: a.id, label: a.name, href: `/decision-flows/${a.id}` })),
  },
  permissions: marcus.permissions,
  canEdit: () => editable,
  create: (entity, seed) => console.info('create', entity, seed?.defaults),
  edit: (entity, record) => console.info('edit', entity, record.key),
  canDelete: () => editable,
  remove: (entity, record) => console.info('delete', entity, record.key),
  Link: Anchor,
});

interface Args {
  screen?: ScreenName;
  rows: Row[];
  status: SourceState['status'];
  editable: boolean;
  initialFilter?: ListFilter;
  /** What the URL names when the screen opens. */
  initialSelected?: string;
  /** Empties every source but the list's, so a related list has nothing under the open record. */
  noChildren?: boolean;
}

/** Plays the host: selection, tab and filter held in state rather than the URL. */
function Host({
  screen = 'placements',
  rows,
  status,
  editable,
  initialFilter = NO_FILTER,
  initialSelected,
  noChildren = false,
}: Args) {
  const { manifest, descriptor, identity } = SCREENS[screen];
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>(initialFilter);
  // The status and decision panels write, so they need a query client; nothing
  // behind it answers, which is what a story with no network is.
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
    <ListDetail
      manifest={manifest}
      descriptor={descriptor}
      identity={identity}
      list={{ rows, status }}
      error={status === 'error' ? 'listPlacements answered 503: the registry is not reachable.' : undefined}
      onRetry={() => console.info('retry')}
      selected={selected}
      onSelect={setSelected}
      onOpen={setOpen}
      tab={tab}
      onTab={setTab}
      filter={filter}
      onFilter={setFilter}
      onCreate={editable ? () => console.info('create') : undefined}
      onEdit={editable ? (r) => console.info('edit', r.key) : undefined}
      onDelete={editable ? (r) => console.info('delete', r.key) : undefined}
      context={context(screen, rows, status, editable, noChildren, open)}
    />
    </QueryClientProvider>
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

/**
 * A link to a record the list does not hold — deleted since, or never there.
 * The detail pane says so rather than opening the first row under an address
 * that names a different one.
 */
export const LinkedToAMissingRecord: Story = {
  args: { rows: seeded, status: 'ready', editable: true, initialSelected: 'retired_slot' },
};

/** A filter nothing meets, which is not the same state as an empty list. */
export const NothingMatches: Story = {
  args: { rows: seeded, status: 'ready', editable: true, initialFilter: { query: 'zzz', facets: {} } },
};

/**
 * The second screen: objectives, with the categories filed under each in the
 * first tab — `core.related-list`, the one panel this screen needed that the
 * first did not.
 */
export const Objectives: Story = {
  args: { screen: 'objectives', rows: resolved('taxonomy.objectives'), status: 'ready', editable: true },
};

/** The seeded objectives before anything is filed under them: the related list's empty state. */
/**
 * The offer catalogue: facets over the taxonomy's options and over what the
 * source derives, and one offer open with its creatives, reach and policies —
 * the three surfaces this replaced, in one pane.
 */
export const Offers: Story = {
  args: { screen: 'offers', rows: resolved('offers'), status: 'ready', editable: true, initialSelected: 'off_5g_home_ultimate' },
};

/** Change sets, with the one open showing what approving it changes. */
export const Approvals: Story = {
  args: { screen: 'approvals', rows: LIST_SOURCES['change-sets'].select({ changeSets }), status: 'ready', editable: false },
};

export const ObjectiveWithNoCategories: Story = {
  args: { screen: 'objectives', rows: resolved('taxonomy.objectives'), status: 'ready', editable: true, noChildren: true },
};
