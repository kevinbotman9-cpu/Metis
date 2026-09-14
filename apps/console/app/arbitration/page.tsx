'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { descriptorFor, toFormState, type FormState } from '@metis/ui-metadata';
import { rankCandidates, movement } from '@metis/core/arbitration';
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
import { FormRenderer } from '@/components/ui/form-renderer';
import { RankingPreview } from '@/components/arbitration/ranking-preview';
import { apiClient, type BoostDto, type ChangeSetDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

/**
 * The terms of the ranking formula, as the formula line draws them. What each
 * weight is called and what it means is the descriptor's
 * (`packages/ui-metadata/src/registry/arbitration-config.ts`); this holds only
 * the symbol and the order the formula multiplies them in.
 */
const TERMS = [
  { field: 'weights.propensity', term: 'propensity', symbol: 'P' },
  { field: 'weights.value', term: 'value', symbol: 'V' },
  { field: 'weights.boost', term: 'boost', symbol: 'L' },
  { field: 'weights.context', term: 'context', symbol: 'C' },
] as const;

type Weights = Record<(typeof TERMS)[number]['term'], number>;

const descriptor = descriptorFor('ArbitrationConfig');
const NOTHING_TOUCHED: ReadonlySet<string> = new Set();
const weightOf = (form: FormState | null, field: string) => Number(form?.[field] || 0);
const weightsOf = (form: FormState): Weights =>
  Object.fromEntries(TERMS.map((t) => [t.term, weightOf(form, t.field)])) as Weights;

function ArbitrationView() {
  const { user, hasPermission } = useAuth();
  const canEdit = hasPermission('edit:arbitration');
  const permissions = user?.permissions ?? [];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['arbitration'],
    queryFn: () => apiClient.getArbitration(),
  });
  const scenario = useQuery({
    queryKey: ['arbitration', 'scenario'],
    queryFn: () => apiClient.getArbitrationScenario(),
  });

  const config = data?.config as unknown as Record<string, unknown> | undefined;
  const live = data?.config.weights;
  const saved = useMemo(() => (config ? toFormState(descriptor, config) : null), [config]);
  const [form, setForm] = useState<FormState>(() => toFormState(descriptor));
  const [raised, setRaised] = useState<ChangeSetDto | null>(null);

  // Seed the form once the server's weights arrive, and again after they change.
  useEffect(() => {
    if (saved) setForm(saved);
  }, [saved]);

  const changes = live
    ? TERMS.filter((t) => Math.abs(weightOf(form, t.field) - live[t.term]) > 0.001).map((t) => ({
        ...t,
        before: live[t.term],
        after: weightOf(form, t.field),
      }))
    : [];
  const dirty = changes.length > 0;

  // Ranked here, under the weights as they stand in the form, by the same
  // function the engine ranks with. The live ranking uses the weights the
  // scenario was scored under, so "moved" means moved from what decides now.
  const preview = useMemo(() => {
    const s = scenario.data;
    if (!s) return null;
    const before = rankCandidates(s.candidates, s.weights, s.utility);
    const after = rankCandidates(s.candidates, weightsOf(form), s.utility);
    return { rows: after.rows, ties: after.ties, moved: movement(before, after), name: s.scenario.name };
  }, [scenario.data, form]);

  const queryClient = useQueryClient();
  const raise = useMutation({
    mutationFn: () =>
      apiClient.createChangeSet({
        title: `Arbitration weights: ${changes
          .map((c) => `${c.term} ${c.before.toFixed(2)} → ${c.after.toFixed(2)}`)
          .join(', ')}`,
        description:
          `Raised from /arbitration. On ${preview?.name ?? 'the scenario'}, ` +
          `${preview ? Object.values(preview.moved).filter((m) => m !== 0).length : 0} offer(s) change place` +
          `${preview && preview.ties.length > 0 ? ', and some offers share a priority, so their order is alphabetical' : ''}. ` +
          'Nothing ranks differently until this is approved.',
        changeType: 'arbitration_weights',
        // `before` is the live weight exactly as the server holds it, which the
        // server checks: a change set against a formula that has since changed
        // would silently revert whatever changed it.
        diff: changes.map((c) => ({ field: c.field, before: String(c.before), after: String(c.after) })),
      }),
    onSuccess: (changeSet) => {
      setRaised(changeSet);
      // Nothing was published, so the form goes back to what is live.
      if (saved) setForm(saved);
      queryClient.invalidateQueries({ queryKey: ['change-sets'] });
    },
  });

  const boosts = data?.boosts ?? [];

  const boostColumns: Column<BoostDto>[] = [
    {
      key: 'name',
      header: 'Boost',
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
            <div className="mt-0.5 font-mono text-label text-content-subtle">{l.scope.targetId}</div>
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
        title="Arbitration & boosts"
        description="How competing offers are ranked. Move a weight and the ranking below reorders; nothing changes how decisions rank until a change set is approved."
      />

      <div className="mb-stack">
        <Card>
          <CardHeader
            title="Ranking formula"
            actions={
              canEdit ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!dirty || raise.isPending}
                    onClick={() => saved && setForm(saved)}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!dirty || raise.isPending}
                    onClick={() => raise.mutate()}
                  >
                    {raise.isPending ? 'Raising…' : descriptor.edit.submitLabel}
                  </Button>
                </>
              ) : (
                <Badge tone="outline">read only</Badge>
              )
            }
          />
          <CardBody>
            <div className="mb-5 rounded border border-border bg-surface-sunken px-4 py-3 text-center">
              <p className="font-mono text-body text-content">
                Priority ={' '}
                {TERMS.map((t, i) => (
                  <span key={t.field}>
                    {i > 0 && <span className="text-content-subtle"> × </span>}
                    <span className="font-semibold text-accent">{t.symbol}</span>
                    <sup className="tnum">{weightOf(form, t.field).toFixed(2)}</sup>
                  </span>
                ))}
              </p>
              {dirty && <p className="mt-1.5 text-label text-hold">Proposed, not live. {descriptor.edit.description}</p>}
              {raised && !dirty && (
                <p className="mt-1.5 text-label text-pass" role="status">
                  Raised{' '}
                  <Link href={`/approvals/${raised.id}`} className="font-mono underline">
                    {raised.id}
                  </Link>
                  . Nothing is published until it is approved.
                </p>
              )}
              {raise.isError && (
                <p role="alert" className="mt-1.5 text-label text-block">
                  {(raise.error as Error).message}
                </p>
              )}
            </div>

            {canEdit ? (
              // The generic renderer, inline rather than in a dialog: the
              // ranking below is the preview, and it has to be in view while the
              // weights move.
              <FormRenderer
                descriptor={descriptor}
                form={form}
                onChange={setForm}
                editing
                permissions={permissions}
                touched={NOTHING_TOUCHED}
                onTouch={() => undefined}
                idPrefix="arbitration"
              />
            ) : (
              <dl className="grid gap-4 lg:grid-cols-2">
                {descriptor.fields.map((field) => (
                  <div key={field.field} className="rounded border border-border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-body font-medium text-content">{field.label}</dt>
                      <dd className="tnum text-body font-semibold">{weightOf(saved, field.field).toFixed(2)}</dd>
                    </div>
                    {field.help ? <p className="mt-1.5 text-label text-content-muted">{field.help}</p> : null}
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-5 border-t border-border pt-4">
              {scenario.isLoading ? (
                <LoadingState label="Ranking the scenario" />
              ) : scenario.error ? (
                <ErrorState description={(scenario.error as Error).message} onRetry={() => scenario.refetch()} />
              ) : preview && preview.rows.length > 0 ? (
                <RankingPreview scenarioName={preview.name} rows={preview.rows} moved={preview.moved} ties={preview.ties} />
              ) : (
                <p className="text-label text-content-muted">Nothing reaches ranking in the scenario, so there is no order to show.</p>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Active boosts" value={boosts.length} />
        <Metric label="Boosting" value={boosts.filter((l) => l.value > 1).length} tone="pass" />
        <Metric label="Suppressing" value={boosts.filter((l) => l.value < 1).length} tone="hold" />
        <Metric label="Time-boxed" value={boosts.filter((l) => l.validity).length} sub="expire automatically" />
      </div>

      <Card>
        <CardHeader
          title="Boosts"
          description="Business weights applied at a scope. The most specific scope wins."
          actions={
            canEdit ? (
              // Disabled rather than removed, and disabled rather than left
              // enabled and dead: there is no write operation for a boost in
              // the spec, so there is nothing for this to call. An enabled
              // control that does nothing is a promise; a disabled one with a
              // reason is an absence somebody can plan around.
              <Button
                variant="secondary"
                size="sm"
                disabled
                title="Not built: creating a boost has no API yet. Boosts are edited in the catalogue fixture."
              >
                New boost
              </Button>
            ) : null
          }
        />
        <DataTable
          columns={boostColumns}
          rows={boosts}
          rowKey={(l) => l.id}
          defaultSort={{ key: 'value', dir: 'desc' }}
          emptyTitle="No boosts configured"
          caption="Arbitration boosts"
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
