'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation';
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
import { ProvenanceBanner } from '@/components/ui/provenance-banner';
import { CascadeRail, type CascadeStage } from '@/components/cascade-rail';
import { TraceEvidence } from '@/components/trace-evidence';
import { CODE_MEANING, groupDenials, stagesFor } from '@/components/trace-cascade';
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
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Which stage is open lives in the URL: a colleague should be able to be sent
  // the node that removed the offer, rather than told how to reach it.
  const selectedNode = params.get('stage');
  const setSelectedNode = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('stage', id);
    else next.delete('stage');
    // The rule only means anything inside a stage, so it goes when the stage does.
    next.delete('rule');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const selectedGroupId = params.get('rule');
  const setSelectedGroupId = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('rule', id);
    else next.delete('rule');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { data: trace, isLoading, error, refetch } = useQuery({
    queryKey: ['trace', decisionId],
    queryFn: () => apiClient.getDecisionRecord(decisionId),
    retry: false,
  });

  // The evidence pane resolves a ruleId to the policy that bears it, and the
  // artifact to the packs it compiled against. Both are lookups rather than
  // trace content; neither blocks the screen if it fails.
  const policies = useQuery({
    queryKey: ['targeting-policies'],
    queryFn: () => apiClient.listTargetingPolicies(),
  });
  const artifact = useQuery({
    queryKey: ['artifact', trace?.artifactId],
    queryFn: () => apiClient.getArtifact(trace!.artifactId),
    enabled: Boolean(trace?.artifactId),
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

  // --- the cascade -------------------------------------------------------
  // The compiled nodes carry the tier each node implements, so the rail reads
  // it instead of inferring one from the node id (G-058).
  const compiled = artifact.data?.compilation?.artifact ?? null;
  const stages = stagesFor(trace, compiled?.nodes);
  const selectedStage = stages.find((s) => s.nodeId === selectedNode) ?? null;
  const groups = selectedStage ? groupDenials(selectedStage.denials) : [];
  const selectedGroup =
    groups.find((g) => (g.ruleId ?? `code:${g.codes[0]}`) === selectedGroupId) ?? null;

  const policyName = (ruleId: string | null) =>
    ruleId ? (policies.data?.policies ?? []).find((p) => p.id === ruleId)?.name : undefined;

  const packageVersions = compiled?.packageVersions ?? null;
  // Null while the artifact is in flight; an empty map when the tenant has no
  // packs installed. The evidence pane says which of the two it is.
  const policySources = artifact.data ? (compiled?.policySources ?? {}) : null;

  const entered = Math.max(1, trace.candidateCount || 1);
  const railStages: CascadeStage[] = stages.map((s) => ({
    id: s.nodeId,
    label: s.label,
    // The figure is what survived. A stage that shows what it removed would
    // make the rail read as a list of events rather than as a funnel, and the
    // removal is already on the line beneath.
    value: s.survived,
    pct: (s.survived / entered) * 100,
    note:
      s.nodeId === '__entry'
        ? `${trace.artifactId} ${trace.artifactVersion}`
        : `${((s.survived / entered) * 100).toFixed(0)}% of entrants`,
    removed: s.removed,
  }));

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
                downloadJson(evidenceFilename('decision', trace.id, trace.timestamp), {
                  // First key in the file, so it is the first thing read in an
                  // editor and the first thing seen in a diff. A synthetic
                  // record that leaves the building without saying so is the
                  // failure this exists to prevent.
                  provenance: trace.provenance,
                  ...trace,
                })
              }
            >
              Export JSON
            </Button>
          </>
        }
      />

      {/* Between the header and the trace, so a screenshot of the cascade or
          of the score table carries it. */}
      <ProvenanceBanner provenance={trace.provenance} />

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

      {/*
        The elimination funnel as a Cascade — METIS_CONSOLE_SPEC.md §4.7.

        This was a vertical list of nodes inside one card, which showed the
        order and hid the shape: a reader could see that five nodes ran and not
        that 22 candidates became one. The rail is the funnel now, the middle
        pane holds what the selected stage removed grouped by the rule that
        removed it, and the right pane holds the evidence behind whatever is
        selected.

        The stages come from the trace's own nodes rather than from the
        three-tier targeting model. Flows differ — `inbound-web-offers` has one
        filter and no relevance or suitability at all — so a fixed rail would
        show three permanently empty stages on two thirds of this tenant's
        decisions, which is a screen lying about the flow it is showing.
      */}
      <div className="mb-stack grid gap-3 xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,21rem)]">
        <Card className="self-start">
          <CascadeRail
            label="Elimination funnel"
            stages={railStages}
            selected={selectedNode}
            onSelect={setSelectedNode}
            foot={
              <>
                {trace.candidateCount} entered,{' '}
                <strong className="font-semibold text-content">
                  {trace.winner ? '1 was offered' : 'none was offered'}
                </strong>
                . Every stage is what the flow actually ran, not the policy model.
              </>
            }
          />
        </Card>

        <div className="min-w-0">
          {selectedStage ? (
            <Card>
              <CardHeader
                title={
                  selectedStage.removed > 0
                    ? `${selectedStage.label} removed ${selectedStage.removed}`
                    : `${selectedStage.label} removed nothing`
                }
                description={
                  selectedStage.removed > 0
                    ? 'Grouped by the rule that removed them. A reason code is shared by a whole tier; the rule is the thing somebody can go and change.'
                    : selectedStage.reason || 'Every candidate carried on from this node.'
                }
              />
              <CardBody>
                {groups.length === 0 ? (
                  <p className="text-label text-content-muted">
                    Nothing was removed here, so there is nothing to explain.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {groups.map((g) => {
                      const groupId = g.ruleId ?? `code:${g.codes[0]}`;
                      const open = groupId === selectedGroupId;
                      return (
                        <li key={groupId}>
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-label={`${g.ruleId ?? g.codes[0]}: ${g.keys.length} removed`}
                            onClick={() => setSelectedGroupId(open ? null : groupId)}
                            className={cn(
                              'w-full rounded border px-cell py-2 text-left transition-colors',
                              'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-accent',
                              open ? 'border-accent bg-surface-sunken' : 'border-border'
                            )}
                          >
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="font-mono text-label text-content">
                                {g.ruleId ?? g.codes[0]}
                              </span>
                              <span className="tnum text-label text-content-muted">
                                {g.keys.length} removed
                              </span>
                            </span>
                            <span className="mt-0.5 block text-label text-content-subtle">
                              {policyName(g.ruleId) ?? CODE_MEANING[g.codes[0]] ?? ''}
                            </span>
                          </button>

                          {open ? (
                            <ul className="mt-1 flex flex-col border-l-2 border-accent/40 pl-3">
                              {g.keys.map((k) => (
                                <li key={k} className="py-1">
                                  {/* Every number on this screen reaches its
                                      source; an action key reaches the offer
                                      it names. */}
                                  <Link
                                    href={`/offers?action=${encodeURIComponent(k)}`}
                                    className="font-mono text-label text-accent underline-offset-2 hover:underline"
                                  >
                                    {k}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title={`${trace.candidateCount} candidates, ${trace.winner ? 'one offered' : 'none offered'}`}
                description="The flow that ran, node by node. Select a stage in the rail to see what it removed."
              />
              <CardBody>
                <ol className="flex flex-col gap-1.5">
                  {stages.map((st) => (
                    <li key={st.nodeId} className="flex items-baseline gap-2 text-label">
                      <span className="tnum w-10 shrink-0 text-right text-content-muted">
                        {st.survived}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-content">{st.label}</span>
                      <span className="tnum w-16 shrink-0 text-right text-content-subtle">
                        {st.removed > 0 ? `−${st.removed}` : '—'}
                      </span>
                    </li>
                  ))}
                </ol>
                {!trace.winner ? (
                  <p className="mt-3 text-label text-content-muted">
                    This decision returned no offer. Every candidate was removed before
                    arbitration could rank one, which is a result rather than a failure.
                  </p>
                ) : null}
              </CardBody>
            </Card>
          )}
        </div>

        <Card className="self-start" label="Evidence">
          <CardBody>
            <TraceEvidence
              trace={trace}
              stage={selectedStage}
              group={selectedGroup}
              policies={policies.data?.policies ?? []}
              packageVersions={packageVersions}
              policySources={policySources}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-stack lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-stack">
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
                  // The third thing the chain hash covers. Shown beside the
                  // other two because a hash whose inputs are half-hidden is a
                  // number to be trusted rather than checked, and this screen
                  // exists for the reader who will not trust it (G-087).
                  ['Catalogue', `${trace.catalogueSnapshotHash.slice(0, 16)}...`, true],
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
                  characters. It covers the input snapshot and the catalogue above, both of
                  which are named here so the hash can be checked rather than taken on trust.
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
