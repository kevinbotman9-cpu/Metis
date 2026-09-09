'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import { OfferFormDialog } from '@/components/offer-form-dialog';
import { CreativeFormDialog } from '@/components/creative-form-dialog';
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
import { apiClient, ApiError, type CreativeDto } from '@/lib/api-client';
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
  relevance: 'info',
  suitability: 'hold',
};

function money(m: { amount: number; currency: string }) {
  const symbol = m.currency === 'GBP' ? '£' : m.currency === 'USD' ? '$' : '€';
  return `${symbol}${(m.amount / 100).toFixed(2)}`;
}

/** Renders a creative's channel-specific fields without leaking the shape. */
function CreativeBody({ creative }: { creative: CreativeDto }) {
  const c = creative.content;
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

function OfferDetail({ offerId }: { offerId: string }) {
  const [activeCreative, setActiveCreative] = useState<string | null>(null);
  const [editingOffer, setEditingOffer] = useState(false);
  const [creativeDialog, setCreativeDialog] = useState<
    { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; creative: CreativeDto }
  >({ mode: 'closed' });
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:offers');
  const queryClient = useQueryClient();

  /**
   * Activate or pause the offer.
   *
   * Kept here rather than in the edit form because the reason it can be refused
   * is on this page: an offer with no active creative cannot go active, and the
   * creatives are three inches below. The server's message is shown verbatim —
   * it names the offer and says what to do, and paraphrasing it here would be a
   * second place to keep that wording right.
   */
  const setStatus = useMutation({
    mutationFn: (status: string) => apiClient.updateOffer(offerId, { status } as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', offerId] });
      queryClient.invalidateQueries({ queryKey: ['offers'] });
    },
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['offer', offerId],
    queryFn: () => apiClient.getOffer(offerId),
    retry: false,
  });

  if (isLoading) {
    return (
      <PageBody>
        <LoadingState label="Loading offer" />
      </PageBody>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <PageBody>
        <PageHeader
          title="Offer"
          breadcrumb={
            <Link href="/offers" className="text-label text-accent hover:underline">
              ← Offers
            </Link>
          }
        />
        {notFound ? (
          <Card>
            <EmptyState
              title={`No offer with ID ${offerId}`}
              description="It may have been deleted, or the link may be stale."
              action={
                <Link href="/offers">
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

  const { offer: p, creatives, policies, autonomy } = data;
  const selected =
    creatives.find((t) => t.id === activeCreative) ?? creatives[0] ?? null;

  const margin = p.financials.expectedMargin;
  const byKind = (kind: string) => policies.filter((pol) => pol.kind === kind);

  return (
    <PageBody>
      <PageHeader
        breadcrumb={
          <Breadcrumbs
            items={[
              { label: 'Offers' },
              { label: 'Offers', href: '/offers' },
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
          canEdit ? (
            <>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setEditingOffer(true)}
                aria-label={`Edit offer ${p.name}`}
              >
                Edit
              </Button>
              {/* `createChangeSet` exists, and proposing one means building a
                  diff of what would change — the approval surface reads a diff,
                  not a form. Disabled with the reason until that is built. */}
              <Button
                variant="secondary"
                size="md"
                disabled
                title="Not built: proposing a change set from this screen needs a diff builder."
              >
                Request change
              </Button>
              {p.status === 'active' ? (
                <Button
                  variant="secondary"
                  size="md"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate('paused')}
                >
                  Pause
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate('active')}
                >
                  Activate
                </Button>
              )}
            </>
          ) : null
        }
      />

      {setStatus.error instanceof ApiError ? (
        <p
          role="alert"
          className="mb-stack rounded border border-block/40 bg-block-subtle px-3 py-2 text-body text-block"
        >
          {setStatus.error.message}
        </p>
      ) : null}

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
          label="Boost"
          value={p.boost.toFixed(2)}
          tone={p.boost > 1 ? 'pass' : p.boost < 1 ? 'hold' : 'neutral'}
          sub="arbitration weight"
        />
        <Metric
          label="Creatives"
          value={creatives.length}
          tone={creatives.length === 0 ? 'block' : 'neutral'}
          sub={`${creatives.filter((t) => t.active).length} active`}
        />
      </div>

      <div className="grid gap-stack lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-stack">
          {/* Creatives */}
          <Card>
            <CardHeader
              title="Creatives"
              description="The content delivered on each channel."
              actions={
                canEdit ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCreativeDialog({ mode: 'new' })}
                  >
                    Add creative
                  </Button>
                ) : null
              }
            />
            {creatives.length === 0 ? (
              <EmptyState
                title="No creatives yet"
                description="An offer needs at least one active creative before it can be delivered. This one cannot currently win a decision."
                action={
                  canEdit ? (
                    <Button variant="primary" onClick={() => setCreativeDialog({ mode: 'new' })}>
                      Add the first creative
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className="flex flex-wrap gap-1 border-b border-border px-card py-2">
                  {creatives.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveCreative(t.id)}
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
                      <div className="flex items-center gap-2">
                        <Badge tone={selected.active ? 'pass' : 'hold'}>
                          {selected.active ? 'active' : 'inactive'}
                        </Badge>
                        {canEdit ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setCreativeDialog({ mode: 'edit', creative: selected })
                            }
                            // Two buttons on this page said only "Edit", and a
                            // screen-reader user tabbing heard the word twice
                            // with nothing to tell them apart. It is also why
                            // the tests were counting positions. The visible
                            // label stays short; the accessible one says what
                            // it edits.
                            aria-label={`Edit creative ${selected.name}`}
                          >
                            Edit
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded border border-border bg-surface-sunken p-3">
                      <CreativeBody creative={selected} />
                    </div>
                  </CardBody>
                )}
              </>
            )}
          </Card>

          {/* Targeting policy */}
          <Card>
            <CardHeader
              title="Targeting policy"
              description="Eligibility asks whether we can. Relevance asks whether we should now. Suitability asks whether it is right for this customer."
            />
            <CardBody className="space-y-4">
              {(['eligibility', 'relevance', 'suitability'] as const).map((kind) => {
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
                        No {kind} rules bound to this offer.
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
                      <dt className="text-content-subtle">Max boost delta</dt>
                      <dd className="tnum">
                        ±{(autonomy.guardrails.maxBoostDelta * 100).toFixed(0)}%
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
                Boosts affecting this →
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>

      <OfferFormDialog open={editingOffer} onOpenChange={setEditingOffer} offer={p} />

      <CreativeFormDialog
        open={creativeDialog.mode !== 'closed'}
        onOpenChange={(open) => !open && setCreativeDialog({ mode: 'closed' })}
        offerId={offerId}
        creative={creativeDialog.mode === 'edit' ? creativeDialog.creative : undefined}
      />
    </PageBody>
  );
}

export default function OfferDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return <RequireAuth>{id ? <OfferDetail offerId={id} /> : null}</RequireAuth>;
}
