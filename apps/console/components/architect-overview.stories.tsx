import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Card, CardHeader } from '@/components/ui/primitives';
import {
  ArchitectOverview,
  ConformanceSummary,
  FlowsPanel,
  ProposedPanel,
  ReleasedPanel,
  SimulatedPanel,
} from './architect-overview';
import type {
  ArtifactSummaryDto,
  AutonomySettingDto,
  ChangeSetDto,
  ConformanceReportDto,
  RegistryEventDto,
  TaxonomyDto,
} from '@/lib/api-client';

/**
 * The panels of the decision architect's Overview — `/` for an architect.
 *
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The data has the seeded tenant's shape rather than the mockup's: two change
 * sets waiting, one simulation that failed on bias, one that never ran, one
 * release, a live flow and a draft that will not compile.
 */

const sim = (passed: boolean, populationSize: number, biasRatio: number) => ({
  ran: true,
  passed,
  populationSize,
  biasRatio,
  projectedMarginDelta: '',
  notes: '',
});

const CHANGE_SETS = [
  { id: 'cr_0042', title: 'Relax the 5G Home Ultimate bandwidth threshold to 70%', status: 'pending', requestedBy: 'agent-strategist-01', simulation: sim(true, 240000, 1.04) },
  { id: 'cr_0041', title: 'Lower arbitration context weight from 1.0 to 0.65', status: 'pending', requestedBy: 'agent-strategist-01', simulation: sim(true, 1200000, 1.01) },
  { id: 'cr_0040', title: 'Boost the line ahead of the add-on', status: 'approved', requestedBy: 'marcus.webb@telco.example', simulation: sim(true, 480000, 1.02) },
  { id: 'cr_0039', title: 'Widen the gaming affinity threshold', status: 'rejected', requestedBy: 'agent-strategist-01', simulation: sim(false, 320000, 1.38) },
  { id: 'cr_0038', title: 'Rename the entertainment category', status: 'approved', requestedBy: 'sarah.chen@telco.example', simulation: null },
] as unknown as ChangeSetDto[];

const EVENTS = [
  { seq: 3, at: '2026-08-01T09:00:00.000Z', type: 'PublishRejected', flowName: 'entertainment-cross-sell', version: '0.1.0', tenantId: 'telco-us', actor: 'marcus.webb@telco.example', summary: '' },
  { seq: 2, at: '2026-08-01T09:00:00.000Z', type: 'VersionPromoted', flowName: 'next-best-action', version: '1.0.0', environment: 'production', tenantId: 'telco-us', actor: 'marcus.webb@telco.example', summary: '' },
  { seq: 1, at: '2026-08-01T09:00:00.000Z', type: 'ArtifactPublished', flowName: 'next-best-action', version: '1.0.0', tenantId: 'telco-us', actor: 'marcus.webb@telco.example', summary: '' },
] as unknown as RegistryEventDto[];

const ARTIFACTS = [
  { id: 'next-best-action', name: 'Next Best Action', status: 'active', activeVersion: '1.0.0', compileOk: true, errorCount: 0, warningCount: 1 },
  { id: 'entertainment-cross-sell', name: 'Entertainment cross-sell (draft)', status: 'draft', activeVersion: '0.1.0', compileOk: false, errorCount: 1, warningCount: 0 },
] as unknown as ArtifactSummaryDto[];

const CONFORMANCE: ConformanceReportDto = {
  corpora: [
    { id: 'values', file: 'docs/conformance/canonical-corpus.json', cases: 67, covers: 'How a value serialises and hashes' },
    { id: 'decisions', file: 'docs/conformance/decision-corpus.json', cases: 32, covers: 'What a decision is: its winner, what each node removed, and its chain hash' },
    { id: 'service', file: 'docs/conformance/service-cases.json', cases: 60, covers: 'Real decisions sent through the HTTP service, compared by chain hash' },
  ],
  engines: [
    { engine: 'typescript', checkedBy: 'The conformance corpus matches the reference', runsIn: 'gates' },
    { engine: 'kotlin', checkedBy: 'kotlin-conformance', runsIn: 'ci' },
  ],
};

const meta: Meta = {
  title: 'Overview/ArchitectPanels',
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj;

const inCard = (title: string, window: string, body: React.ReactNode) => (
  <div className="max-w-2xl">
    <Card>
      <CardHeader title={title} description={window} />
      {body}
    </Card>
  </div>
);

export const Proposed: Story = {
  render: () => inCard('Proposed', 'Open now', <ProposedPanel changeSets={CHANGE_SETS} />),
};

/** Nothing waiting: said, not an empty list. */
export const ProposedNothingWaiting: Story = {
  render: () => inCard('Proposed', 'Open now', <ProposedPanel changeSets={CHANGE_SETS.filter((c) => c.status !== 'pending')} />),
};

/** One simulation failed on bias and one change set carried none: both said. */
export const Simulated: Story = {
  render: () =>
    inCard('Simulated', 'Every change set that ran one, waiting or decided', <SimulatedPanel changeSets={CHANGE_SETS} gateFor={() => 1.2} />),
};

/** One scope resolves no autonomy setting, so its ratio says there is no limit rather than showing none. */
export const SimulatedNoLimitResolves: Story = {
  render: () =>
    inCard(
      'Simulated',
      'Every change set that ran one, waiting or decided',
      <SimulatedPanel changeSets={CHANGE_SETS} gateFor={(cr) => (cr.id === 'cr_0041' ? null : 1.2)} />
    ),
};

/**
 * What the product shows today: nothing simulates, so no change set carries a
 * simulation. The stories above keep the table's states because the component
 * has to render them when simulation is built (ADR-018 §7) — they are the only
 * place those states exist now that the seeded change sets carry `null`.
 */
export const SimulatedNoneHasRun: Story = {
  render: () =>
    inCard(
      'Simulated',
      'Every change set that ran one, waiting or decided',
      <SimulatedPanel changeSets={CHANGE_SETS.map((c) => ({ ...c, simulation: null }))} gateFor={() => 1.2} />
    ),
};

/** While the autonomy settings load: the ratio alone. */
export const SimulatedLimitsLoading: Story = {
  render: () => inCard('Simulated', 'Every change set that ran one, waiting or decided', <SimulatedPanel changeSets={CHANGE_SETS} />),
};

export const Released: Story = {
  render: () => inCard('Released', 'Every registry event', <ReleasedPanel events={EVENTS} />),
};

export const ReleasedNothingPromoted: Story = {
  render: () => inCard('Released', 'Every registry event', <ReleasedPanel events={EVENTS.filter((e) => e.type !== 'VersionPromoted')} />),
};

/** A draft that will not compile, and so cannot be promoted. */
export const Flows: Story = {
  render: () => inCard('Flows', 'Now', <FlowsPanel artifacts={ARTIFACTS} />),
};

/**
 * The whole page, as `/` draws it for an architect: the panels in their grid,
 * at the page's density, from the same component the route renders. The cache
 * is filled rather than the API mocked, so nothing fetches.
 */
function WholePage() {
  const [client] = useState(() => {
    const c = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    // Every change set is tenant-wide here, so each ratio reads against the tenant's limit.
    const changeSets = CHANGE_SETS.map((cr) => ({ ...cr, targetScope: { level: 'tenant', targetId: null } }));
    c.setQueryData(['change-sets'], { changeSets });
    c.setQueryData(['registry-events', 'all'], { events: EVENTS });
    c.setQueryData(['artifacts'], { artifacts: ARTIFACTS });
    c.setQueryData(['conformance'], CONFORMANCE);
    c.setQueryData(['autonomy'], {
      settings: [{ id: 'aut_tenant', scope: { level: 'tenant', targetId: null }, guardrails: { biasGateThreshold: 1.2 } }] as unknown as AutonomySettingDto[],
    });
    c.setQueryData(['taxonomy'], { objectives: [], categories: [], offers: [] } as unknown as TaxonomyDto);
    return c;
  });
  return (
    <QueryClientProvider client={client}>
      <ArchitectOverview />
    </QueryClientProvider>
  );
}

export const WholePageArchitectHome: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <WholePage />,
};

/** Names what holds each engine to the corpora, and does not claim the checks passed. */
export const WhatTheEnginesAreHeldTo: Story = {
  render: () => inCard('What the engines are held to', 'As committed', <ConformanceSummary report={CONFORMANCE} />),
};
