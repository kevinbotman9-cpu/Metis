import type { Meta, StoryObj } from '@storybook/react';
import { DataTable, type Column } from './data-table';
import { Badge } from './primitives';

interface Row {
  id: string;
  customer: string;
  channel: string;
  winner: string | null;
  latency: number;
}

const rows: Row[] = [
  { id: 'dec_0040d143', customer: 'cust_iz4v', channel: 'push', winner: 'acq_fibre_900', latency: 7.8 },
  { id: 'dec_0032b0vv', customer: 'cust_iyaf', channel: 'email', winner: null, latency: 9.2 },
  { id: 'dec_0036f0zz', customer: 'cust_iypn', channel: 'outbound_call', winner: 'acq_sim_30', latency: 10.2 },
  { id: 'dec_0012f0bb', customer: 'cust_iw6b', channel: 'email', winner: 'upsell_5g', latency: 10.6 },
  { id: 'dec_0007a066', customer: 'cust_ivna', channel: 'sms', winner: 'retention_offer', latency: 11.6 },
];

const columns: Column<Row>[] = [
  {
    key: 'id',
    header: 'Decision',
    width: 'w-44',
    sortValue: (r) => r.id,
    cell: (r) => <span className="font-mono text-label text-accent">{r.id}</span>,
  },
  {
    key: 'customer',
    header: 'Customer',
    width: 'w-32',
    sortValue: (r) => r.customer,
    cell: (r) => <span className="font-mono text-label">{r.customer}</span>,
  },
  {
    key: 'channel',
    header: 'Channel',
    width: 'w-32',
    secondary: true,
    sortValue: (r) => r.channel,
    cell: (r) => <Badge tone="outline">{r.channel.replace('_', ' ')}</Badge>,
  },
  {
    key: 'winner',
    header: 'Outcome',
    sortValue: (r) => r.winner ?? 'zzz',
    cell: (r) =>
      r.winner ? <Badge tone="pass">{r.winner}</Badge> : <Badge tone="block">no offer</Badge>,
  },
  {
    key: 'latency',
    header: 'Latency',
    align: 'right',
    width: 'w-24',
    sortValue: (r) => r.latency,
    cell: (r) => <span>{r.latency.toFixed(1)}ms</span>,
  },
];

const meta: Meta<typeof DataTable<Row>> = {
  title: 'Primitives/DataTable',
  component: DataTable<Row>,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof DataTable<Row>>;

export const Default: Story = {
  args: {
    columns,
    rows,
    rowKey: (r: Row) => r.id,
    caption: 'Decision search results',
    defaultSort: { key: 'latency', dir: 'asc' },
  },
};

/** Rows become activatable by click and by Enter or Space. */
export const Selectable: Story = {
  args: {
    ...Default.args,
    onRowClick: (r: Row) => alert(`Open ${r.id}`),
  },
};

export const Loading: Story = {
  args: { ...Default.args, rows: [], isLoading: true },
};

export const Empty: Story = {
  args: {
    ...Default.args,
    rows: [],
    emptyTitle: 'No decisions match these filters',
    emptyDescription: 'Widen the date range or clear a filter.',
  },
};

/**
 * Above the virtualisation threshold only the visible window is in the DOM,
 * so the grid stays responsive at the volumes the decision store reaches.
 */
export const Virtualised: Story = {
  args: {
    ...Default.args,
    rows: Array.from({ length: 5000 }, (_, i) => ({
      id: `dec_${i.toString(16).padStart(16, '0')}`,
      customer: `cust_${(880000 + i * 137).toString(36)}`,
      channel: ['web', 'email', 'sms', 'push', 'outbound_call'][i % 5],
      winner: i % 3 === 0 ? null : ['upsell_5g', 'acq_fibre_900', 'retention_offer'][i % 3],
      latency: Number((5 + (i % 200) / 10).toFixed(1)),
    })),
    onRowClick: undefined,
  },
};
