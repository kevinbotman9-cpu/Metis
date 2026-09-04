'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Badge,
  StatusBadge,
  AutonomyBadge,
  Metric,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError, type TreatmentDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  web: 'Web',
  push: 'Push',
  outbound_call: 'Outbound call',
};

const KIND_TONE: Record<string, 'accent' | 'info' | 'hold'> = {
  eligibility: 'accent',
  applicability: 'info',
  suitability: 'hold',
};

function money(m: { amount: number; currency: string }) {
  const symbol = m.currency === 'GBP' ? '£' : m.currency === 'USD' ? '$' : '€';
  return `${symbol}${(m.amount / 100).toFixed(2)}`;
}

/** Renders a treatment's channel-specific fields without leaking the shape. */
function TreatmentBody({ treatment }: { treatment: TreatmentDto }) {
  const c = treatment.content;
  const rows: [string, string][] = Object.entries(c)
    .filter(([k]) => k !== 'channel')
    .map(([k, v]) => [k, String(v)]);

  return (
    <dl className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-label uppercase tracking-wide text-content-subtle">
            {k.replace(/([A-Z])/g, ' $1')}
          </dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-body text-content">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function PropositionDetail({ propositionId }: { propositionId: string }) {
  const [activeTreatment, setActiveTreatment] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['proposition', propositionId],
    queryFn: () => apiClient.getProposition(propositionId),
    retry: false,
  });

  if (isLoading) {
    return (
      <PageBody>
        <LoadingState label="Loading proposition" />
      </PageBody>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <PageBody>
        <PageHeader
          title="Proposition"
          breadcrumb={
            <Link href="/propositions" className="text-label text-accent hover:underline">
              ← Propositions
            </Link>
          }
        />
        {notFound ? (
          <Card>
            <EmptyState
              title={`No proposition with ID ${propositionId}`}
              description="It may have been deleted, or the link may be stale."
              action={
                <Link href="/propositions">
                  <Button variant="primary">Back to catalogue</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <ErrorState description={(error as Error).message} onRetry={() => refetch()} />
        )}
      </PageBody>
    );
  }

  if (!data) return null;

  const { proposition: p, treatments, policies, autonomy } = data;
  const selected =
    treatments.find((t) => t.id === activeTreatment) ?? treatments[0] ?? null;

  const margin = p.financials.expectedMargin;
  const byKind = (kind: string) => policies.filter((pol) => pol.kind === kind);

  return (
    <PageBody>
      <PageHeader
        breadcrumb={
          <Breadcrumbs
            items={[
              { label: 'Offers' },
              { label: 'Propositions', href: '/propositions' },
              { label: p.name },
            ]}
          />
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name}
            <StatusBadge status={p.status} />
          </span>
        }
        description={p.description}
        actions={
          <>
            <Button variant="secondary" size="md">
              Edit
            </Button>
            <Button variant="primary" size="md">
              Request change
            </Button>
          </>
        }
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric
          label="Price"
          value={money(p.financials.price)}
          sub={p.financials.oneOff ? 'one-off' : 'per month'}
        />
        <Metric label="Cost to serve" value={money(p.financials.cost)} />
        <Metric
          label="Expected margin"
          value={money(margin)}
          tone={margin.amount < 0 ? 'block' : 'pass'}
          sub={p.financials.termMonths > 0 ? `over ${p.financials.termMonths} months` : 'one-off'}
        />
        <Metric
          label="Lever"
          value={p.lever.toFixed(2)}
          tone={p.lever > 1 ? 'pass' : p.lever < 1 ? 'hold' : 'neutral'}
          sub="arbitration weight"
        />
        <Metric
          label="Treatments"
          value={treatments.length}
          tone={treatments.length === 0 ? 'block' : 'neutral'}
          sub={`${treatments.filter((t) => t.active).length} active`}
        />
      </div>

      <div className="grid gap-stack lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-stack">
          {/* Treatments */}
          <Card>
            <CardHeader
              title="Treatments"
              description="The content delivered on each channel."
              actions={
                <Button variant="secondary" size="sm">
                  Add treatment
                </Button>
              }
            />
            {treatments.length === 0 ? (
              <EmptyState
                title="No treatments yet"
                description="A proposition needs at least one active treatment before it can be delivered. This one cannot currently win a decision."
                action={<Button variant="primary">Add the first treatment</Button>}
              />
            ) : (
              <>
                <div className="flex flex-wrap gap-1 border-b border-border px-card py-2">
                  {treatments.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTreatment(t.id)}
                      aria-pressed={selected?.id === t.id}
                      className={cn(
                        'flex items-center gap-1.5 rounded border px-2 py-1 text-label font-medium transition-colors',
                        selected?.id === t.id
                          ? 'border-accent bg-accent-subtle text-accent'
                          : 'border-border text-content-muted hover:bg-surface-sunken'
                      )}
                    >
                      {CHANNEL_LABEL[t.channel] ?? t.channel}
                      {!t.active && (
                        <span className="rounded-sm bg-hold-subtle px-1 text-[0.625rem] text-hold">
                          off
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {selected && (
                  <CardBody>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-body font-medium text-content">{selected.name}</p>
                        <p className="font-mono text-label text-content-subtle">
                          {selected.id} · {selected.locale}
                        </p>
                      </div>
                      <Badge tone={selected.active ? 'pass' : 'hold'}>
                        {selected.active ? 'active' : 'inactive'}
                      </Badge>
                    </div>
                    <div className="rounded border border-border bg-surface-sunken p-3">
                      <TreatmentBody treatment={selected} />
                    </div>
                  </CardBody>
                )}
              </>
            )}
          </Card>

          {/* Engagement policy */}
          <Card>
            <CardHeader
              title="Engagement policy"
              description="Eligibility asks whether we can. Applicability asks whether we should now. Suitability asks whether it is right for this customer."
            />
            <CardBody className="space-y-4">
              {(['eligibility', 'applicability', 'suitability'] as const).map((kind) => {
                const list = byKind(kind);
                return (
                  <div key={kind}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge tone={KIND_TONE[kind]}>{kind}</Badge>
                      <span className="text-label text-content-subtle">
                        {list.length} rule{list.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {list.length === 0 ? (
                      <p className="text-body text-content-subtle">
                        No {kind} rules bound to this proposition.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {list.map((pol) => (
                          <li
                            key={pol.id}
                            className="rounded border border-border bg-surface-sunken px-3 py-2"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-body font-medium text-content">
                                {pol.name}
                              </span>
                              <span className="text-label text-content-subtle">
                                {pol.scope.level}
                              </span>
                            </div>
                            <p className="mt-0.5 text-label text-content-muted">
                              {pol.description}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {pol.conditions.map((c, i) => (
                                <code
                                  key={i}
                                  className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[0.6875rem] text-content-muted"
                                >
                                  {c.field} {c.operator} {JSON.stringify(c.value)}
                                </code>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-stack">
          <Card>
            <CardHeader title="Agentic autonomy" description="Effective level for this scope." />
            <CardBody>
              {autonomy ? (
                <>
                  <div className="flex items-center gap-2">
                    <AutonomyBadge level={autonomy.level} />
                    <span className="text-label text-content-muted">
                      inherited from {autonomy.scope.level}
                    </span>
                  </div>
                  <p className="mt-2 text-body text-content-muted">{autonomy.rationale}</p>
                  <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-label">
                    <div className="flex justify-between">
                      <dt className="text-content-subtle">Blast radius</dt>
                      <dd className="tnum">{autonomy.guardrails.maxBlastRadiusPct}%</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-content-subtle">Max lever delta</dt>
                      <dd className="tnum">
                        ±{(autonomy.guardrails.maxLeverDelta * 100).toFixed(0)}%
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-content-subtle">Bias gate</dt>
                      <dd className="tnum">{autonomy.guardrails.biasGateThreshold.toFixed(2)}</dd>
                    </div>
                  </dl>
                  <Link
                    href="/agentic"
                    className="mt-3 inline-block text-label text-accent hover:underline"
                  >
                    Manage autonomy →
                  </Link>
                </>
              ) : (
                <p className="text-body text-content-muted">No autonomy setting resolved.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-2 text-body">
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Key</dt>
                  <dd className="font-mono text-label">{p.key}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Term</dt>
                  <dd>
                    {p.financials.termMonths > 0
                      ? `${p.financials.termMonths} months`
                      : 'No commitment'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Valid from</dt>
                  <dd className="tnum">{p.validity.startsAt}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Valid until</dt>
                  <dd className="tnum">{p.validity.endsAt ?? 'Open-ended'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Last updated</dt>
                  <dd>{new Date(p.updatedAt).toLocaleDateString('en-GB')}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-content-subtle">By</dt>
                  <dd className="truncate text-right text-label">{p.updatedBy}</dd>
                </div>
              </dl>

              {p.tags.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-1.5 text-label uppercase tracking-wide text-content-subtle">
                    Tags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <Badge key={t} tone="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Where this is used" />
            <CardBody>
              <Link
                href={`/decisions?action=${p.key}`}
                className="block rounded border border-border px-3 py-2 text-body hover:border-accent hover:bg-accent-subtle"
              >
                Decisions that selected this →
              </Link>
              <Link
                href="/arbitration"
                className="mt-2 block rounded border border-border px-3 py-2 text-body hover:border-accent hover:bg-accent-subtle"
              >
                Levers affecting this →
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageBody>
  );
}

export default function PropositionDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return <RequireAuth>{id ? <PropositionDetail propositionId={id} /> : null}</RequireAuth>;
}
