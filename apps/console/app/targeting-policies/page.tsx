'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  Badge,
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { apiClient, type TargetingPolicyDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

const KINDS = [
  {
    key: 'eligibility',
    title: 'Eligibility',
    question: 'Can we offer this?',
    blurb: 'Hard contractual and legal gates. Failing one removes the candidate outright.',
    tone: 'accent' as const,
  },
  {
    key: 'relevance',
    title: 'Relevance',
    question: 'Should we offer it now?',
    blurb: 'Situational relevance — already held, trigger not fired, wrong moment.',
    tone: 'info' as const,
  },
  {
    key: 'suitability',
    title: 'Suitability',
    question: 'Is it right for this customer?',
    blurb: 'Affordability, fair value and ethical checks. The FCA-facing tier.',
    tone: 'hold' as const,
  },
];

function PoliciesView() {
  const [kind, setKind] = useState<string>('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['targeting-policies'],
    queryFn: () => apiClient.listTargetingPolicies(),
  });

  const all = data?.policies ?? [];
  const rows = kind ? all.filter((p) => p.kind === kind) : all;

  const columns: Column<TargetingPolicyDto>[] = [
    {
      key: 'name',
      header: 'Policy',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div>
          <div className="font-medium text-content">{p.name}</div>
          <div className="text-label text-content-muted">{p.description}</div>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Tier',
      width: 'w-32',
      sortValue: (p) => p.kind,
      cell: (p) => (
        <Badge tone={KINDS.find((k) => k.key === p.kind)?.tone ?? 'neutral'}>{p.kind}</Badge>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      width: 'w-40',
      sortValue: (p) => p.scope.level,
      cell: (p) => (
        <div>
          <Badge tone="outline">{p.scope.level}</Badge>
          {p.scope.targetId && (
            <div className="mt-0.5 font-mono text-[0.6875rem] text-content-subtle">
              {p.scope.targetId}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'conditions',
      header: 'Conditions',
      secondary: true,
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.conditions.map((c, i) => (
            <code
              key={i}
              className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.6875rem] text-content-muted"
            >
              {c.field} {c.operator} {JSON.stringify(c.value)}
            </code>
          ))}
        </div>
      ),
    },
    {
      key: 'active',
      header: 'State',
      width: 'w-20',
      sortValue: (p) => String(p.active),
      cell: (p) => (
        <Badge tone={p.active ? 'pass' : 'neutral'}>{p.active ? 'active' : 'off'}</Badge>
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
        title="Targeting policies"
        description="Three tiers decide whether an offer may reach a customer. Every trace records which tier removed a candidate and why."
      />

      <div className="mb-stack grid gap-3 lg:grid-cols-3">
        {KINDS.map((k) => {
          const count = all.filter((p) => p.kind === k.key).length;
          const selected = kind === k.key;
          return (
            <button
              key={k.key}
              onClick={() => setKind(selected ? '' : k.key)}
              aria-pressed={selected}
              className={cn(
                'rounded-lg border p-card text-left transition-colors',
                selected
                  ? 'border-accent bg-accent-subtle'
                  : 'border-border bg-surface hover:border-border-strong'
              )}
            >
              <div className="flex items-center justify-between">
                <Badge tone={k.tone}>{k.title}</Badge>
                <span className="tnum text-base font-semibold text-content">{count}</span>
              </div>
              <p className="mt-2 text-body font-medium text-content">{k.question}</p>
              <p className="mt-1 text-label text-content-muted">{k.blurb}</p>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title={kind ? `${kind} rules` : 'All policies'}
          description={
            kind
              ? 'Selected tier only. Click the card again to clear.'
              : 'Every engagement rule across all scopes.'
          }
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          isLoading={isLoading}
          defaultSort={{ key: 'kind', dir: 'asc' }}
          emptyTitle="No policies in this tier"
          caption="Targeting policies"
        />
      </Card>
    </PageBody>
  );
}

export default function TargetingPoliciesPage() {
  return (
    <RequireAuth>
      <PoliciesView />
    </RequireAuth>
  );
}
