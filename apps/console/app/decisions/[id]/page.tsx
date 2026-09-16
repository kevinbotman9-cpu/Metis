'use client';

import { InfoTip } from '@/components/ui/tooltip';
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
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';
import { downloadJson, evidenceFilename } from '@/lib/download';
import { ProvenanceBanner } from '@/components/ui/provenance-banner';
import { CascadeRail, type CascadeStage } from '@/components/cascade-rail';
import { CascadePanes } from '@/components/cascade-panes';
import { TraceEvidence } from '@/components/trace-evidence';
import { CODE_MEANING, groupDenials, stagesFor } from '@/components/trace-cascade';
import { cn } from '@/lib/cn';
import { useFormat } from '@/components/tenant-format';

const AUDIENCES = [
  { key: 'customer', label: 'Customer', blurb: 'Plain language, no internal identifiers.' },
  { key: 'business', label: 'Business', blurb: 'Value, boosts and commercial outcome.' },
  { key: 'analyst', label: 'Analyst', blurb: 'Full score composition and elimination detail.' },
  { key: 'engineer', label: 'Engineer', blurb: 'Node IDs, timings and artifact version.' },
  { key: 'regulator', label: 'Regulator', blurb: 'Policies applied, consent state and evidence.' },
] as const;

type AudienceKey = (typeof AUDIENCES)[number]['key'];

function TraceView({ decisionId }: { decisionId: string }) {
  const format = useFormat();
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

  // Declared beside the mutation so the button and the sentence above it read
  // the same fact. `undefined` on a trace served before this field existed is
  // treated as "cannot", which errs towards the honest half.
  const canReplay = trace?.replay?.possible === true;

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

  /**
   * Whether anything renders in the lower-left column.
   *
   * Score composition and execution timings are the only cards there, and the
   * second audience set is a subset of the first — so this one call decides it.
   *
   * Customer and Regulator show neither, and on 2026-09-16 that left eight of
   * twelve columns blank beside a 1,710px ribbon of evidence cards. The
   * measurement that found it was looking for the opposite: a right column too
   * empty at four tracks. It is the left that empties, and only for two of the
   * five.
   */
  const hasScoringColumn = show('analyst', 'business', 'engineer');

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
          // The identity line: what this is, which one, and what it came to —
          // the drafts' "Decision dec_… · when · flow · ms" rather than a mono
          // id standing alone over a row of four metric cards.
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Decision</span>
            <span className="font-mono text-body font-normal text-content-muted">{trace.id}</span>
            {trace.winner ? (
              <Badge tone="pass">{trace.winner}</Badge>
            ) : (
              <Badge tone="block">no offer</Badge>
            )}
          </span>
        }
        description={
          <span data-identity className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-label text-content-subtle">
            <span>{format.dateTime(trace.timestamp)}</span>
            <span>
              <span className="font-mono text-content">{trace.artifactId}</span> {trace.artifactVersion}
            </span>
            <span>
              <strong className={cn('tnum font-semibold', trace.totalMs > 20 ? 'text-hold' : 'text-pass')}>
                {trace.totalMs.toFixed(1)} ms
              </strong>{' '}
              of a 50 ms SLA
            </span>
            <span>
              <strong className="tnum font-semibold text-content">{trace.candidateCount}</strong> candidates{' '}
              <span>entered the flow</span>
            </span>
            <span>
              {trace.channel.replace('_', ' ')} · <span className="font-mono">{trace.placement}</span>
            </span>
          </span>
        }
        actions={
          // Beside the title rather than on a band of its own. The page spent
          // three full-width rows — breadcrumb and title, provenance, then the
          // audience row — before the cascade began; the selector is a control
          // and belongs with the other controls.
          //
          // The provenance banner keeps its own row: it has to survive a
          // screenshot of what is under it, which a control strip does not.
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
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
              title="Not built: the regulator pack needs a document renderer and a hash verification page. Export JSON carries the same evidence."
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
            </div>

            <div className="flex flex-wrap items-center justify-end gap-1">
              <span className="mr-1 text-label text-content-subtle">Explain for</span>
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
            </div>

            {/* What the selected audience shows. It followed the buttons on the
                old row and follows them here. */}
            <span className="text-label text-content-subtle">
              {AUDIENCES.find((a) => a.key === audience)?.blurb}
            </span>
          </div>
        }
      />

      {/* Between the header and the trace, so a screenshot of the cascade or
          of the score table carries it. */}
      <ProvenanceBanner provenance={trace.provenance} />

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
      <CascadePanes
        className="mb-stack"
        wide
        twelve
        rail={
          <CascadeRail
            label="Elimination funnel"
            stages={railStages}
            selected={selectedNode}
            onSelect={setSelectedNode}
            foot={
              <>
                {trace.candidateCount} entered,{' '}
                <strong className="font-semibold">
                  {trace.winner ? '1 was offered' : 'none was offered'}
                </strong>
                . Every stage is what the flow actually ran, not the policy model.
              </>
            }
          />
        }
        evidence={
          <TraceEvidence
            trace={trace}
            stage={selectedStage}
            group={selectedGroup}
            policies={policies.data?.policies ?? []}
            packageVersions={packageVersions}
            policySources={policySources}
          />
        }
      >
          {selectedStage ? (
            <Card>
              <CardHeader
                title={
                  // At title size: the selected stage is the subject of this pane,
                  // as the drafts head it, not one more card among several.
                  <span className="text-title">
                    {selectedStage.removed > 0
                      ? `${selectedStage.label} removed ${selectedStage.removed}`
                      : `${selectedStage.label} removed nothing`}
                  </span>
                }
                description={
                  selectedStage.removed > 0
                    ? 'Grouped by the rule that removed them.'
                    : selectedStage.reason || 'Every candidate carried on from this node.'
                }
                tip={
                  selectedStage.removed > 0 ? (
                    <InfoTip label="Why rules, not reason codes">
                      A reason code is shared by a whole tier; the rule is the thing somebody can go and change.
                    </InfoTip>
                  ) : undefined
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
                title={
                  <span className="text-title">
                    {`${trace.candidateCount} candidates, ${trace.winner ? 'one offered' : 'none offered'}`}
                  </span>
                }
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
              </CardBody>
            </Card>
          )}
      </CascadePanes>

      {/*
        The same twelve tracks the cascade runs on: 3 + 5 under the rail and
        the middle pane, 4 under the evidence. Until 2026-09-16 this row was
        `1.4fr 1fr`, which put its seam at a column boundary nothing above it
        shared — so the page changed rhythm halfway down, and the second half
        is the taller of the two.

        `items-start` for the same reason the Architect home's panels carry it
        (#95): a pane is as tall as what it holds. Inside the cascade above,
        equal height is correct — it is one card — and here it is not.
      */}
      <div className="grid items-start gap-y-stack lg:grid-cols-12">
        <div
          className={cn(
            'space-y-stack',
            hasScoringColumn ? 'lg:col-span-8 lg:pr-stack' : 'hidden'
          )}
        >
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
                      <tr className="border-b border-border text-label text-content-subtle">
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

        {/*
          Under the evidence column, four of twelve — and the full width when
          nothing shares the row with it, laid three across rather than stacked
          into a ribbon. `items-start` inside for the same reason it is on the
          row: a card is as tall as what it holds.
        */}
        <div
          className={cn(
            hasScoringColumn
              ? 'space-y-stack lg:col-span-4'
              : 'lg:col-span-12 lg:grid lg:grid-cols-3 lg:items-start lg:gap-stack lg:space-y-0 space-y-stack'
          )}
        >
          <Card>
            <CardHeader
              title="Determinism"
              description="Re-execute against the stored artifact version."
            />
            <CardBody>
              {/*
                Two claims, and the card says which one this decision supports.
                The chain hash above proves the record is unaltered whatever
                happens here. Replay is the stronger claim and needs the inputs,
                which the platform deliberately does not keep — so a decision a
                channel made can be proven unchanged and cannot be re-executed.
                The button used to offer it anyway and fail with a 422.
              */}
              <p className="mb-3 text-label text-content-muted">
                {canReplay
                  ? 'Proven unchanged by its chain hash, and re-executable: the platform can still produce the inputs it was made from.'
                  : 'Proven unchanged by its chain hash, and not re-executable: this decision’s inputs were never kept. The record holds a hash of them and never the values, so replaying it means handing back the input it was made with.'}
              </p>
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                onClick={() => replay.mutate()}
                disabled={replay.isPending || !canReplay}
              >
                {replay.isPending ? 'Replaying…' : canReplay ? 'Replay this decision' : 'Cannot be re-executed here'}
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
                  <dl className="mt-2 space-y-1 text-label">
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
                          <li key={d.path} className="font-mono text-label">
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
                  ['Timestamp', format.dateTime(trace.timestamp), false],
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
                <p className="mb-1 text-label text-content-subtle">
                  Chain hash
                </p>
                <code className="block break-all rounded border border-border bg-surface-sunken px-2 py-1.5 font-mono text-label text-content-muted">
                  {trace.chainHash}
                </code>
                <p className="mt-1 text-label text-content-subtle">
                  sha256 over the reproducible part, excluding timings, covering the input snapshot and
                  catalogue above. The decision ID is its first 16 characters.
                </p>
              </div>
            </CardBody>
          </Card>

          {(trace.sourceBindings?.length ?? 0) > 0 && (
            <Card>
              <CardHeader
                title="Where the data came from"
                description="Values are in the input snapshot above, not stored here."
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
                          <div className="font-mono text-label text-content-subtle">
                            at node {b.nodeId}
                          </div>
                        </div>
                        {call && (
                          <div className="shrink-0 text-right">
                            <Badge tone={call.outcome === 'ok' ? 'pass' : 'block'}>
                              {call.outcome}
                            </Badge>
                            <div className="tnum text-label text-content-subtle">
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
                <p className="mb-2 text-label text-content-subtle">
                  Consent state
                </p>
                <div className="flex flex-wrap gap-1">
                  {/* Absent is shown as absent: nobody stated it, and it was
                      enforced as withheld. The badge must not read as a no that
                      somebody gave, or as a yes. */}
                  {Object.entries(trace.consentState).map(([k, v]) => (
                    <Badge key={k} tone={v === 'granted' ? 'pass' : v === 'withheld' ? 'block' : 'hold'}>
                      {k}: {v === 'absent' ? 'absent, treated as withheld' : v}
                    </Badge>
                  ))}
                </div>

                <p className="mb-2 mt-4 text-label text-content-subtle">
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
                    <p className="mb-2 mt-4 text-label text-content-subtle">
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
