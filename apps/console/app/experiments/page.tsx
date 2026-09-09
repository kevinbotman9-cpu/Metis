'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Input,
  Field,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { useAuth } from '@/components/auth-provider';
import { apiClient, ApiError, type ExperimentDto } from '@/lib/api-client';

/**
 * Experiments and holdouts.
 *
 * The thing worth explaining on this page is why the arms go grey the moment an
 * experiment starts, because it looks like a limitation and is the opposite.
 *
 * An arm is a pure function of the customer reference — nothing stores it, and
 * it is recomputed when a decision is explained months later. That is what lets
 * this platform answer "which arm was this customer in" for a decision made
 * before the experiment ended, which most cannot. Reweighting a live split
 * would break exactly that: every recomputed arm would disagree with the one
 * that actually applied, and the trace would confidently report the wrong one.
 *
 * So the page says it in those words rather than disabling a control and
 * leaving somebody to guess.
 */

const STATUS_TONE: Record<ExperimentDto['status'], 'neutral' | 'pass' | 'hold'> = {
  draft: 'neutral',
  running: 'pass',
  stopped: 'hold',
};

function Split({ experiment }: { experiment: ExperimentDto }) {
  const total = experiment.arms.reduce((n, a) => n + Math.max(0, a.weight), 0);
  return (
    <div className="space-y-1">
      <div
        className="flex h-2 overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={experiment.arms
          .map((a) => `${a.name} ${total > 0 ? Math.round((a.weight / total) * 100) : 0}%`)
          .join(', ')}
      >
        {experiment.arms.map((arm) => (
          <span
            key={arm.key}
            className={arm.holdout ? 'bg-hold' : 'bg-accent'}
            style={{ width: `${total > 0 ? (Math.max(0, arm.weight) / total) * 100 : 0}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {experiment.arms.map((arm) => (
          <span key={arm.key} className="flex items-baseline gap-1 text-label">
            <span
              aria-hidden
              className={`inline-block h-2 w-2 rounded-sm ${arm.holdout ? 'bg-hold' : 'bg-accent'}`}
            />
            <span className="font-mono text-content">{arm.key}</span>
            <span className="text-content-muted">
              {total > 0 ? Math.round((arm.weight / total) * 100) : 0}%
            </span>
            {arm.holdout ? <Badge tone="hold">holdout</Badge> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExperimentsView() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:flows');

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [holdoutPct, setHoldoutPct] = useState('10');
  const [error, setError] = useState<string | null>(null);

  const experiments = useQuery({
    queryKey: ['experiments'],
    queryFn: () => apiClient.listExperiments(),
  });
  const performance = useQuery({
    queryKey: ['performance', '', ''],
    queryFn: () => apiClient.getPerformance(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['experiments'] });
  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed.');

  const create = useMutation({
    mutationFn: () => {
      const held = Math.max(0, Math.min(100, Number(holdoutPct) || 0));
      return apiClient.createExperiment({
        key: key.trim(),
        name: name.trim(),
        description: '',
        arms: [
          { key: 'holdout', name: 'Held back', weight: held, holdout: true },
          { key: 'treated', name: 'Offered as usual', weight: 100 - held },
        ],
      });
    },
    onSuccess: () => {
      void refresh();
      setCreating(false);
      setName('');
      setKey('');
      setError(null);
    },
    onError: fail,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ExperimentDto['status'] }) =>
      apiClient.updateExperiment(id, { status }),
    onSuccess: () => {
      void refresh();
      setError(null);
    },
    onError: fail,
  });

  if (experiments.isLoading) return <LoadingState label="Loading experiments" />;
  if (experiments.error) {
    return (
      <ErrorState
        description="Could not load experiments."
        onRetry={() => void experiments.refetch()}
      />
    );
  }

  const list = experiments.data?.experiments ?? [];
  const arms = performance.data?.arms ?? [];
  const running = list.filter((e) => e.status === 'running').length;

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded border border-block/40 bg-block-subtle px-2 py-1.5 text-body text-block">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Experiments" value={String(list.length)} />
        <Metric label="Running" value={String(running)} tone={running > 0 ? 'accent' : 'neutral'} />
        <Metric
          label="Drafts"
          value={String(list.filter((e) => e.status === 'draft').length)}
        />
        <Metric label="Stopped" value={String(list.filter((e) => e.status === 'stopped').length)} />
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No experiments"
          description="A holdout is the usual first one: hold a slice of eligible customers back from an offer, so its uplift can be measured against people who were never asked."
        />
      ) : null}

      {list.map((experiment) => {
        const rows = arms.filter((a) => a.experimentKey === experiment.key);
        return (
          // A named region per experiment: a page of near-identical cards is
          // hard to navigate by screen reader, and it gives every control an
          // unambiguous owner.
          <section key={experiment.id} aria-label={experiment.name}>
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {experiment.name}
                  <Badge tone={STATUS_TONE[experiment.status]}>{experiment.status}</Badge>
                </span>
              }
              description={experiment.description}
              actions={
                canEdit ? (
                  <div className="flex gap-2">
                    {experiment.status === 'draft' ? (
                      <Button
                        variant="primary"
                        onClick={() => setStatus.mutate({ id: experiment.id, status: 'running' })}
                      >
                        Start
                      </Button>
                    ) : null}
                    {experiment.status === 'running' ? (
                      <Button
                        variant="secondary"
                        onClick={() => setStatus.mutate({ id: experiment.id, status: 'stopped' })}
                      >
                        Stop
                      </Button>
                    ) : null}
                  </div>
                ) : undefined
              }
            />
            <div className="space-y-3 px-card py-3">
              <Split experiment={experiment} />

              <p className="text-label text-content-muted">
                Arms reach policies at{' '}
                <span className="font-mono text-content">experiments.{experiment.key}</span>. A
                holdout is an eligibility rule that refuses when the arm is the untreated one — the
                same editor as every other rule.
              </p>

              {experiment.status !== 'draft' ? (
                <p className="text-label text-content-muted">
                  The split is frozen. An arm is recomputed from the customer reference when a
                  decision is explained later, so reweighting now would make every recomputed arm
                  disagree with the one that actually applied. Stop it and start another to change
                  the split.
                </p>
              ) : null}

              {rows.length > 0 ? (
                <div className="divide-y divide-border rounded border border-border">
                  {rows.map((row) => (
                    <div key={row.arm} className="flex flex-wrap items-baseline gap-3 px-2 py-1.5">
                      <span className="font-mono text-label text-content">{row.arm}</span>
                      {row.holdout ? <Badge tone="hold">holdout</Badge> : null}
                      <span className="text-label text-content-muted">
                        {row.offered.toLocaleString('en-GB')} offered
                      </span>
                      <span className="text-label text-content-muted">
                        {row.measured.toLocaleString('en-GB')} reported
                      </span>
                      <span className="ml-auto text-label">
                        {row.acceptanceRate === null ? (
                          <span
                            className="text-content-muted"
                            title="No outcome has been recorded for this arm, so there is no rate."
                          >
                            no rate yet
                          </span>
                        ) : (
                          <span className="tnum tabular-nums text-content">
                            {(row.acceptanceRate * 100).toFixed(1)}% accepted
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </Card>
          </section>
        );
      })}

      {canEdit ? (
        <Button variant="primary" onClick={() => setCreating(true)}>
          New holdout
        </Button>
      ) : null}

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="New holdout"
        description="Created as a draft. Nobody is assigned until it is started."
        submitLabel="Create draft"
        busy={create.isPending}
        onSubmit={() => create.mutate()}
      >
        <Field label="Name" htmlFor="exp-name">
          <Input
            id="exp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Roaming pass holdout"
          />
        </Field>
        <Field
          label="Key"
          htmlFor="exp-key"
          hint="Becomes the field path a policy reads. Lowercase, digits and underscores."
        >
          <Input
            id="exp-key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="e.g. roaming_holdout"
          />
        </Field>
        <Field label="Held back (%)" htmlFor="exp-holdout" hint="The rest are offered as usual.">
          <Input
            id="exp-holdout"
            type="number"
            min={1}
            max={99}
            value={holdoutPct}
            onChange={(e) => setHoldoutPct(e.target.value)}
          />
        </Field>
      </FormDialog>
    </div>
  );
}

export default function ExperimentsPage() {
  return (
    <RequireAuth>
      <PageHeader
        title="Experiments"
        description="Arms are assigned from the customer reference, never stored, and recomputed when a decision is explained later."
      />
      <PageBody>
        <ExperimentsView />
      </PageBody>
    </RequireAuth>
  );
}
