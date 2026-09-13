'use client';

import { Badge, Metric } from '@/components/ui/primitives';
import type { ChangeSetDto } from '@/lib/api-client';
import { useFormat } from '@/components/tenant-format';
import { cn } from '@/lib/cn';
import type { PanelProps } from '../panel';

/**
 * `change-sets.diff` — exactly what approving a change set changes.
 *
 * The before-and-after table first, because it is the thing being approved; the
 * simulation second, because it is the evidence for approving it. A change set
 * with no simulation says so rather than showing an empty card, since "not run"
 * is itself something an approver should weigh.
 */
export function ChangeSetDiff({ record }: PanelProps) {
  const format = useFormat();
  if (!record) return null;
  const cr = record as unknown as ChangeSetDto;
  const sim = cr.simulation;

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Proposed diff">
        <p className="mb-2 text-label text-content-subtle">
          Applies to <Badge tone="outline">{cr.targetScope.level}</Badge>
          {cr.targetScope.targetId ? <span className="ml-1 font-mono">{cr.targetScope.targetId}</span> : null}
        </p>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border text-label text-content-subtle">
                <th className="px-cell py-2 text-left font-semibold">Field</th>
                <th className="px-cell py-2 text-left font-semibold">Before</th>
                <th className="px-cell py-2 text-left font-semibold">After</th>
              </tr>
            </thead>
            <tbody>
              {cr.diff.map((d) => (
                <tr key={d.field} className="border-b border-border/60 last:border-b-0">
                  <td className="px-cell py-cell-y font-mono text-label">{d.field}</td>
                  <td className="px-cell py-cell-y">
                    <code className="rounded-sm bg-block-subtle px-1.5 py-0.5 font-mono text-label text-block">{d.before}</code>
                  </td>
                  <td className="px-cell py-cell-y">
                    <code className="rounded-sm bg-pass-subtle px-1.5 py-0.5 font-mono text-label text-pass">{d.after}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Simulation">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-label font-semibold text-content-subtle">Simulation</h3>
          {sim ? <Badge tone={sim.passed ? 'pass' : 'block'}>{sim.passed ? 'passed' : 'failed'}</Badge> : null}
        </div>
        {sim ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Metric label="Population" value={format.number(sim.populationSize)} sub="customers replayed" />
              <Metric
                label="Margin impact"
                value={sim.projectedMarginDelta}
                tone={sim.projectedMarginDelta.trim().startsWith('-') ? 'block' : 'pass'}
              />
              <Metric
                label="Bias ratio"
                value={sim.biasRatio.toFixed(2)}
                tone={sim.biasRatio > 1.2 ? 'block' : 'pass'}
                sub="gate 1.20"
              />
            </div>
            <p
              className={cn(
                'mt-3 rounded border px-3 py-2 text-body',
                sim.passed ? 'border-border bg-surface-sunken text-content-muted' : 'border-block/40 bg-block-subtle text-block'
              )}
            >
              {sim.notes}
            </p>
          </>
        ) : (
          <p className="text-body text-content-muted">No simulation was run for this change set.</p>
        )}
      </section>
    </div>
  );
}
