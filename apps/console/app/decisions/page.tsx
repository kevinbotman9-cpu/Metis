'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  Badge,
  Metric,
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ProvenanceBanner } from '@/components/ui/provenance-banner';
import {
  SmartSearch,
  chipsToQuery,
  type Facet,
  type FilterChip,
} from '@/components/ui/smart-search';
import { apiClient, type DecisionDto } from '@/lib/api-client';

/**
 * The facets the decision store can actually narrow on.
 *
 * Everything here maps to a query parameter the search endpoint understands;
 * offering a filter the backend ignores would be worse than offering none.
 */
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
  { key: 'action', label: 'Action', hint: 'exact offer key' },
];

/**
 * Chips are free text, so `outcome:banana` is reachable by typing. The spec
 * declares two values; anything else is dropped rather than sent, which is why
 * this narrows instead of casting.
 */
function asOutcome(value: string | undefined): 'offered' | 'suppressed' | undefined {
  return value === 'offered' || value === 'suppressed' ? value : undefined;
}

function DecisionsView() {
  const router = useRouter();
  const [chips, setChips] = useState<FilterChip[]>([]);
  const filters = chipsToQuery(chips);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['decisions', filters],
    queryFn: () =>
      apiClient.searchDecisions({
        customerId: filters.customerId || undefined,
        channel: filters.channel || undefined,
        outcome: asOutcome(filters.outcome),
        action: filters.action || undefined,
        limit: 5000,
      }),
  });

  const rows = data?.decisions ?? [];

  /**
   * The number the filter actually matched, not the number that came back.
   *
   * The query asks for 5,000 rows and the corpus holds more, so counting the
   * response reported the page size — the same defect this strip had once
   * before, when it showed the query limit of 200. The server sends `total`
   * alongside the page precisely so this does not have to be inferred.
   */
  const total = data?.total ?? rows.length;

  // Offered and suppressed are still counted over the page, because the server
  // sends no breakdown — so they are labelled as being over what was returned
  // rather than presented as totals. A number whose scope is unclear is worse
  // than one that is missing.
  const offered = rows.filter((d) => d.winner).length;
  const suppressed = rows.length - offered;
  const overPage =
    rows.length < total ? `across ${rows.length.toLocaleString('en-GB')} loaded rows` : undefined;

  const columns: Column<DecisionDto>[] = [
    {
      key: 'id',
      header: 'Decision',
      width: 'w-44',
      sortValue: (d) => d.id,
      cell: (d) => <span className="font-mono text-label text-accent">{d.id}</span>,
    },
    {
      key: 'timestamp',
      header: 'When',
      width: 'w-40',
      sortValue: (d) => d.timestamp,
      cell: (d) => (
        <span className="tnum text-content-muted">
          {new Date(d.timestamp).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'customerId',
      header: 'Customer',
      width: 'w-32',
      sortValue: (d) => d.customerId,
      cell: (d) => <span className="font-mono text-label">{d.customerId}</span>,
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 'w-32',
      sortValue: (d) => d.channel,
      cell: (d) => <Badge tone="outline">{d.channel.replace('_', ' ')}</Badge>,
    },
    {
      key: 'winner',
      header: 'Outcome',
      sortValue: (d) => d.winner ?? 'zzz',
      cell: (d) =>
        d.winner ? (
          <Badge tone="pass">{d.winner}</Badge>
        ) : (
          <Badge tone="block">no offer</Badge>
        ),
    },
    {
      key: 'candidateCount',
      header: 'Candidates',
      align: 'right',
      width: 'w-24',
      secondary: true,
      sortValue: (d) => d.candidateCount,
      cell: (d) => <span className="text-content-muted">{d.candidateCount}</span>,
    },
    {
      key: 'artifactVersion',
      header: 'Artifact',
      width: 'w-24',
      secondary: true,
      sortValue: (d) => d.artifactVersion,
      cell: (d) => <span className="font-mono text-label text-content-muted">{d.artifactVersion}</span>,
    },
  ];

  return (
    <PageBody>
      <PageHeader
        title="Decisions"
        description="Every decision the platform made, with the full reasoning trace behind it. Open one to see why the winner won and to prove the result reproduces."
      />

      {/* Above the numbers, inside the content column. A screenshot of these
          metrics cannot crop this out without also losing the metrics. */}
      <ProvenanceBanner provenance={data?.provenance} />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric label="Decisions" value={total} sub="in the current filter" />
        <Metric label="Offer made" value={offered} tone="pass" sub={overPage} />
        <Metric
          label="Suppressed"
          value={suppressed}
          tone={suppressed > 0 ? 'hold' : 'neutral'}
          sub={overPage ?? 'policy or consent'}
        />
      </div>

      <div className="mb-stack">
        <SmartSearch
          facets={FACETS}
          chips={chips}
          onChange={setChips}
          placeholder="Search by customer, or filter by channel, outcome or action"
        />
      </div>

      <Card>
          <CardHeader
            title={`Results${data ? ` · ${data.total}` : ''}`}
            description="Select a row to open its trace."
          />
          {error ? (
            <ErrorState
              description={(error as Error).message}
              onRetry={() => refetch()}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(d) => d.id}
              isLoading={isLoading}
              defaultSort={{ key: 'timestamp', dir: 'desc' }}
              onRowClick={(d) => router.push(`/decisions/${d.id}`)}
              emptyTitle="No decisions match these filters"
              emptyDescription="Remove a filter chip to widen the search."
              caption="Decision search results"
            />
          )}
      </Card>
    </PageBody>
  );
}

export default function DecisionsPage() {
  return (
    <RequireAuth>
      <DecisionsView />
    </RequireAuth>
  );
}
