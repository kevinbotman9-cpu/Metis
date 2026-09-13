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
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth-provider';
import { PolicyFormDialog } from '@/components/policy-form-dialog';
import { cn } from '@/lib/cn';
import { InfoTip } from '@/components/ui/tooltip';

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
    blurb: 'Affordability, fair value and ethical checks. The tier a regulator reads.',
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

  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:policies');
  const [editing, setEditing] = useState<TargetingPolicyDto | null>(null);
  const [creating, setCreating] = useState(false);

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
            <div className="mt-0.5 font-mono text-label text-content-subtle">
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
              className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-label text-content-muted"
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
    // Offered only to somebody who can act on it. An enabled control that
    // answers 403 is the defect this console has had before.
    ...(canEdit
      ? [
          {
            key: 'edit',
            header: '',
            width: 'w-20',
            cell: (p: TargetingPolicyDto) => (
              <Button variant="secondary" onClick={() => setEditing(p)}>
                Edit
              </Button>
            ),
          } as Column<TargetingPolicyDto>,
        ]
      : []),
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
        description="The trace records which tier removed a candidate."
        actions={
          canEdit ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              New policy
            </Button>
          ) : undefined
        }
      />

      <PolicyFormDialog open={creating} onOpenChange={setCreating} />
      <PolicyFormDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        policy={editing ?? undefined}
      />

      <div className="mb-stack grid gap-3 lg:grid-cols-3">
        {KINDS.map((k) => {
          const count = all.filter((p) => p.kind === k.key).length;
          const selected = kind === k.key;
          return (
            <div key={k.key} className="relative">
            <button
              onClick={() => setKind(selected ? '' : k.key)}
              aria-pressed={selected}
              className={cn(
                'h-full w-full rounded-lg border p-card pr-8 text-left transition-colors',
                selected
                  ? 'border-accent bg-accent-subtle'
                  : 'border-border bg-surface hover:border-border-strong'
              )}
            >
              <div className="flex items-center justify-between">
                <Badge tone={k.tone}>{k.title}</Badge>
                <span className="tnum text-body font-semibold text-content">{count}</span>
              </div>
              <p className="mt-2 text-body font-medium text-content">{k.question}</p>
              {/* A zero here is ambiguous: it reads as an omission, and on the
                  tier a regulator reads that is the worst thing for it to read
                  as. This tenant genuinely declares no suitability policy —
                  its brief names no affordability rule — so the screen states
                  that rather than leaving a reader to guess whether the rules
                  are missing or were never written. */}
              {count === 0 ? (
                <p className="mt-2 text-label text-content-subtle">
                  This tenant declares none. An empty tier is a stated fact here, not a gap:
                  nothing has been authored on it, and nothing is being skipped.
                </p>
              ) : null}
            </button>
            {/* Outside the button: a tooltip trigger cannot be nested inside one. */}
            <div className="absolute bottom-card right-card">
              <InfoTip label={`About ${k.title.toLowerCase()}`}>{k.blurb}</InfoTip>
            </div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title={kind ? `${kind} rules` : 'All policies'}
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
