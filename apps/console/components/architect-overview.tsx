'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageBody, PageHeader, Badge, Card, CardBody, CardHeader, ErrorState } from '@/components/ui/primitives';
import { useFormat } from '@/components/tenant-format';
import { biasGateFor } from '@/lib/bias-gate';
import {
  apiClient,
  type ArtifactSummaryDto,
  type ChangeSetDto,
  type ConformanceReportDto,
  type RegistryEventDto,
} from '@/lib/api-client';

/**
 * The decision architect's Overview: the change pipeline, as panels.
 * `docs/METIS_CONSOLE_SPEC.md` §4.5, Dashboard.
 *
 * Not a Cascade. The persona mockup drew this as a rail — proposed, simulated,
 * released, flows live, replayable — and §4.7's rule is that a rail is earned by
 * a spine: each stage a subset of the one above. These count different things —
 * two change sets, one release, two flows, three corpora — so a rail over them
 * would teach a reader to expect a narrowing that is not there. The product
 * owner withdrew the rail on 2026-09-13.
 *
 * Every panel says the window its figures cover and links to the screen that
 * owns them (§4.5: no orphan numbers). The figures are this tenant's, and it is
 * small: two pending change sets, one release, two flows. They are shown small.
 *
 * Hand-built, like the marketer's Overview: ADR-015 defers Dashboard's slot grid
 * and no renderer for it exists.
 */

const link = 'inline-flex min-h-6 items-center text-label text-accent underline-offset-2 hover:underline';

function Panel({
  title,
  window,
  href,
  linkLabel,
  wide,
  children,
}: {
  title: string;
  /** What the figures cover, said on the panel rather than assumed. */
  window: string;
  href: string;
  linkLabel: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={wide ? 'lg:col-span-12' : 'lg:col-span-6'}>
      <CardHeader
        title={title}
        description={window}
        actions={
          <Link href={href} className={link}>
            {linkLabel}
          </Link>
        }
      />
      {children}
    </Card>
  );
}

/** A panel's body before its data arrives: its real space, not a spinner (§4.5). Static — nothing animates on load. */
function PanelSkeleton() {
  return (
    <CardBody>
      <div aria-hidden className="min-h-24 rounded bg-surface-sunken" />
      <span className="sr-only">Loading</span>
    </CardBody>
  );
}

/**
 * A panel's lead: figures with short labels, the way the drafts lead a stage —
 * "2 waiting", "1 live · 1 draft" — rather than a sentence. At 600, the heaviest
 * weight the type scale allows. What qualifies the figures goes beneath them,
 * smaller, so the number is read first.
 */
function Lead({
  figures,
  note,
  flush,
}: {
  figures: { value: ReactNode; label: string }[];
  note?: ReactNode;
  /** No padding of its own, inside a body that already has it. */
  flush?: boolean;
}) {
  return (
    <div className={flush ? undefined : 'px-card pt-3'}>
      <p data-lead className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {figures.map((f, i) => (
          <span key={f.label} className="flex items-baseline gap-1.5">
            {i > 0 ? ' ' : null}
            <span className="tnum text-figure font-semibold text-content">{f.value}</span>{' '}
            <span className="text-label text-content-muted">{f.label}</span>
          </span>
        ))}
      </p>
      {note ? <p className="mt-0.5 text-label text-content-subtle">{note}</p> : null}
    </div>
  );
}

const proposedBy = (cr: ChangeSetDto) => (cr.requestedBy.startsWith('agent-') ? 'an agent' : 'a person');

/** Exported for its story; the page passes it the change sets it fetched. */
export function ProposedPanel({ changeSets }: { changeSets: ChangeSetDto[] }) {
  const pending = changeSets.filter((c) => c.status === 'pending');
  return (
    <CardBody className="p-0">
      <Lead
        figures={[{ value: pending.length, label: 'waiting' }]}
        note={pending.length === 0 ? 'Nothing is waiting for a person.' : 'for someone who can approve changes'}
      />
      {pending.length > 0 ? (
        <ul className="mt-2 divide-y divide-border border-t border-border">
          {pending.map((cr) => (
            <li key={cr.id}>
              <Link href={`/approvals/${cr.id}`} className="block px-card py-3 transition-colors hover:bg-surface-sunken">
                <span className="block text-body font-medium text-content">{cr.title}</span>
                <span className="mt-0.5 block text-label text-content-muted">
                  Proposed by {proposedBy(cr)}, <span className="font-mono">{cr.requestedBy}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </CardBody>
  );
}

/** The limit under a bias ratio: the gate it was held to, or a plain statement that none resolves. */
function GateLine({ gate }: { gate: number | null }) {
  const format = useFormat();
  return (
    <span className="block text-label text-content-subtle">
      {gate === null
        ? 'no limit resolves'
        : `limit ${format.number(gate, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
    </span>
  );
}

/**
 * `gateFor` is the bias gate that applies to a change set, or null when no
 * autonomy setting resolves for its scope (`lib/bias-gate.ts`). Absent while
 * the settings load, and the column then shows the ratio alone rather than a
 * limit it has not got.
 */
export function SimulatedPanel({
  changeSets,
  gateFor,
}: {
  changeSets: ChangeSetDto[];
  gateFor?: (cr: ChangeSetDto) => number | null;
}) {
  const format = useFormat();
  const simulated = changeSets.filter((c) => c.simulation?.ran);
  const failed = simulated.filter((c) => !c.simulation!.passed).length;
  const without = changeSets.length - simulated.length;

  return (
    <CardBody className="p-0">
      <Lead
        figures={[{ value: `${simulated.length - failed} of ${simulated.length}`, label: 'passed' }]}
        note={
          failed > 0
            ? `${failed} failed, and ${failed === 1 ? 'its change was' : 'their changes were'} not shipped`
            : undefined
        }
      />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full">
          <caption className="sr-only">Simulations of change sets</caption>
          <thead>
            <tr className="border-y border-border">
              <th className="px-cell py-2 text-left text-label font-semibold text-content-subtle">Change set</th>
              <th className="px-cell py-2 text-right text-label font-semibold text-content-subtle">Population</th>
              <th className="whitespace-nowrap px-cell py-2 text-right text-label font-semibold text-content-subtle">Bias ratio</th>
              <th className="px-cell py-2 text-right text-label font-semibold text-content-subtle">Result</th>
            </tr>
          </thead>
          <tbody>
            {simulated.map((cr) => (
              <tr key={cr.id} className="border-b border-border last:border-0">
                <td className="px-cell py-cell-y">
                  <Link href={`/approvals/${cr.id}`} className="text-body text-content hover:underline">
                    {cr.title}
                  </Link>
                  <span className="block text-label text-content-subtle">{cr.status}</span>
                </td>
                <td className="tnum px-cell py-cell-y text-right text-body text-content-muted">
                  {format.number(cr.simulation!.populationSize)}
                </td>
                <td className="tnum px-cell py-cell-y text-right text-body text-content-muted">
                  {format.number(cr.simulation!.biasRatio, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {gateFor ? <GateLine gate={gateFor(cr)} /> : null}
                </td>
                <td className="px-cell py-cell-y text-right">
                  <Badge tone={cr.simulation!.passed ? 'pass' : 'block'}>{cr.simulation!.passed ? 'passed' : 'failed'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {without > 0 ? (
        <p className="border-t border-border px-card py-2 text-label text-content-subtle">
          {without} {without === 1 ? 'change set carried' : 'change sets carried'} no simulation.
        </p>
      ) : null}
    </CardBody>
  );
}

const EVENT_LABEL: Record<RegistryEventDto['type'], string> = {
  ArtifactPublished: 'Published',
  VersionPromoted: 'Promoted',
  VersionRolledBack: 'Rolled back',
  PublishRejected: 'Refused at publish',
};

const EVENT_TONE: Record<RegistryEventDto['type'], 'pass' | 'accent' | 'hold' | 'block'> = {
  ArtifactPublished: 'pass',
  VersionPromoted: 'accent',
  VersionRolledBack: 'hold',
  PublishRejected: 'block',
};

export function ReleasedPanel({ events }: { events: RegistryEventDto[] }) {
  const format = useFormat();
  const newest = [...events].sort((a, b) => b.seq - a.seq);
  const lastPromotion = newest.find((e) => e.type === 'VersionPromoted');
  const promoted = events.filter((e) => e.type === 'VersionPromoted').length;

  return (
    <CardBody className="p-0">
      <Lead
        figures={[{ value: promoted, label: 'promoted' }]}
        note={
          lastPromotion ? (
            <>
              <span className="font-mono">{lastPromotion.flowName}</span> {lastPromotion.version} in{' '}
              {lastPromotion.environment ?? 'an environment'} since {format.date(lastPromotion.at)}
            </>
          ) : (
            'Nothing has been promoted.'
          )
        }
      />
      {newest.length > 0 ? (
        <ul className="mt-2 divide-y divide-border border-t border-border">
          {newest.slice(0, 6).map((e) => (
            <li key={e.seq} className="flex items-start justify-between gap-3 px-card py-2.5">
              <span className="min-w-0">
                <span className="block text-body text-content">
                  <span className="font-mono">{e.flowName}</span> {e.version}
                  {e.environment ? ` to ${e.environment}` : ''}
                </span>
                <span className="block text-label text-content-subtle">{format.date(e.at)}</span>
              </span>
              <Badge tone={EVENT_TONE[e.type]}>{EVENT_LABEL[e.type]}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </CardBody>
  );
}

function compileState(a: ArtifactSummaryDto): { text: string; tone: 'pass' | 'hold' | 'block' | 'neutral' } {
  if (a.compileOk === false) {
    const n = a.errorCount ?? 0;
    return { text: `does not compile: ${n} ${n === 1 ? 'error' : 'errors'}`, tone: 'block' };
  }
  if (a.compileOk === true) {
    const n = a.warningCount ?? 0;
    return n > 0
      ? { text: `compiles, ${n} ${n === 1 ? 'warning' : 'warnings'}`, tone: 'hold' }
      : { text: 'compiles', tone: 'pass' };
  }
  return { text: 'not compiled', tone: 'neutral' };
}

export function FlowsPanel({ artifacts }: { artifacts: ArtifactSummaryDto[] }) {
  const live = artifacts.filter((a) => a.status === 'active').length;
  const drafts = artifacts.filter((a) => a.status === 'draft').length;
  const broken = artifacts.filter((a) => a.compileOk === false).length;

  return (
    <CardBody className="p-0">
      <Lead
        figures={[
          { value: live, label: 'live' },
          { value: drafts, label: drafts === 1 ? 'draft' : 'drafts' },
        ]}
        note={broken > 0 ? `${broken} will not compile, so cannot be promoted` : undefined}
      />
      <ul className="mt-2 divide-y divide-border border-t border-border">
        {artifacts.map((a) => {
          const state = compileState(a);
          return (
            <li key={a.id}>
              <Link
                href={`/decision-flows/${a.id}`}
                className="flex items-start justify-between gap-3 px-card py-2.5 transition-colors hover:bg-surface-sunken"
              >
                <span className="min-w-0">
                  <span className="block text-body text-content">{a.name}</span>
                  <span className="block font-mono text-label text-content-subtle">
                    {a.id} {a.activeVersion}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={a.status === 'active' ? 'pass' : 'neutral'}>{a.status}</Badge>
                  <span className="text-label text-content-muted">{state.text}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </CardBody>
  );
}

function ConformancePanel() {
  const report = useQuery({ queryKey: ['conformance'], queryFn: () => apiClient.getConformance() });
  if (report.isLoading) return <PanelSkeleton />;
  if (report.isError || !report.data) {
    return <ErrorState description="Could not read the conformance corpora." onRetry={() => void report.refetch()} />;
  }
  return <ConformanceSummary report={report.data} />;
}

/** What the engines are held to, from a report already fetched. Exported for its story. */
export function ConformanceSummary({ report }: { report: ConformanceReportDto }) {
  const format = useFormat();
  const total = report.corpora.reduce((sum, c) => sum + c.cases, 0);

  return (
    <CardBody>
      <Lead
        flush
        figures={[{ value: format.number(total), label: 'conformance cases' }]}
        note="Each pins what a chain hash means, whichever engine produced it."
      />
      <div className="mt-3 grid gap-stack lg:grid-cols-2">
        <dl className="flex flex-col text-label">
          {report.corpora.map((c) => (
            <div key={c.id} className="flex items-baseline justify-between gap-3 border-t border-border py-2">
              <dt className="min-w-0 text-content-muted">
                {c.covers}
                <span className="block font-mono text-content-subtle">{c.file}</span>
              </dt>
              <dd className="tnum shrink-0 text-content">{format.number(c.cases)}</dd>
            </div>
          ))}
        </dl>
        <dl className="flex flex-col text-label">
          {report.engines.map((e) => (
            <div key={e.engine} className="flex items-baseline justify-between gap-3 border-t border-border py-2">
              <dt className="text-content-muted">{e.engine === 'typescript' ? 'TypeScript engine' : 'Kotlin engine'}</dt>
              <dd className="text-right text-content">
                <span className="font-mono">{e.checkedBy}</span>
                <span className="block text-content-subtle">{e.runsIn === 'gates' ? 'on every pull request' : 'in CI'}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-3 text-label text-content-subtle">
        Those checks run where they are named. This screen cannot run them, so it shows what they are, not what they found.
      </p>
    </CardBody>
  );
}

export function ArchitectOverview() {
  const changeSets = useQuery({ queryKey: ['change-sets'], queryFn: () => apiClient.listChangeSets() });
  const events = useQuery({ queryKey: ['registry-events', 'all'], queryFn: () => apiClient.listRegistryEvents({ limit: 60 }) });
  const artifacts = useQuery({ queryKey: ['artifacts'], queryFn: () => apiClient.listArtifacts() });
  // A simulation carries its bias ratio and not the limit it was held to. The
  // limit is on the autonomy setting for the change set's scope, and the
  // catalogue places that scope in the hierarchy.
  const autonomy = useQuery({ queryKey: ['autonomy'], queryFn: () => apiClient.listAutonomySettings() });
  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: () => apiClient.getTaxonomy() });
  const settings = autonomy.data?.settings;
  const catalogue = taxonomy.data;
  const gateFor =
    settings && catalogue ? (cr: ChangeSetDto) => biasGateFor(cr.targetScope, settings, catalogue) : undefined;

  const failed = (q: { isError: boolean; refetch: () => unknown }, what: string) =>
    q.isError ? <ErrorState description={`Could not load ${what}.`} onRetry={() => void q.refetch()} /> : null;

  return (
    <PageBody>
      <PageHeader title="The change pipeline" description="From proposal to production, and what the engines are held to." />

      {/* A panel is as tall as what it holds. Stretched to its row, two
          proposals sat over the empty height of the simulation table beside them. */}
      <div className="grid items-start gap-stack lg:grid-cols-12">
        <Panel title="Proposed" window="Change sets waiting for someone to approve or reject them" href="/approvals" linkLabel="Approvals">
          {failed(changeSets, 'the change sets') ??
            (changeSets.data ? <ProposedPanel changeSets={changeSets.data.changeSets} /> : <PanelSkeleton />)}
        </Panel>

        {/* Every simulation, not only the open ones: the two waiting in Proposed
            appear here too, with their status under the title. */}
        <Panel title="Simulated" window="Every change set that ran one, waiting or decided" href="/simulations" linkLabel="Simulations">
          {failed(changeSets, 'the change sets') ??
            (changeSets.data ? <SimulatedPanel changeSets={changeSets.data.changeSets} gateFor={gateFor} /> : <PanelSkeleton />)}
        </Panel>

        <Panel title="Released" window="Every publish, promotion and rollback in the registry" href="/decision-flows" linkLabel="Decision flows">
          {failed(events, 'the registry events') ??
            (events.data ? <ReleasedPanel events={events.data.events} /> : <PanelSkeleton />)}
        </Panel>

        <Panel title="Flows" window="Every decision flow, live or draft, and whether it compiles" href="/decision-flows" linkLabel="Decision flows">
          {failed(artifacts, 'the flows') ??
            (artifacts.data ? <FlowsPanel artifacts={artifacts.data.artifacts} /> : <PanelSkeleton />)}
        </Panel>

        <Panel title="What the engines are held to" window="The corpora each engine is checked against, as committed" href="/decisions" linkLabel="Replay a decision" wide>
          <ConformancePanel />
        </Panel>
      </div>
    </PageBody>
  );
}
