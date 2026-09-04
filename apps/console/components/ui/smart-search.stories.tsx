import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SmartSearch, type Facet, type FilterChip } from './smart-search';

const FACETS: Facet[] = [
  { key: 'customerId', label: 'Customer', hint: 'partial id match' },
  {
    key: 'channel',
    label: 'Channel',
    options: [
      { value: 'web', label: 'Web' },
      { value: 'email', label: 'Email' },
      { value: 'sms', label: 'SMS' },
      { value: 'push', label: 'Push' },
      { value: 'outbound_call', label: 'Outbound call' },
    ],
  },
  {
    key: 'outcome',
    label: 'Outcome',
    options: [
      { value: 'offered', label: 'Offer made' },
      { value: 'suppressed', label: 'Suppressed' },
    ],
  },
  { key: 'action', label: 'Action', hint: 'exact proposition key' },
];

const meta: Meta = {
  title: 'Primitives/SmartSearch',
  parameters: { layout: 'padded' },
};
export default meta;

function Harness({ initial = [] }: { initial?: FilterChip[] }) {
  const [chips, setChips] = useState<FilterChip[]>(initial);
  return (
    <div className="max-w-3xl space-y-3">
      <SmartSearch
        facets={FACETS}
        chips={chips}
        onChange={setChips}
        placeholder="Search by customer, or filter by channel, outcome or action"
      />
      <pre className="rounded border border-border bg-surface-sunken p-2 font-mono text-label text-content-muted">
        {JSON.stringify(chips, null, 2)}
      </pre>
    </div>
  );
}

/** One box replacing a field per parameter. Click it to see the facet list. */
export const Empty: StoryObj = { render: () => <Harness /> };

export const WithChips: StoryObj = {
  render: () => (
    <Harness
      initial={[
        { facet: 'channel', value: 'sms' },
        { facet: 'outcome', value: 'suppressed' },
      ]}
    />
  ),
};
