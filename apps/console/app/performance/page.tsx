'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  Badge,
  Metric,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { apiClient, type PerformanceRowDto } from '@/lib/api-client';

/**
 * What happened after the decisions.
 *
 * Outcomes had been recorded since the ledger existed and nothing read them, so
 * the console could show what was decided and never whether it worked.
 *
 * Two things this page refuses to do, both of which a conventional dashboard
 * does by default:
 *
 * **It does not print a rate over an empty denominator.** An offer made zero
 * times has no acceptance rate; showing 0% would say it was tried and failed.
 * Those cells read "—", and the column header says why.
 *
 * **It does not fold suppression into failure.** Decisions that offered nothing
 * are counted on their own. On a platform whose suitability tier exists to
 * refuse profitable offers, suppression is a result.
 *
 * Every row links to the decisions behind it, because the definition of done
 * says every displayed number links to its source trace or explains why it
 * cannot. Here it can.
 */

/**
 * A rate, or an em dash and the reason it is absent.
 *
 * The rate is over decisions with an outcome, never over decisions offered.
 * Dividing 0 acceptances by 146 offers gives 0.0%, which reads as "we measured
 * and nobody took it" — the opposite of the truth when no channel reported back
 * at all.
 */
function Rate({ value, measured }: { value: number | null; measured: number }) {
  if (value === null) {
    return (
      <span className="text-content-muted" title="No outcome has been recorded, so there is no rate to report.">
        —
      </span>
    );
  }
  return (
    <span className="tnum tabular-nums" title={`Of ${measured} decision(s) with an outcome.`}>
      {(value * 100).toFixed(1)}%
    </span>
  );
}

function money(minor: number | null) {
  if (minor === null) {
    return (
      <span className="text-content-muted" title="No outcome carried a value.">
        —
      </span>
    );
  }
  return (
    <span className="tnum tabular-nums">
      {(minor / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
    </span>
  );
}

function PerformanceView() {
  const [channel, setChannel] = useState('');
  const [flowId, setFlowId] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['performance', channel, flowId],
    queryFn: () =>
      apiClient.getPerformance({
        channel: channel || undefined,
        flowId: flowId || undefined,
      }),
  });

  const flows = useQuery({ queryKey: ['artifacts'], queryFn: () => apiClient.listArtifacts() });

  if (isLoading) return <LoadingState label="Joining outcomes to decisions" />;
  if (error || !data) {
    return (
      <ErrorState
        description="Could not build the report."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const columns: Column<PerformanceRowDto>[] = [
    {
      key: 'action',
      header: 'Action',
      sortValue: (r) => r.action,
      cell: (r) => (
        <div>
          {/* The link is the point: a number nobody can get behind is a
              number nobody should act on. */}
          <Link
            href={`/decisions?action=${encodeURIComponent(r.action)}`}
            className="font-mono text-label text-accent underline underline-offset-2"
          >
            {r.action}
          </Link>
          <div className="text-label text-content-muted">{r.flowId}</div>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 'w-24',
      sortValue: (r) => r.channel,
      cell: (r) => <Badge tone="neutral">{r.channel}</Badge>,
    },
    {
      key: 'offered',
      header: 'Offered',
      width: 'w-24',
      sortValue: (r) => r.offered,
      cell: (r) => <span className="tnum tabular-nums">{r.offered}</span>,
    },
    {
      key: 'measured',
      header: 'Reported',
      width: 'w-28',
      sortValue: (r) => r.measured,
      cell: (r) => (
        // Coverage, shown beside the counts rather than folded into them: a
        // rate is only as good as the share of offers anyone reported on.
        <span className="tnum tabular-nums">
          {r.measured}
          {r.offered > 0 ? (
            <span className="ml-1 text-label text-content-muted">
              {((r.measured / r.offered) * 100).toFixed(0)}%
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'impressions',
      header: 'Seen',
      width: 'w-20',
      secondary: true,
      sortValue: (r) => r.impressions,
      cell: (r) => <span className="tnum tabular-nums">{r.impressions}</span>,
    },
    {
      key: 'clicks',
      header: 'Clicked',
      width: 'w-24',
      sortValue: (r) => r.clicks,
      cell: (r) => (
        <span className="flex items-baseline gap-1">
          <span className="tnum tabular-nums">{r.clicks}</span>
          <span className="text-label text-content-muted">
            <Rate value={r.clickRate} measured={r.measured} />
          </span>
        </span>
      ),
    },
    {
      key: 'acceptances',
      header: 'Accepted',
      width: 'w-24',
      sortValue: (r) => r.acceptanceRate ?? -1,
      cell: (r) => (
        <span className="flex items-baseline gap-1">
          <span className="tnum tabular-nums">{r.acceptances}</span>
          <span className="text-label text-content-muted">
            <Rate value={r.acceptanceRate} measured={r.measured} />
          </span>
        </span>
      ),
    },
    {
      key: 'conversions',
      header: 'Converted',
      width: 'w-24',
      secondary: true,
      sortValue: (r) => r.conversions,
      cell: (r) => <span className="tnum tabular-nums">{r.conversions}</span>,
    },
    {
      key: 'value',
      header: 'Realised',
      width: 'w-28',
      sortValue: (r) => r.valueMinor ?? -1,
      cell: (r) => money(r.valueMinor),
    },
  ];

  const unmeasured = data.offered - data.measured;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Decisions" value={data.decisions.toLocaleString('en-GB')} />
        <Metric label="Offered something" value={data.offered.toLocaleString('en-GB')} />
        <Metric
          label="Offered nothing"
          value={data.suppressed.toLocaleString('en-GB')}
          tone="hold"
        />
        <Metric
          label="With an outcome"
          value={data.measured.toLocaleString('en-GB')}
          tone={data.measured > 0 ? 'accent' : 'neutral'}
        />
      </div>

      {/* The honest headline. A dashboard that leads with a conversion rate
          computed over decisions nobody reported on is the most common way
          these surfaces mislead. */}
      {data.offered > 0 && data.measured === 0 ? (
        <p className="rounded border border-hold/40 bg-hold-subtle px-2 py-1.5 text-body text-hold">
          Nothing has been reported back. {data.offered.toLocaleString('en-GB')} offers were made
          and no channel has recorded an impression, a click or an acceptance against any of them,
          so every rate below is empty rather than zero. Outcomes arrive through{' '}
          <span className="font-mono text-label">POST /outcomes</span>; no channel adapter sends
          them yet (W-017).
        </p>
      ) : null}

      {unmeasured > 0 && data.measured > 0 ? (
        <p className="text-label text-content-muted">
          {unmeasured.toLocaleString('en-GB')} of {data.offered.toLocaleString('en-GB')} offers have
          no outcome recorded. The rates below describe the {data.measured.toLocaleString('en-GB')}{' '}
          that do, and say nothing about the rest.
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="By action"
          description={
            data.from && data.to
              ? `Decisions from ${new Date(data.from).toLocaleDateString('en-GB')} to ${new Date(
                  data.to
                ).toLocaleDateString('en-GB')}. Counts are distinct decisions, never events — a channel that fires twice reports once.`
              : 'Counts are distinct decisions, never events.'
          }
          actions={
            <div className="flex items-center gap-2">
              <Select
                aria-label="Channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="">Every channel</option>
                {['web', 'email', 'sms', 'push', 'outbound_call'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Select aria-label="Flow" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
                <option value="">Every flow</option>
                {(flows.data?.artifacts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        {data.rows.length === 0 ? (
          <EmptyState
            title="No offers in this range"
            description="Every decision here offered nothing, or the filters exclude them all."
          />
        ) : (
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(r) => `${r.action}-${r.channel}-${r.flowId}`}
            defaultSort={{ key: 'offered', dir: 'desc' }}
            emptyTitle="No offers in this range"
          />
        )}
      </Card>

      <p className="text-label text-content-muted">
        Rates are over the decisions someone reported back on, never over the decisions offered —
        dividing by offers nobody reported on turns silence into 0%. A dash means the number does
        not exist rather than being zero. Counting only: attribution and uplift are statistical
        claims, and this platform does not make one it cannot show you the workings for.
      </p>
    </div>
  );
}

export default function PerformancePage() {
  return (
    <RequireAuth>
      <PageHeader
        title="Performance"
        description="Recorded outcomes joined to the decisions they belong to. Every row links to the decisions behind it."
      />
      <PageBody>
        <PerformanceView />
      </PageBody>
    </RequireAuth>
  );
}
