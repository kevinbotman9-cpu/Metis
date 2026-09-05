'use client';

import { Badge, Card, CardHeader, CardBody } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import type { CompileResultDto, DiagnosticDto } from '@/lib/api-client';

/**
 * The compiler's verdict, rendered for the person who has to act on it.
 *
 * Each diagnostic shows what is wrong and what to do about it. The remedy is
 * not decoration: a compliance officer reading "ARBITRATION_MISSING_SCORE"
 * needs to be told to add a score node or set the weight to zero, not to go
 * and read the compiler source.
 */

function DiagnosticRow({ d }: { d: DiagnosticDto }) {
  const isError = d.severity === 'error';
  return (
    <li
      className={cn(
        'rounded border px-3 py-2',
        isError ? 'border-block/40 bg-block-subtle' : 'border-hold/40 bg-hold-subtle'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={isError ? 'block' : 'hold'}>{d.severity}</Badge>
        <code className="font-mono text-[0.6875rem] text-content-muted">{d.code}</code>
        {d.at ? (
          <code className="font-mono text-[0.6875rem] text-content-subtle">at {d.at}</code>
        ) : null}
      </div>
      <p className="mt-1.5 text-body text-content">{d.message}</p>
      {d.remedy ? (
        <p className="mt-1 text-label text-content-muted">
          <span className="font-medium">Fix:</span> {d.remedy}
        </p>
      ) : null}
    </li>
  );
}

export function CompileReport({ compilation }: { compilation: CompileResultDto | null }) {
  if (!compilation) {
    return (
      <Card>
        <CardHeader title="Compilation" />
        <CardBody>
          <p className="text-body text-content-muted">
            This flow has not been compiled.
          </p>
        </CardBody>
      </Card>
    );
  }

  const errors = compilation.diagnostics.filter((d) => d.severity === 'error');
  const warnings = compilation.diagnostics.filter((d) => d.severity === 'warning');
  const cost = compilation.artifact?.costManifest;

  return (
    <Card className={cn(compilation.ok ? 'border-border' : 'border-block/50')}>
      <CardHeader
        title="Compilation"
        description={
          compilation.ok
            ? 'Validated against the catalogue. Safe to publish.'
            : 'Blocked. These errors would produce wrong or undeliverable decisions.'
        }
        actions={
          <Badge tone={compilation.ok ? 'pass' : 'block'}>
            {compilation.ok ? 'passing' : `${errors.length} error${errors.length === 1 ? '' : 's'}`}
          </Badge>
        }
      />
      <CardBody className="space-y-4">
        {compilation.diagnostics.length === 0 ? (
          <p className="text-body text-content-muted">
            No errors and no warnings.
          </p>
        ) : (
          <ul className="space-y-2">
            {compilation.diagnostics.map((d, i) => (
              <DiagnosticRow key={`${d.code}-${d.at ?? i}`} d={d} />
            ))}
          </ul>
        )}

        {warnings.length > 0 && compilation.ok ? (
          <p className="text-label text-content-muted">
            Warnings do not block publishing, but each one describes something that will not
            behave the way the flow reads.
          </p>
        ) : null}

        {cost ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-3 text-label lg:grid-cols-4">
            <div className="flex justify-between lg:block">
              <dt className="text-content-subtle">Nodes</dt>
              <dd className="tnum font-medium">{cost.nodeCount}</dd>
            </div>
            <div className="flex justify-between lg:block">
              <dt className="text-content-subtle">Critical path</dt>
              <dd
                className={cn(
                  'tnum font-medium',
                  cost.withinBudget ? 'text-pass' : 'text-block'
                )}
              >
                {cost.criticalPathMs}ms / {cost.latencyBudgetMs}ms
              </dd>
            </div>
            <div className="flex justify-between lg:block">
              <dt className="text-content-subtle">If nothing parallelises</dt>
              <dd className="tnum font-medium">{cost.worstCaseMs}ms</dd>
            </div>
            <div className="flex justify-between lg:block">
              <dt className="text-content-subtle">Model calls</dt>
              <dd className="tnum font-medium">{cost.modelInvocations.length}</dd>
            </div>
          </dl>
        ) : null}

        {compilation.artifact ? (
          <div className="border-t border-border pt-3">
            <p className="mb-1 text-label uppercase tracking-wide text-content-subtle">
              Pinned at compile time
            </p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(compilation.artifact.packageVersions).map(([name, version]) => (
                <code
                  key={name}
                  className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.6875rem] text-content-muted"
                >
                  {name}@{version}
                </code>
              ))}
              {compilation.artifact.costManifest.modelInvocations.map((m) => (
                <code
                  key={m.nodeId}
                  className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.6875rem] text-content-muted"
                >
                  {m.model}
                </code>
              ))}
            </div>
            <p className="mt-2 text-label text-content-subtle">
              Artifact{' '}
              <code className="font-mono">
                {compilation.artifact.artifactHash.slice(0, 16)}
              </code>
              . Pinning is what makes a decision replayable: a floating version would change
              the answer.
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
