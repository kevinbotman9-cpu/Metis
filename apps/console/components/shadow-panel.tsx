'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import { Card, CardHeader, CardBody, Badge, Metric, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';
import type { ShadowReport } from '@metis/client';

/**
 * A version running beside the active one, deciding nothing.
 *
 * This is the surface a migration is argued from, so it is built to resist the
 * two ways that argument goes wrong:
 *
 *   - **A rate with nothing behind it.** "100% agreement" over zero compared
 *     decisions is the number somebody in a hurry reads as permission to cut
 *     over. The count is given equal billing to the rate, and a report with
 *     nothing compared says so instead of showing a percentage.
 *   - **A single agree/disagree bit.** Two versions can pick the same offer for
 *     different reasons, and a migration that changes *why* without changing
 *     *what* is exactly what a regulator asks about. Every divergence names
 *     which of the three questions failed.
 *
 * The shadow's own latency is shown rather than folded away. It runs off the
 * request path so it never enters the active budget, but it is not free, and a
 * panel that omitted the number would invite the assumption that it was.
 */

/** Percentages are the honest precision here; a rate quoted finer is theatre. */
const pct = (n: number) => `${Math.round(n * 100)}%`;

const KIND_LABEL: Record<ShadowReport['topDivergences'][number]['kind'], string> = {
  winner: 'Different offer',
  ranking: 'Different order',
  reasons: 'Different reason',
};

/**
 * The report on its own, without the queries.
 *
 * Split out so every state can be seen in Storybook — including the ones that
 * are awkward to reach through the API, like a shadow configured but not yet
 * exercised.
 */
export function ShadowSummary({ report }: { report: ShadowReport }) {
  if (!report.shadowVersion) {
    return (
      <EmptyState
        title="Nothing shadowing"
        description="Start a shadow to run a second version beside the active one. It decides nothing — the active version's answer is always what is returned — and what it would have decided is compared and recorded."
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-body text-content-muted">
        <span className="font-mono text-content">{report.shadowVersion}</span> is shadowing{' '}
        <span className="font-mono text-content">{report.activeVersion ?? 'nothing'}</span>. Its
        output has never reached a customer.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Decisions compared"
          value={report.compared}
          sub={report.compared === 0 ? 'nothing to judge yet' : `${report.agreed} agreed`}
        />
        <Metric
          label="Agreement"
          // A rate over zero comparisons is not 0% agreement, it is no
          // measurement. Showing "0%" would read as total disagreement.
          value={report.compared === 0 ? '—' : pct(report.agreementRate)}
          sub={report.compared === 0 ? 'no decisions compared' : 'winner, order and reasons'}
          tone={report.compared === 0 ? 'neutral' : report.agreementRate === 1 ? 'pass' : 'hold'}
        />
        <Metric
          label="Shadow cost"
          value={`${report.shadowMsP95.toFixed(1)} ms`}
          sub={`p95 · p50 ${report.shadowMsP50.toFixed(1)} ms · off the request path`}
        />
      </div>

      <div>
        <p className="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-content-subtle">
          Top divergences
        </p>
        {report.topDivergences.length === 0 ? (
          <p className="text-label text-content-muted">
            {report.compared === 0
              ? 'No decisions have been compared yet.'
              : 'The two versions agreed on every decision compared so far.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {report.topDivergences.map((d) => (
              <li
                key={`${d.kind}:${d.summary}`}
                className="flex items-start justify-between gap-3 rounded border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <Badge tone={d.kind === 'winner' ? 'block' : 'hold'}>{KIND_LABEL[d.kind]}</Badge>
                  <p className="mt-1 break-words font-mono text-[0.6875rem] text-content-muted">
                    {d.summary}
                  </p>
                </div>
                <span className="tnum shrink-0 text-body tabular-nums text-content">
                  ×{d.count}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ShadowPanel({ flowName }: { flowName: string }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>('');

  // Starting a shadow is the step before a cutover, so it takes the same
  // authority as one. Authoring a version does not carry it.
  const canPromote = hasPermission('promote:flows');

  const report = useQuery({
    queryKey: ['shadow-report', flowName],
    queryFn: () => apiClient.getShadowReport(flowName),
    retry: false,
  });

  const entry = useQuery({
    queryKey: ['registry', flowName],
    queryFn: () => apiClient.getRegistryEntry(flowName),
    retry: false,
  });

  const setShadow = useMutation({
    mutationFn: (version: string | null) => apiClient.setShadow(flowName, version, 'production'),
    onMutate: () => setProblem(null),
    onError: (e) => setProblem(e instanceof ApiError ? e.message : String(e)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shadow-report', flowName] });
      queryClient.invalidateQueries({ queryKey: ['registry', flowName] });
      queryClient.invalidateQueries({ queryKey: ['registry-events', flowName] });
    },
  });

  if (report.error instanceof ApiError && report.error.status === 404) return null;

  const active = entry.data?.environments.find((e) => e.environment === 'production');
  // A version cannot shadow itself: it would report perfect agreement and mean
  // nothing. The registry refuses it; the picker does not offer it.
  const candidates = (entry.data?.versions ?? [])
    .map((v) => v.version)
    .filter((v) => v !== active?.activeVersion);

  const shadowing = Boolean(report.data?.shadowVersion);

  return (
    <Card>
      <CardHeader
        title="Shadow"
        description="A second version runs beside the active one and decides nothing. Comparing what it would have chosen is how a migration is evidenced rather than asserted."
      />
      <CardBody className="space-y-4">
        {problem && (
          <p className="rounded border border-block/40 bg-block-subtle px-3 py-2 text-label text-block">
            {problem}
          </p>
        )}

        {report.data ? (
          <ShadowSummary report={report.data} />
        ) : (
          <p className="text-label text-content-muted">Loading the shadow report…</p>
        )}

        {canPromote && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {shadowing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShadow.mutate(null)}
                disabled={setShadow.isPending}
              >
                {setShadow.isPending ? 'Stopping…' : 'Stop shadowing'}
              </Button>
            ) : (
              <>
                <label htmlFor="shadow-version" className="text-label text-content-muted">
                  Shadow version
                </label>
                <select
                  id="shadow-version"
                  className="rounded border border-border bg-surface px-2 py-1 text-body text-content"
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                >
                  <option value="">Choose a version…</option>
                  {candidates.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShadow.mutate(choice)}
                  disabled={!choice || setShadow.isPending}
                >
                  {setShadow.isPending ? 'Starting…' : 'Start shadowing'}
                </Button>
              </>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
