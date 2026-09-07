'use client';

import { useState } from 'react';
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
  Badge,
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
import { apiClient, ApiError, type FlowNodeDto } from '@/lib/api-client';
import type { FlowNode, FlowEdge } from '@/mocks/fixtures/artifacts';
import { cn } from '@/lib/cn';

const FAMILY_LABEL: Record<string, string> = {
  source: 'Data',
  'set-property': 'Data',
  filter: 'Gate',
  constraint: 'Gate',
  'score-model': 'Score',
  'score-adaptive': 'Score',
  switch: 'Branch',
  'sub-flow': 'Branch',
  'champion-challenger': 'Branch',
  'explain-annotate': 'Output',
  arbitrate: 'Decision',
};

const LEGEND = [
  { family: 'Data', tone: 'bg-info-subtle border-info/50', blurb: 'Loads or shapes state' },
  { family: 'Gate', tone: 'bg-accent-subtle border-accent/50', blurb: 'Removes candidates' },
  { family: 'Score', tone: 'bg-pass-subtle border-pass/50', blurb: 'Pinned model call' },
  { family: 'Decision', tone: 'bg-block-subtle border-block/50', blurb: 'Selects the winner' },
];

function NodeInspector({
  node,
  policyNames,
}: {
  node: FlowNodeDto;
  policyNames: Record<string, string>;
}) {
  return (
    <>
      <CardHeader
        title={node.label}
        description={FAMILY_LABEL[node.type] ?? 'Node'}
        actions={<Badge tone="outline">{node.type}</Badge>}
      />
      <CardBody className="space-y-4">
        <p className="text-body text-content-muted">{node.description}</p>

        <div className="flex justify-between border-t border-border pt-3 text-body">
          <span className="text-content-subtle">Node ID</span>
          <span className="font-mono text-label">{node.id}</span>
        </div>
        <div className="flex justify-between text-body">
          <span className="text-content-subtle">Worst-case latency</span>
          <span className="tnum font-medium">{node.estimatedMs.toFixed(1)}ms</span>
        </div>

        {node.model && (
          <div>
            <p className="mb-1 text-label uppercase tracking-wide text-content-subtle">
              Pinned model
            </p>
            <code className="block rounded border border-border bg-surface-sunken px-2 py-1.5 font-mono text-label">
              {node.model.id} @ {node.model.version}
            </code>
            <p className="mt-1 text-label text-content-muted">
              Pinned at compile time. A newer model version does not change how this decision
              replays.
            </p>
          </div>
        )}

        {node.formula && (
          <div>
            <p className="mb-1 text-label uppercase tracking-wide text-content-subtle">
              Ranking formula
            </p>
            <code className="block rounded border border-border bg-surface-sunken px-2 py-1.5 font-mono text-label">
              {node.formula}
            </code>
            <Link
              href="/arbitration"
              className="mt-1 inline-block text-label text-accent hover:underline"
            >
              Tune the weights →
            </Link>
          </div>
        )}

        {node.policyIds && node.policyIds.length > 0 && (
          <div>
            <p className="mb-1.5 text-label uppercase tracking-wide text-content-subtle">
              Policies evaluated
            </p>
            <ul className="space-y-1">
              {node.policyIds.map((id) => (
                <li
                  key={id}
                  className="rounded border border-border bg-surface-sunken px-2 py-1.5"
                >
                  <p className="text-body text-content">{policyNames[id] ?? id}</p>
                  <p className="font-mono text-[0.6875rem] text-content-subtle">{id}</p>
                </li>
              ))}
            </ul>
            <Link
              href="/targeting-policies"
              className="mt-1.5 inline-block text-label text-accent hover:underline"
            >
              All targeting policies →
            </Link>
          </div>
        )}
      </CardBody>
    </>
  );
}

function FlowDetail({ artifactId }: { artifactId: string }) {
  const { hasPermission } = useAuth();
  const canEditFlows = hasPermission('edit:flows');

  const { data: artifact, isLoading, error, refetch } = useQuery({
    queryKey: ['artifact', artifactId],
    queryFn: () => apiClient.getArtifact(artifactId),
    retry: false,
  });

  const policies = useQuery({
    queryKey: ['targeting-policies'],
    queryFn: () => apiClient.listTargetingPolicies(),
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

  const policyNames = Object.fromEntries(
    (policies.data?.policies ?? []).map((p) => [p.id, p.name])
  );
  const overBudget = artifact.estimatedP95LatencyMs > 50;

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
            <Button variant="secondary" size="md">
              Version history
            </Button>
            <Button variant="secondary" size="md">
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
