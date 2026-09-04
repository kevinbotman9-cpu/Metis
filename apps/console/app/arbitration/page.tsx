'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Metric,
  LoadingState,
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { apiClient, type LeverDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

const TERMS = [
  {
    key: 'propensity' as const,
    symbol: 'P',
    name: 'Propensity',
    blurb: 'Model-predicted likelihood the customer accepts.',
  },
  {
    key: 'value' as const,
    symbol: 'V',
    name: 'Value',
    blurb: 'Expected margin if accepted, normalised.',
  },
  {
    key: 'lever' as const,
    symbol: 'L',
    name: 'Lever',
    blurb: 'Business weight. The only term humans set directly.',
  },
  {
    key: 'context' as const,
    symbol: 'C',
    name: 'Context',
    blurb: 'Channel and moment fit.',
  },
];

function ArbitrationView() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:arbitration');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['arbitration'],
    queryFn: () => apiClient.getArbitration(),
  });

  const [weights, setWeights] = useState({
    propensity: 1,
    value: 1,
    lever: 1,
    context: 0.5,
  });

  // Seed the editor once the server config arrives.
  useEffect(() => {
    if (data?.config.weights) setWeights(data.config.weights);
  }, [data]);

  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => apiClient.updateArbitration(weights),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['arbitration'] }),
  });

  const saved = data?.config.weights;
  const dirty =
    saved &&
    TERMS.some((t) => Math.abs(weights[t.key] - saved[t.key]) > 0.001);

  const levers = data?.levers ?? [];

  const leverColumns: Column<LeverDto>[] = [
    {
      key: 'name',
      header: 'Lever',
      sortValue: (l) => l.name,
      cell: (l) => (
        <div>
          <div className="font-medium text-content">{l.name}</div>
          <div className="text-label text-content-muted">{l.reason}</div>
        </div>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      width: 'w-40',
      sortValue: (l) => l.scope.level,
      cell: (l) => (
        <div>
          <Badge tone="outline">{l.scope.level}</Badge>
          {l.scope.targetId && (
            <div className="mt-0.5 font-mono text-[0.6875rem] text-content-subtle">
              {l.scope.targetId}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'value',
      header: 'Multiplier',
      align: 'right',
      width: 'w-28',
      sortValue: (l) => l.value,
      cell: (l) => (
        <span
          className={cn(
            'font-semibold',
            l.value > 1 ? 'text-pass' : l.value < 1 ? 'text-hold' : 'text-content-muted'
          )}
        >
          {l.value.toFixed(2)}×
        </span>
      ),
    },
    {
      key: 'validity',
      header: 'Active window',
      width: 'w-44',
      secondary: true,
      cell: (l) =>
        l.validity ? (
          <span className="tnum text-label text-content-muted">
            {l.validity.startsAt} → {l.validity.endsAt ?? 'open'}
          </span>
        ) : (
          <span className="text-label text-content-subtle">Always</span>
        ),
    },
  ];

  if (isLoading) {
    return (
      <PageBody>
        <LoadingState label="Loading arbitration config" />
      </PageBody>
    );
  }

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
        title="Arbitration & levers"
        description="How competing propositions are ranked. Every decision's winner comes from this formula, and every trace shows the terms that produced it."
      />

      <div className="mb-stack">
        <Card>
          <CardHeader
            title="Ranking formula"
            description="Exponent weights change how much each term matters without rewriting the formula."
            actions={
              canEdit ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!dirty || save.isPending}
                    onClick={() => saved && setWeights(saved)}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!dirty || save.isPending}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? 'Publishing…' : 'Publish weights'}
                  </Button>
                </>
              ) : (
                <Badge tone="outline">read only</Badge>
              )
            }
          />
          <CardBody>
            <div className="mb-5 rounded border border-border bg-surface-sunken px-4 py-3 text-center">
              <p className="font-mono text-base text-content">
                Priority ={' '}
                {TERMS.map((t, i) => (
                  <span key={t.key}>
                    {i > 0 && <span className="text-content-subtle"> × </span>}
                    <span className="font-semibold text-accent">{t.symbol}</span>
                    <sup className="tnum">{weights[t.key].toFixed(2)}</sup>
                  </span>
                ))}
              </p>
              {dirty && (
                <p className="mt-1.5 text-label text-hold">
                  Unsaved. Publishing changes how every subsequent decision is ranked, and is
                  recorded in the audit log.
                </p>
              )}
              {save.isSuccess && !dirty && (
                <p className="mt-1.5 text-label text-pass">
                  Published. Recorded in the audit log.
                </p>
              )}
              {save.isError && (
                <p role="alert" className="mt-1.5 text-label text-block">
                  {(save.error as Error).message}
                </p>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {TERMS.map((term) => (
                <div key={term.key} className="rounded border border-border p-3">
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <div>
                      <span className="font-mono font-semibold text-accent">{term.symbol}</span>
                      <span className="ml-2 text-body font-medium text-content">{term.name}</span>
                    </div>
                    <span className="tnum text-body font-semibold">
                      {weights[term.key].toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={weights[term.key]}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setWeights({ ...weights, [term.key]: Number(e.target.value) })
                    }
                    aria-label={`${term.name} weight`}
                    className="w-full accent-accent disabled:opacity-50"
                  />
                  <div className="mt-1 flex justify-between text-[0.625rem] text-content-subtle">
                    <span>0 (ignored)</span>
                    <span>1 (neutral)</span>
                    <span>2 (doubled)</span>
                  </div>
                  <p className="mt-1.5 text-label text-content-muted">{term.blurb}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Active levers" value={levers.length} />
        <Metric
          label="Boosting"
          value={levers.filter((l) => l.value > 1).length}
          tone="pass"
        />
        <Metric
          label="Suppressing"
          value={levers.filter((l) => l.value < 1).length}
          tone="hold"
        />
        <Metric
          label="Time-boxed"
          value={levers.filter((l) => l.validity).length}
          sub="expire automatically"
        />
      </div>

      <Card>
        <CardHeader
          title="Levers"
          description="Business weights applied at a scope. The most specific lever wins, the same way autonomy resolves."
          actions={canEdit ? <Button variant="secondary" size="sm">New lever</Button> : null}
        />
        <DataTable
          columns={leverColumns}
          rows={levers}
          rowKey={(l) => l.id}
          defaultSort={{ key: 'value', dir: 'desc' }}
          emptyTitle="No levers configured"
          caption="Arbitration levers"
        />
      </Card>
    </PageBody>
  );
}

export default function ArbitrationPage() {
  return (
    <RequireAuth>
      <ArbitrationView />
    </RequireAuth>
  );
}
