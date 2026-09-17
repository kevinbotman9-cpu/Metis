'use client';

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
} from '@/components/ui/primitives';
import { CascadeRail } from '@/components/cascade-rail';
import { CascadePanes } from '@/components/cascade-panes';
import { LoopFirstPaint, LoopInversions, LoopStageDetail } from '@/components/loop-panes';
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
 * Now, in reading order: **the loop**, then **what is waiting for a person**.
 * The loop is the same decomposition `/performance` draws, from the same model
 * (`lib/loop.ts`), on two panes rather than three — a rail of stages and, until
 * one is chosen, the whole loop: six cards, and the flow with the drop-outs
 * drawn as volume leaving.
 *
 * **It fits without scrolling**, which is what the 2026-09-17 pass was for. The
 * evidence pane, the agent-activity feed, the thesis paragraph, the page's own
 * description and four explanatory sentences came off; the value cards and the
 * per-day cards share a row. `overview.spec.ts` holds the page to fitting at
 * 1440×900, because a page that fits today and scrolls next week has lost the
 * property quietly.
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
      {/* No description and no tip. It read "Decisions, delivery and outcomes,
          under the changes proposed to them", over a tip explaining that each
          stage is a subset of the one above — both for a reader who does not
          know what the loop is, which is not this page's reader. */}
      <PageHeader title="The loop" />

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

          {/* Two panes, not three. The evidence column quoted the loop's closure
              sentence — which the rail says — and explained the screen to a
              reader who is on it; "why the rest offered nothing" moved onto the
              Offered stage, where the drop is. Decided by the product owner on
              2026-09-17. `/performance` keeps its third pane. */}
          <CascadePanes
            rail={
              <CascadeRail
                label="The loop"
                stages={loop.stages}
                selected={selected}
                onSelect={setSelected}
                // No foot. "Closed on Web only" is the sentence the product
                // owner named as repeating the rail's own stages, and the break
                // stage above it already names Email and SMS.
                dense
              />
            }
          >
            {selected ? (
              <LoopStageDetail data={report.data} loop={loop} stage={selected} />
            ) : (
              <LoopFirstPaint data={report.data} loop={loop} dense />
            )}
          </CascadePanes>
        </section>
      )}

      {/*
        What is waiting for a person, and nothing about it.

        The heading and the two sentences under it — "Agents author, people
        approve, simulation gates it", then what L2 and L3 mean — were the
        product describing itself to a marketer who is here to read the loop.
        They are what `/agentic` is for, which the card links to.

        The agent-activity feed beside it is gone (2026-09-17): it said "Nothing
        in this feed" and pointed at the audit log, on every tenant, because
        nothing writes it. What should stand there is registered as G-155.
      */}
      <section aria-label="Proposed changes" className="mb-stack">
        <Proposals />
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
