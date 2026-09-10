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
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { apiClient, type AuditEventDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

const ACTOR_TONE: Record<string, 'accent' | 'outline' | 'hold'> = {
  agent: 'accent',
  human: 'outline',
  system: 'hold',
};

function AuditView() {
  const [actorType, setActorType] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit'],
    queryFn: () => apiClient.getAuditLog(200),
  });

  const all = data?.events ?? [];
  const rows = actorType ? all.filter((e) => e.actorType === actorType) : all;

  const columns: Column<AuditEventDto>[] = [
    {
      key: 'timestamp',
      header: 'When',
      width: 'w-36',
      sortValue: (e) => e.timestamp,
      cell: (e) => (
        <span className="tnum text-label text-content-muted">
          {new Date(e.timestamp).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      width: 'w-52',
      sortValue: (e) => e.actor,
      cell: (e) => (
        <div className="flex items-center gap-1.5">
          <Badge tone={ACTOR_TONE[e.actorType] ?? 'outline'}>{e.actorType}</Badge>
          <span className="truncate font-mono text-label text-content-muted">{e.actor}</span>
        </div>
      ),
    },
    {
      key: 'eventType',
      header: 'Event',
      width: 'w-44',
      sortValue: (e) => e.eventType,
      cell: (e) => <span className="font-medium text-content">{e.eventType}</span>,
    },
    {
      key: 'summary',
      header: 'Detail',
      cell: (e) => (
        <div>
          <p className="text-content-muted">{e.summary}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-[0.6875rem] text-content-subtle">{e.scope}</span>
            {e.changeSetId && (
              <Link
                href={`/approvals/${e.changeSetId}`}
                className="text-[0.6875rem] text-accent hover:underline"
              >
                {e.changeSetId} →
              </Link>
            )}
          </div>
        </div>
      ),
    },
  ];

  if (error) {
    return (
      <PageBody>
        <ErrorState description={(error as Error).message} onRetry={() => refetch()} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title="Audit log"
        description="Append-only record of every control-plane change. Nothing is edited or deleted, so the log is evidence rather than a report."
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Events" value={all.length} />
        <Metric
          label="By people"
          value={all.filter((e) => e.actorType === 'human').length}
        />
        <Metric
          label="By agents"
          value={all.filter((e) => e.actorType === 'agent').length}
          tone="accent"
        />
        <Metric
          label="System enforcement"
          value={all.filter((e) => e.actorType === 'system').length}
          tone="hold"
          sub="blocks and reverts"
        />
      </div>

      <div className="mb-stack flex flex-wrap gap-1">
        {['', 'human', 'agent', 'system'].map((t) => (
          <button
            key={t || 'all'}
            onClick={() => setActorType(t)}
            aria-pressed={actorType === t}
            className={cn(
              'rounded border px-2.5 py-1 text-label font-medium capitalize transition-colors',
              actorType === t
                ? 'border-accent bg-accent text-on-accent'
                : 'border-border text-content-muted hover:bg-surface-sunken'
            )}
          >
            {t || 'All actors'}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title="Events" description="Newest first." />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(e) => e.id}
          isLoading={isLoading}
          defaultSort={{ key: 'timestamp', dir: 'desc' }}
          emptyTitle="No events"
          caption="Audit events"
        />
      </Card>
    </PageBody>
  );
}

export default function AuditPage() {
  // `view:audit` is enforced by `RequireAuth`, from the same manifest
  // entry the navigation rail reads. It was written out longhand here
  // until 2026-09-10, which was fine for this page and no help at all
  // to the sixteen routes that never wrote it.
  return (
    <RequireAuth>
      <AuditView />
    </RequireAuth>
  );
}
