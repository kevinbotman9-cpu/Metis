'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Badge,
  AutonomyBadge,
  Metric,
  LoadingState,
} from '@/components/ui/primitives';
import { apiClient } from '@/lib/api-client';

const OUTCOME_TONE: Record<string, 'pass' | 'block' | 'hold' | 'info' | 'neutral'> = {
  auto_applied: 'pass',
  proposed: 'info',
  suggested: 'neutral',
  blocked: 'block',
  reverted: 'hold',
};

function Home() {
  const { user } = useAuth();

  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: () => apiClient.getTaxonomy() });
  const decisions = useQuery({
    queryKey: ['decisions', 'overview'],
    queryFn: () => apiClient.searchDecisions({ limit: 200 }),
  });
  const changeRequests = useQuery({
    queryKey: ['change-requests'],
    queryFn: () => apiClient.listChangeRequests(),
  });
  const activity = useQuery({
    queryKey: ['agent-activity', 'overview'],
    queryFn: () => apiClient.listAgentActivity({ limit: 6 }),
  });

  const props = taxonomy.data?.propositions ?? [];
  const decs = decisions.data?.decisions ?? [];
  const pending = (changeRequests.data?.changeRequests ?? []).filter(
    (c) => c.status === 'pending'
  );
  const suppressed = decs.filter((d) => !d.winner).length;
  const avgLatency =
    decs.length > 0 ? (decs.reduce((s, d) => s + d.totalMs, 0) / decs.length).toFixed(1) : '—';

  return (
    <PageBody>
      <PageHeader
        title={`Good to see you, ${user?.name.split(' ')[0] ?? 'there'}`}
        description="Everything the platform decided, offered and changed for telco-uk."
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric
          label="Active propositions"
          value={props.filter((p) => p.status === 'active').length}
          sub={`${props.length} in catalogue`}
        />
        <Metric label="Decisions" value={decs.length} sub="last 7 days" />
        <Metric
          label="Suppressed"
          value={suppressed}
          tone={suppressed > 0 ? 'hold' : 'neutral'}
          sub="policy or consent"
        />
        <Metric label="Avg latency" value={`${avgLatency}ms`} tone="accent" sub="SLA 50ms" />
        <Metric
          label="Awaiting approval"
          value={pending.length}
          tone={pending.length > 0 ? 'hold' : 'pass'}
        />
      </div>

      <div className="grid gap-stack lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Awaiting your approval"
            description="Changes proposed by people and agents."
            actions={
              <Link href="/approvals" className="text-label text-accent hover:underline">
                All approvals →
              </Link>
            }
          />
          <CardBody className="p-0">
            {changeRequests.isLoading ? (
              <LoadingState />
            ) : pending.length === 0 ? (
              <p className="px-card py-6 text-body text-content-muted">
                Nothing pending. The queue is clear.
              </p>
            ) : (
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
                            {cr.requestedBy.startsWith('agent-') ? 'Agent' : 'Person'} ·{' '}
                            {cr.requestedBy}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge tone="hold">pending</Badge>
                          {cr.simulation && (
                            <Badge tone={cr.simulation.passed ? 'pass' : 'block'}>
                              sim {cr.simulation.passed ? 'passed' : 'failed'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Agent activity"
            description="What the agents did, and what the guardrails stopped."
            actions={
              <Link href="/agentic" className="text-label text-accent hover:underline">
                Autonomy settings →
              </Link>
            }
          />
          <CardBody className="p-0">
            {activity.isLoading ? (
              <LoadingState />
            ) : (
              <ul className="divide-y divide-border">
                {(activity.data?.activity ?? []).map((a) => (
                  <li key={a.id} className="px-card py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AutonomyBadge level={a.level} />
                          <span className="font-mono text-label text-content-subtle">
                            {a.agentId}
                          </span>
                        </div>
                        <p className="mt-1 text-body text-content-muted">{a.summary}</p>
                        {a.guardrailBreached && (
                          <p className="mt-1 rounded border border-block/30 bg-block-subtle px-2 py-1 text-label text-block">
                            {a.guardrailBreached}
                          </p>
                        )}
                      </div>
                      <Badge tone={OUTCOME_TONE[a.outcome] ?? 'neutral'}>
                        {a.outcome.replace('_', ' ')}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-stack">
        <Card>
          <CardHeader title="Jump to" />
          <CardBody>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { href: '/propositions', label: 'Propositions', blurb: 'Master and group offers' },
                { href: '/decisions', label: 'Decisions', blurb: 'Search traces and replay' },
                { href: '/arbitration', label: 'Arbitration', blurb: 'Tune P × V × L × C' },
                { href: '/agentic', label: 'Agentic AI', blurb: 'Autonomy and guardrails' },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded border border-border px-3 py-2.5 transition-colors hover:border-accent hover:bg-accent-subtle"
                >
                  <p className="text-body font-medium text-content">{l.label}</p>
                  <p className="mt-0.5 text-label text-content-muted">{l.blurb}</p>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </PageBody>
  );
}

export default function HomePage() {
  return (
    <RequireAuth>
      <Home />
    </RequireAuth>
  );
}
