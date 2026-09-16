'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
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
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { useFormat } from '@/components/tenant-format';

function SimulationsView() {
  const format = useFormat();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['change-sets'],
    queryFn: () => apiClient.listChangeSets(),
  });

  const withSim = (data?.changeSets ?? []).filter((c) => c.simulation);
  const passed = withSim.filter((c) => c.simulation!.passed).length;
  const failed = withSim.length - passed;

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
        title="Simulations"
        description="A bias gate is meant to block a change regardless of its commercial upside. Nothing simulates yet, so nothing is gated."
      />

      {/*
        Three counts, not four. The fourth was "Bias gate 1.20", a string
        literal in this file presented as the tenant's limit — the same defect
        as the authored figures removed on 2026-09-16, on the same screen. The
        Architect home resolves the gate that applies to a change set through
        `biasGateFor` from the autonomy settings, and this screen resolved
        nothing. It is not resolved properly here either: a limit displayed
        beside nothing to compare against it is a number with no purpose. It
        comes back with the simulation that reads against it.
      */}
      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric label="Simulations run" value={withSim.length} />
        <Metric label="Passed" value={passed} tone="pass" />
        <Metric label="Failed" value={failed} tone={failed > 0 ? 'block' : 'neutral'} />
      </div>

      {/* Honest scope note — ad-hoc simulation is specified, not built. */}
      <Card className="mb-stack border-hold/40">
        <CardBody>
          <div className="flex flex-wrap items-start gap-3">
            <Badge tone="hold">Not built yet</Badge>
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-content">
                Simulation is specified and not implemented
              </p>
              <p className="mt-1 text-body text-content-muted">
                Nothing simulates: not on demand, and not for a change set. Until 2026-09-16 the change sets below
                carried a population, a margin impact and a bias ratio, every one of them written by hand into the
                seeded data. A bias ratio compares outcomes across protected groups and no protected attribute exists
                here yet, so the figures were removed rather than labelled.
              </p>
              <p className="mt-1.5 text-label text-content-subtle">
                Tracked in docs/gaps.md.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Simulation results"
          description="From change sets, newest first."
        />
        <CardBody className="p-0">
          {isLoading ? (
            <LoadingState />
          ) : withSim.length === 0 ? (
            <p className="px-card py-8 text-center text-body text-content-muted">
              No simulations have been run.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {withSim.map((cr) => {
                const sim = cr.simulation!;
                return (
                  <li key={cr.id} className="px-card py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/approvals/${cr.id}`}
                          className="text-body font-medium text-accent hover:underline"
                        >
                          {cr.title}
                        </Link>
                        <p className="mt-0.5 font-mono text-label text-content-subtle">
                          {cr.id} · {cr.changeType.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <Badge tone={sim.passed ? 'pass' : 'block'}>
                        {sim.passed ? 'passed' : 'failed'}
                      </Badge>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-3">
                      <div>
                        <p className="text-label text-content-subtle">
                          Population
                        </p>
                        <p className="tnum text-body font-medium">
                          {format.number(sim.populationSize)}
                        </p>
                      </div>
                      <div>
                        <p className="text-label text-content-subtle">
                          Margin impact
                        </p>
                        <p
                          className={cn(
                            'text-body font-medium',
                            sim.projectedMarginDelta.trim().startsWith('-')
                              ? 'text-block'
                              : 'text-pass'
                          )}
                        >
                          {sim.projectedMarginDelta}
                        </p>
                      </div>
                      <div>
                        <p className="text-label text-content-subtle">
                          Bias ratio
                        </p>
                        <p
                          className={cn(
                            'tnum text-body font-medium',
                            sim.biasRatio > 1.2 ? 'text-block' : 'text-pass'
                          )}
                        >
                          {sim.biasRatio.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <p
                      className={cn(
                        'mt-2 rounded border px-3 py-1.5 text-label',
                        sim.passed
                          ? 'border-border bg-surface-sunken text-content-muted'
                          : 'border-block/40 bg-block-subtle text-block'
                      )}
                    >
                      {sim.notes}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </PageBody>
  );
}

export default function SimulationsPage() {
  return (
    <RequireAuth>
      <SimulationsView />
    </RequireAuth>
  );
}
