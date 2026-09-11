'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  StatusBadge,
  Metric,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { FlowEditor } from '@/components/flow-editor';
import { useAuth } from '@/components/auth-provider';
import { CompileReport } from '@/components/compile-report';
import { RegistryPanel } from '@/components/registry-panel';
import { ShadowPanel } from '@/components/shadow-panel';
import { apiClient, ApiError } from '@/lib/api-client';
import { downloadJson, evidenceFilename } from '@/lib/download';
import type { FlowNode, FlowEdge } from '@/mocks/fixtures/artifacts';


function FlowDetail({ artifactId }: { artifactId: string }) {
  const { hasPermission } = useAuth();
  const canEditFlows = hasPermission('edit:flows');

  const { data: artifact, isLoading, error, refetch } = useQuery({
    queryKey: ['artifact', artifactId],
    queryFn: () => apiClient.getArtifact(artifactId),
    retry: false,
  });

  if (isLoading) {
    return (
      <PageBody>
        <LoadingState label="Loading decision flow" />
      </PageBody>
    );
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <PageBody>
        <PageHeader
          title="Decision flow"
          breadcrumb={
            <Link href="/decision-flows" className="text-label text-accent hover:underline">
              ← Flows
            </Link>
          }
        />
        {notFound ? (
          <Card>
            <EmptyState
              title={`No flow with ID ${artifactId}`}
              action={
                <Link href="/decision-flows">
                  <Button variant="primary">Back to flows</Button>
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

  if (!artifact) return null;

  const overBudget = artifact.estimatedP95LatencyMs > 50;
  // The compiled half: pinned package versions, the artifact hash and the cost
  // manifest. Absent when the flow does not compile, which is what makes the
  // export control conditional rather than always enabled.
  const compiled = artifact.compilation?.artifact ?? null;

  return (
    <PageBody>
      <PageHeader
        breadcrumb={
          <Breadcrumbs
            items={[
              { label: 'Decisioning' },
              { label: 'Decision flows', href: '/decision-flows' },
              { label: artifact.name },
            ]}
          />
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {artifact.name}
            <StatusBadge status={artifact.status} />
            <span className="font-mono text-body font-normal text-content-muted">
              {artifact.activeVersion}
            </span>
          </span>
        }
        description={artifact.description}
        actions={
          <>
            {/* `versions` is a list of numbers, not a history: what changed
                between two of them is a diff screen nobody has built. Disabled
                with the reason rather than enabled and dead. Registered as
                W-054. */}
            <Button
              variant="secondary"
              size="md"
              disabled
              title="Not built: comparing two versions needs a diff view (W-054). The active version and its pinned packages are shown below."
            >
              Version history
            </Button>
            {/* A flow that did not compile has no artifact to export, and
                exporting the graph alone under the name DIR would hand someone
                a file that cannot be run. */}
            <Button
              variant="secondary"
              size="md"
              disabled={!compiled}
              title={
                compiled
                  ? undefined
                  : 'Nothing to export: this flow has no compiled artifact. Fix the errors below and publish.'
              }
              onClick={
                compiled
                  ? () =>
                      downloadJson(evidenceFilename('flow', artifact.id, compiled.compiledAt), {
                        // A flow is configuration rather than a measurement, so
                        // it is the tenant that is synthetic here, not the
                        // artifact. Said out loud anyway: an exported DIR from
                        // the demo tenant should not be mistaken for a
                        // customer's.
                        provenance: {
                          source: 'synthetic' as const,
                          note:
                            'Synthetic. This flow belongs to the seeded demo tenant ' +
                            'demo-telco-uk and was authored by nobody.',
                        },
                        // Only what the compiled artifact does not carry. The
                        // spread below has always won at runtime for id,
                        // version, candidateKeys, nodes and edges — the
                        // compiled form is the executable one — and the spec
                        // described four of its fields until 2026-09-11, which
                        // is the only reason the duplicates typechecked.
                        name: artifact.name,
                        ...compiled,
                      })
                  : undefined
              }
            >
              Export DIR
            </Button>
          </>
        }
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Nodes" value={artifact.nodes.length} />
        <Metric
          label="Worst-case p95"
          value={`${artifact.estimatedP95LatencyMs.toFixed(1)}ms`}
          tone={overBudget ? 'block' : 'pass'}
          sub="budget 50ms"
        />
        <Metric
          label="Candidate set"
          value={artifact.candidateKeys.length}
          sub="offers in scope"
        />
        <Metric label="Versions" value={artifact.versions.length} sub="all replayable" />
      </div>

      <div className="mb-stack">
        <CompileReport compilation={artifact.compilation ?? null} />
      </div>

      <FlowEditor
        artifactId={artifact.id}
        nodes={artifact.nodes as unknown as FlowNode[]}
        edges={artifact.edges as unknown as FlowEdge[]}
        candidateKeys={artifact.candidateKeys}
        canEdit={canEditFlows}
      />

      <div className="grid gap-stack lg:grid-cols-[1fr_340px]">
        <div />
        <div className="space-y-stack">
          <Card>
            <CardHeader title="Provenance" />
            <CardBody>
              <dl className="space-y-2 text-body">
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Artifact</dt>
                  <dd className="font-mono text-label">{artifact.id}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-subtle">Updated</dt>
                  <dd>{new Date(artifact.updatedAt).toLocaleDateString('en-GB')}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-content-subtle">By</dt>
                  <dd className="truncate text-right text-label">{artifact.updatedBy}</dd>
                </div>
              </dl>
              <Link
                href={`/decisions?artifact=${artifact.id}`}
                className="mt-3 block rounded border border-border px-2 py-1.5 text-body transition-colors hover:border-accent hover:bg-accent-subtle"
              >
                Decisions from this flow →
              </Link>
            </CardBody>
          </Card>

          <RegistryPanel flowName={artifact.id} />

          <ShadowPanel flowName={artifact.id} />
        </div>
      </div>
    </PageBody>
  );
}

export default function FlowDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <RequireAuth>{id ? <FlowDetail artifactId={id} /> : null}</RequireAuth>;
}
