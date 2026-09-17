'use client';

import { InfoTip } from '@/components/ui/tooltip';
import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  Badge,
  ErrorState,
  LoadingState,
  AutonomyBadge,
} from '@/components/ui/primitives';
import { CascadeRail } from '@/components/cascade-rail';
import { CascadePanes } from '@/components/cascade-panes';
import {
  LoopFirstPaint,
  LoopInversions,
  LoopRailFoot,
  LoopStageDetail,
  LoopStageEvidence,
} from '@/components/loop-panes';
import { apiClient } from '@/lib/api-client';
import { buildLoop } from '@/lib/loop';
import { useFormat } from '@/components/tenant-format';
import { useAuth } from '@/components/auth-provider';
import { ArchitectOverview } from '@/components/architect-overview';
import { EmptyLedgerNote } from '@/components/no-decisions-yet';
import { useOverviewPersona } from '@/lib/persona';

/**
 * Overview — the loop, as a Cascade. `docs/METIS_CONSOLE_SPEC.md` §4.7.
 *
 * For the marketer. Since 2026-09-13 the Overview is a landing page per persona:
 * a decision architect lands on the change pipeline instead
 * (`components/architect-overview.tsx`), and an account that can see both
 * chooses with the switch in the chrome (`lib/persona.ts`).
 *
 * Until 2026-09-13 this was a greeting over four doughnuts — decisions,
 * outcomes, compilation, governance — with the agent panels beneath them. The
 * doughnuts counted things without saying how one led to the next, and the
 * panels that carry the product's thesis sat below all four of them.
 *
 * Now, in reading order:
 *
 * 1. **Agents author, people approve, simulation gates it.** The proposals
 *    waiting for a person and what the agents did, first, because that is what
 *    this platform is for.
 * 2. **The loop.** The same decomposition `/performance` draws, from the same
 *    model (`lib/loop.ts`): a rail of stages, the selected stage in the middle,
 *    evidence on the right. Before a stage is chosen the middle holds the whole
 *    loop — realised value against the expected ceiling, the flow with the
 *    drop-outs drawn as volume leaving, and three trends.
 *
 * The tenant is one flow, five offers and three channels, so most figures are
 * small, and they are shown small. Nothing is added to fill the space.
 *
 * Hand-built on the shared loop components rather than declared through a
 * layout manifest: ADR-015 accepts Cascade as a pattern but no Cascade renderer
 * exists yet, and `/performance` is built the same way.
 */

function Proposals() {
  const changeSets = useQuery({ queryKey: ['change-sets'], queryFn: () => apiClient.listChangeSets() });
  const all = changeSets.data?.changeSets ?? [];
  const pending = all.filter((c) => c.status === 'pending');
  const approved = all.filter((c) => c.status === 'approved').length;
  const rejected = all.filter((c) => c.status === 'rejected').length;

  return (
    <Card>
      <CardHeader
        title="Proposed changes"
        description="Waiting for approval. Each carries a diff and a simulation."
        actions={
          <Link href="/approvals" className="text-label text-accent hover:underline">
            All change sets →
          </Link>
        }
      />
      <CardBody className="p-0">
        {changeSets.isLoading ? (
          <LoadingState />
        ) : changeSets.isError ? (
          <ErrorState description="Could not load the change sets." onRetry={() => void changeSets.refetch()} />
        ) : pending.length === 0 ? (
          <p className="px-card py-4 text-body text-content-muted">
            Nothing is waiting for a person. {approved} approved and {rejected} rejected before now.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {pending.map((cr) => (
                <li key={cr.id}>
                  <Link
                    href={`/approvals/${cr.id}`}
                    className="block px-card py-3 transition-colors hover:bg-surface-sunken"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body font-medium text-content">{cr.title}</p>
                        <p className="mt-0.5 text-label text-content-muted">
                          {cr.requestedBy.startsWith('agent-') ? 'Proposed by an agent' : 'Proposed by a person'} ·{' '}
                          <span className="font-mono">{cr.requestedBy}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone="hold">waiting</Badge>
                        {cr.simulation ? (
                          <Badge tone={cr.simulation.passed ? 'pass' : 'block'}>
                            simulation {cr.simulation.passed ? 'passed' : 'failed'}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">no simulation</Badge>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="border-t border-border px-card py-2 text-label text-content-subtle">
              {approved} approved and {rejected} rejected before these.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

const OUTCOME_TONE: Record<string, 'pass' | 'block' | 'hold' | 'info' | 'neutral'> = {
  auto_applied: 'pass',
  proposed: 'info',
  suggested: 'neutral',
  blocked: 'block',
  reverted: 'hold',
};

function Activity() {
  const activity = useQuery({
    queryKey: ['agent-activity', 'overview'],
    queryFn: () => apiClient.listAgentActivity({ limit: 20 }),
  });
  const entries = activity.data?.activity ?? [];

  return (
    <Card>
      <CardHeader
        title="Agent activity"
        actions={
          <Link href="/agentic" className="text-label text-accent hover:underline">
            Autonomy and guardrails →
          </Link>
        }
      />
      <CardBody className="p-0">
        {activity.isLoading ? (
          <LoadingState />
        ) : activity.isError ? (
          <ErrorState description="Could not load agent activity." onRetry={() => void activity.refetch()} />
        ) : entries.length === 0 ? (
          <div className="px-card py-4">
            <p className="text-body text-content">Nothing in this feed.</p>
            <p className="mt-1 text-label text-content-muted">
              The audit log records agent actions this feed doesn&apos;t.
            </p>
            <Link href="/audit" className="mt-2 inline-block text-label text-accent hover:underline">
              Open the audit log →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.slice(0, 6).map((a) => (
              <li key={a.id} className="px-card py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <AutonomyBadge level={a.level} />
                      <span className="font-mono text-label text-content-subtle">{a.agentId}</span>
                    </div>
                    <p className="mt-1 text-body text-content-muted">{a.summary}</p>
                    {a.guardrailBreached ? (
                      <p className="mt-1 rounded border border-block/30 bg-block-subtle px-2 py-1 text-label text-block">
                        {a.guardrailBreached}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={OUTCOME_TONE[a.outcome] ?? 'neutral'}>{a.outcome.replace('_', ' ')}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function OverviewView() {
  const format = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // The open stage lives in the URL, so a stage can be sent to someone.
  const selected = params.get('stage');
  const setSelected = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('stage', id);
    else next.delete('stage');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // The whole tenant: the same query key `/performance` uses unfiltered, so the
  // two screens share one fetch and cannot disagree about a figure.
  const report = useQuery({
    queryKey: ['performance', '', ''],
    queryFn: () => apiClient.getPerformance({}),
  });
  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: () => apiClient.getTaxonomy() });

  const marginByKey = useMemo(
    () => new Map((taxonomy.data?.offers ?? []).map((o) => [o.key, o.financials.expectedMargin.amount])),
    [taxonomy.data]
  );
  const loop = useMemo(
    () => (report.data ? buildLoop(report.data, marginByKey, format) : null),
    [report.data, marginByKey, format]
  );

  return (
    <PageBody>
      <PageHeader
        title="The loop"
        description={
          <>
            Decisions, delivery and outcomes, under the changes proposed to them.{' '}
            <InfoTip label="About the stages">
              Each stage counts distinct decisions and is a subset of the one above: an offer cannot be seen that
              was never deliverable, and a decision counts once however many times a channel reports it.
            </InfoTip>
          </>
        }
      />

      {report.isLoading ? (
        <LoadingState label="Joining outcomes to decisions" />
      ) : report.isError || !report.data || !loop ? (
        <ErrorState description="Could not build the loop." onRetry={() => void report.refetch()} />
      ) : (
        // The loop is drawn whether or not anything has been decided: data can
        // be zero, structure cannot vanish. Unfiltered, so an empty report here
        // is always a new tenant, never a narrow window.
        <section aria-label="The loop">
          {report.data.decisions === 0 ? <EmptyLedgerNote reason="new-tenant" /> : null}
          <LoopInversions loop={loop} />

          <CascadePanes
            rail={
              <CascadeRail
                label="The loop"
                stages={loop.stages}
                selected={selected}
                onSelect={setSelected}
                foot={<LoopRailFoot loop={loop} />}
              />
            }
            evidence={<LoopStageEvidence data={report.data} loop={loop} stage={selected} />}
          >
            {selected ? (
              <LoopStageDetail data={report.data} loop={loop} stage={selected} />
            ) : (
              <LoopFirstPaint data={report.data} loop={loop} />
            )}
          </CascadePanes>
        </section>
      )}

      <section aria-labelledby="thesis" className="mb-stack">
        <h2 id="thesis" className="mb-1 text-label font-semibold text-content-subtle">
          Agents author, people approve, simulation gates it
        </h2>
        <p className="mb-3 max-w-3xl text-label text-content-muted">
          L2: nothing publishes until someone with <code className="font-mono">approve:changes</code> approves
          it. L3: changes inside the scope&apos;s guardrails publish immediately, roll back on a breach, and are
          reviewed afterwards.
        </p>
        <div className="grid gap-stack lg:grid-cols-2">
          <Proposals />
          <Activity />
        </div>
      </section>
    </PageBody>
  );
}

/** The persona decides the page; the switch in the chrome and this read the same stored choice. */
function Overview() {
  const { user } = useAuth();
  const { persona } = useOverviewPersona(user);
  return persona === 'architect' ? <ArchitectOverview /> : <OverviewView />;
}

export default function HomePage() {
  return (
    <RequireAuth>
      <Overview />
    </RequireAuth>
  );
}
