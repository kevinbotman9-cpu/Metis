'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
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
  EmptyState,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';
import { downloadJson, evidenceFilename } from '@/lib/download';
import { cn } from '@/lib/cn';

const AUDIENCES = [
  { key: 'customer', label: 'Customer', blurb: 'Plain language, no internal identifiers.' },
  { key: 'business', label: 'Business', blurb: 'Value, boosts and commercial outcome.' },
  { key: 'analyst', label: 'Analyst', blurb: 'Full score composition and elimination detail.' },
  { key: 'engineer', label: 'Engineer', blurb: 'Node IDs, timings and artifact version.' },
  { key: 'regulator', label: 'Regulator', blurb: 'Policies applied, consent state and evidence.' },
] as const;

type AudienceKey = (typeof AUDIENCES)[number]['key'];

function TraceView({ decisionId }: { decisionId: string }) {
  const [audience, setAudience] = useState<AudienceKey>('analyst');

  const { data: trace, isLoading, error, refetch } = useQuery({
    queryKey: ['trace', decisionId],
    queryFn: () => apiClient.getDecisionRecord(decisionId),
    retry: false,
  });

  const replay = useMutation({
    mutationFn: () => apiClient.replayDecision(decisionId),
  });

  if (isLoading) {
    return (
      <PageBody>
        <LoadingState label="Loading trace" />
      </PageBody>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <PageBody>
        <PageHeader
          title="Decision trace"
          breadcrumb={
            <Link href="/decisions" className="text-label text-accent hover:underline">
              ← Decisions
            </Link>
          }
        />
        {notFound ? (
          <Card>
            <EmptyState
              title={`No decision with ID ${decisionId}`}
              description="It may have been outside the retention window, or the link may be stale."
              action={
                <Link href="/decisions">
                  <Button variant="primary">Back to decision search</Button>
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

  if (!trace) return null;

  const ranked = Object.entries(trace.scores).sort((a, b) => b[1].priority - a[1].priority);
  const maxPriority = ranked[0]?.[1].priority ?? 1;
  const show = (...keys: AudienceKey[]) => keys.includes(audience);

  return (
    <PageBody>
      <PageHeader
        breadcrumb={
          <Breadcrumbs
            items={[
              { label: 'Decisioning' },
              { label: 'Decisions', href: '/decisions' },
              { label: trace.id },
            ]}
          />
        }
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-base">{trace.id}</span>
            {trace.winner ? (
              <Badge tone="pass">{trace.winner}</Badge>
            ) : (
              <Badge tone="block">no offer</Badge>
            )}
          </span>
        }
        description="Immutable record of what the platform decided and why."
        actions={
          <>
            {/* The regulator-ready pack is a document, not a serialisation: it
                needs a renderer, pagination and the hash verification page
                §7.5 of the experience plan describes. None of that exists, and
                `window.print()` dressed as "Export PDF" would be a promise
                rather than a feature. Disabled with the reason, per the
                convention on /agentic and /arbitration. Registered as W-053. */}
            <Button
              variant="secondary"
              size="sm"
              disabled
              title="Not built: the regulator pack needs a document renderer and a hash verification page (W-053). Export JSON carries the same evidence."
            >
              Export PDF
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                downloadJson(
                  evidenceFilename('decision', trace.id, trace.timestamp),
                  trace
                )
              }
            >
              Export JSON
            </Button>
          </>
        }
      />

      {/* Audience selector */}
      <div className="mb-stack flex flex-wrap items-center gap-2">
        <span className="text-label uppercase tracking-wide text-content-subtle">
          Explain for
        </span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Trace audience">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              onClick={() => setAudience(a.key)}
              aria-pressed={audience === a.key}
              className={cn(
                'rounded border px-2 py-1 text-label font-medium transition-colors',
                audience === a.key
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-border text-content-muted hover:bg-surface-sunken'
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <span className="text-label text-content-subtle">
          {AUDIENCES.find((a) => a.key === audience)?.blurb}
        </span>
      </div>

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Latency"
          value={`${trace.totalMs.toFixed(1)}ms`}
          tone={trace.totalMs > 20 ? 'hold' : 'pass'}
          sub="SLA 50ms"
        />
        <Metric label="Candidates" value={trace.candidateCount} sub="entered arbitration" />
        <Metric label="Channel" value={trace.channel.replace('_', ' ')} sub={trace.placement} />
        <Metric label="Artifact" value={trace.artifactVersion} sub={trace.artifactId} />
      </div>

      <div className="grid gap-stack lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-stack">
          {/* Cascade */}
          <Card>
            <CardHeader
              title="Elimination cascade"
              description="Each node in order, and what it removed."
            />
            <CardBody>
              <ol className="space-y-0">
                {trace.eliminations.map((step, i) => {
                  const last = i === trace.eliminations.length - 1;
                  const removed = step.denials.length;
                  return (
                    <li key={step.nodeId} className="relative flex gap-3 pb-4 last:pb-0">
                      {!last && (
                        <span
                          aria-hidden
                          className="absolute left-[0.6875rem] top-6 h-[calc(100%-1rem)] w-px bg-border"
                        />
                      )}
                      <span
                        className={cn(
                          'z-10 mt-0.5 flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold',
                          removed > 0
                            ? 'bg-block-subtle text-block'
                            : 'bg-pass-subtle text-pass'
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-label font-medium text-accent">
                            {step.nodeId}
                          </span>
                          {show('engineer', 'analyst') && (
                            <Badge tone="outline">{step.nodeType}</Badge>
                          )}
                          <span className="text-label text-content-subtle">
                            {step.survived.length} survived
                          </span>
                        </div>
                        <p className="mt-1 text-body text-content-muted">{step.reason}</p>
                        {removed > 0 && (
                          <ul className="mt-1.5 space-y-1">
                            {step.denials.map((d) => (
                              <li key={d.key} className="flex flex-wrap items-baseline gap-1.5">
                                <Badge tone="block">{d.key}</Badge>
                                {/* The code is the answer to "why not this
                                    one"; the prose above is about the node.
                                    Shown to every audience, because a support
                                    agent needs it as much as an engineer. */}
                                <span className="font-mono text-label font-medium text-block">
                                  {d.code}
                                </span>
                                {d.ruleId && show('engineer', 'analyst', 'regulator') ? (
                                  <span className="font-mono text-label text-content-subtle">
                                    {d.ruleId}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardBody>
          </Card>

          {/* Scores */}
          {show('analyst', 'business', 'engineer') && (
            <Card>
              <CardHeader
                title="Score composition"
                description={
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span>{trace.arbitration.formula}</span>
                    {/* Which function computed this, by version. A decision has
                        to identify every version that produced it, and the
                        formula string alone is display text that two different
                        functions could share. */}
                    <span className="font-mono text-label text-content-subtle">
                      {trace.arbitration.utility.id}@{trace.arbitration.utility.version}
                    </span>
                  </span>
                }
              />
              <CardBody>
                {ranked.length === 0 ? (
                  <EmptyState
                    title="No candidate reached scoring"
                    description="Every candidate was removed before arbitration."
                  />
                ) : (
                  <table className="w-full text-body">
                    <thead>
                      <tr className="border-b border-border text-label uppercase tracking-wide text-content-subtle">
                        <th className="py-1.5 text-left font-semibold">Action</th>
                        <th className="py-1.5 text-right font-semibold">P</th>
                        <th className="py-1.5 text-right font-semibold">V</th>
                        <th className="py-1.5 text-right font-semibold">L</th>
                        <th className="py-1.5 text-right font-semibold">C</th>
                        <th className="py-1.5 text-right font-semibold">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map(([action, s], i) => (
                        <tr key={action} className="border-b border-border/60">
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              {i === 0 && trace.winner === action ? (
                                <Badge tone="pass">winner</Badge>
                              ) : null}
                              <span className="font-medium">{action}</span>
                            </div>
                            <div
                              className="mt-1 h-1 rounded-full bg-accent/70"
                              style={{ width: `${(s.priority / maxPriority) * 100}%` }}
                              aria-hidden
                            />
                          </td>
                          <td className="tnum py-2 text-right text-content-muted">
                            {s.propensity.toFixed(3)}
                          </td>
                          <td className="tnum py-2 text-right text-content-muted">
                            {s.value.toFixed(3)}
                          </td>
                          <td className="tnum py-2 text-right text-content-muted">
                            {s.boost.toFixed(2)}
                          </td>
                          <td className="tnum py-2 text-right text-content-muted">
                            {s.context.toFixed(3)}
                          </td>
                          <td className="tnum py-2 text-right font-semibold">
                            {s.priority.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardBody>
            </Card>
          )}

          {/* Timings */}
          {show('engineer', 'analyst') && (
            <Card>
              <CardHeader title="Execution timings" description="Per-node latency." />
              <CardBody>
                <ul className="space-y-2">
                  {Object.entries(trace.timings).map(([node, ms]) => (
                    <li key={node} className="flex items-center gap-3">
                      <span className="w-44 shrink-0 font-mono text-label text-accent">
                        {node}
                      </span>
                      <span className="h-1.5 flex-1 rounded-full bg-surface-sunken">
                        <span
                          className="block h-1.5 rounded-full bg-accent"
                          style={{ width: `${(ms / trace.totalMs) * 100}%` }}
                        />
                      </span>
                      <span className="tnum w-14 text-right text-content-muted">
                        {ms.toFixed(1)}ms
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-between border-t border-border pt-2 text-body font-semibold">
                  <span>Total</span>
                  <span className="tnum text-pass">{trace.totalMs.toFixed(1)}ms</span>
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-stack">
          <Card>
            <CardHeader
              title="Determinism"
              description="Re-execute against the stored artifact version."
            />
            <CardBody>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => replay.mutate()}
                disabled={replay.isPending}
              >
                {replay.isPending ? 'Replaying…' : 'Replay this decision'}
              </Button>

              {replay.isError && (
                <p role="alert" className="mt-3 rounded border border-block/40 bg-block-subtle px-3 py-2 text-body text-block">
                  Replay failed: {(replay.error as Error).message}
                </p>
              )}

              {replay.data && (
                <div
                  className={cn(
                    'mt-3 rounded border px-3 py-2',
                    replay.data.identical
                      ? 'border-pass/40 bg-pass-subtle'
                      : 'border-block/40 bg-block-subtle'
                  )}
                >
                  <p
                    className={cn(
                      'text-body font-semibold',
                      replay.data.identical ? 'text-pass' : 'text-block'
                    )}
                  >
                    {replay.data.identical ? 'Identical' : 'Diverged'}
                  </p>
                  <p className="mt-1 text-label text-content-muted">
                    Re-executed against artifact {replay.data.artifactVersion}. Original winner{' '}
                    <span className="font-mono">{replay.data.originalWinner ?? 'none'}</span>,
                    replayed winner{' '}
                    <span className="font-mono">{replay.data.replayedWinner ?? 'none'}</span>.
                  </p>
                  <dl className="mt-2 space-y-1 text-[0.6875rem]">
                    <div>
                      <dt className="text-content-subtle">Stored hash</dt>
                      <dd className="break-all font-mono">{replay.data.originalChainHash}</dd>
                    </div>
                    <div>
                      <dt className="text-content-subtle">Replayed hash</dt>
                      <dd className="break-all font-mono">{replay.data.replayedChainHash}</dd>
                    </div>
                  </dl>

                  {replay.data.diff.length > 0 && (
                    <div className="mt-2">
                      <p className="mb-1 text-label font-medium text-block">What changed</p>
                      <ul className="space-y-1">
                        {replay.data.diff.slice(0, 8).map((d) => (
                          <li key={d.path} className="font-mono text-[0.6875rem]">
                            <span className="text-content-subtle">{d.path}</span>{' '}
                            <span className="text-block">{JSON.stringify(d.original)}</span>
                            {' -> '}
                            <span className="text-pass">{JSON.stringify(d.replayed)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Metadata" />
            <CardBody>
              <dl className="space-y-2 text-body">
                {[
                  ['Decision ID', trace.id, true],
                  ['Customer', trace.customerId, true],
                  ['Timestamp', new Date(trace.timestamp).toLocaleString('en-GB'), false],
                  ['Tenant', trace.tenantId, false],
                  ['Artifact', `${trace.artifactId} ${trace.artifactVersion}`, true],
                  ['Placement', trace.placement, true],
                  ['Input snapshot', `${trace.inputSnapshotHash.slice(0, 16)}...`, true],
                ].map(([label, value, mono]) => (
                  <div key={String(label)} className="flex justify-between gap-3">
                    <dt className="shrink-0 text-content-subtle">{label}</dt>
                    <dd className={cn('truncate text-right', mono && 'font-mono text-label')}>
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1 text-label uppercase tracking-wide text-content-subtle">
                  Chain hash
                </p>
                <code className="block break-all rounded border border-border bg-surface-sunken px-2 py-1.5 font-mono text-[0.6875rem] text-content-muted">
                  {trace.chainHash}
                </code>
                <p className="mt-1 text-label text-content-subtle">
                  sha256 over the reproducible part of this decision. Timings are excluded, so
                  the hash is stable across executions. The decision ID is its first 16
                  characters.
                </p>
              </div>
            </CardBody>
          </Card>

          {(trace.sourceBindings?.length ?? 0) > 0 && (
            <Card>
              <CardHeader
                title="Where the data came from"
                description="Fields fetched from an integration when this decision was made. The values are inside the input snapshot above, not stored here — a trace can be kept without keeping the customer data it was made from."
              />
              <CardBody>
                <ul className="space-y-2">
                  {(trace.sourceBindings ?? []).map((b) => {
                    const call = trace.sourceCalls?.find((c) => c.connectorId === b.connectorId);
                    return (
                      <li
                        key={`${b.field}-${b.connectorId}`}
                        className="flex items-baseline justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <span className="font-mono text-label text-content">{b.field}</span>
                          <span className="ml-2 text-label text-content-muted">
                            via {b.connectorId}
                          </span>
                          <div className="font-mono text-[0.6875rem] text-content-subtle">
                            at node {b.nodeId}
                          </div>
                        </div>
                        {call && (
                          <div className="shrink-0 text-right">
                            <Badge tone={call.outcome === 'ok' ? 'pass' : 'block'}>
                              {call.outcome}
                            </Badge>
                            <div className="tnum text-[0.6875rem] text-content-subtle">
                              {call.ms}ms {call.cacheHit ? 'cached' : 'live'}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-label text-content-subtle">
                  Replay does not call these again. It re-executes against the recorded
                  snapshot, which is why a decision that used an integration reproduces as
                  exactly as one that did not.
                </p>
              </CardBody>
            </Card>
          )}

          {show('regulator', 'analyst', 'business') && (
            <Card>
              <CardHeader
                title="Consent and policy"
                description="What governed this decision."
              />
              <CardBody>
                <p className="mb-2 text-label uppercase tracking-wide text-content-subtle">
                  Consent state
                </p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(trace.consentState).map(([k, v]) => (
                    <Badge key={k} tone={v ? 'pass' : 'block'}>
                      {k}: {v ? 'granted' : 'withheld'}
                    </Badge>
                  ))}
                </div>

                <p className="mb-2 mt-4 text-label uppercase tracking-wide text-content-subtle">
                  Frequency policies applied
                </p>
                <ul className="space-y-1">
                  {trace.constraintsApplied.map((c) => (
                    <li key={c} className="font-mono text-label text-content-muted">
                      {c}
                    </li>
                  ))}
                </ul>

                {trace.creativeId && (
                  <>
                    <p className="mb-2 mt-4 text-label uppercase tracking-wide text-content-subtle">
                      Creative delivered
                    </p>
                    <Link
                      href={`/offers/${trace.winnerOfferId}`}
                      className="font-mono text-label text-accent hover:underline"
                    >
                      {trace.creativeId}
                    </Link>
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </PageBody>
  );
}

export default function DecisionDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  return (
    <RequireAuth>
      {id ? <TraceView decisionId={id} /> : null}
    </RequireAuth>
  );
}
