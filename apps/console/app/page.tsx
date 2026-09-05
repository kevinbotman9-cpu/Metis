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
  LoadingState,
} from '@/components/ui/primitives';
import { HealthSummary, BigStat } from '@/components/ui/health-summary';
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

  const decisions = useQuery({
    queryKey: ['decisions', 'overview'],
    // The whole set, not a page of it: the strip reports totals, and a headline
    // that silently showed the page size instead would be wrong.
    queryFn: () => apiClient.searchDecisions({ limit: 5000 }),
  });
  const changeSets = useQuery({
    queryKey: ['change-sets'],
    queryFn: () => apiClient.listChangeSets(),
  });
  const activityQuery = useQuery({
    queryKey: ['agent-activity', 'overview'],
    queryFn: () => apiClient.listAgentActivity({ limit: 20 }),
  });
  const flows = useQuery({
    queryKey: ['artifacts'],
    queryFn: () => apiClient.listArtifacts(),
  });

  const decs = decisions.data?.decisions ?? [];
  const crs = changeSets.data?.changeSets ?? [];
  const pending = crs.filter((c) => c.status === 'pending');
  const activity = activityQuery.data?.activity ?? [];

  const suppressed = decs.filter((d) => !d.winner).length;
  const offered = decs.length - suppressed;
  const avgLatency =
    decs.length > 0 ? (decs.reduce((s, d) => s + d.totalMs, 0) / decs.length).toFixed(2) : '0';

  const artifacts = flows.data?.artifacts ?? [];
  const compileFailing = artifacts.filter((a) => a.compileOk === false).length;
  const compileWarning = artifacts.filter(
    (a) => a.compileOk !== false && (a.warningCount ?? 0) > 0
  ).length;

  // Anything the agents did that a guardrail had to stop is what an operator
  // actually needs surfaced, so it gets its own segment rather than a footnote.
  const blocked = activity.filter(
    (a) => a.outcome === 'blocked' || a.outcome === 'reverted'
  ).length;

  return (
    <PageBody>
      <PageHeader
        title={`Good to see you, ${user?.name.split(' ')[0] ?? 'there'}`}
        description="Everything the platform decided, offered and changed for telco-uk."
      />

      <div className="mb-stack grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <BigStat
          label="Decisions"
          value={(decisions.data?.total ?? 0).toLocaleString('en-GB')}
          sub="last 7 days"
        />
        <BigStat
          label="Avg latency"
          value={`${avgLatency}ms`}
          sub={`SLA 50ms · ${((Number(avgLatency) / 50) * 100).toFixed(0)}% of budget`}
        />
        <HealthSummary
          label="Decision outcomes"
          segments={[
            { label: 'offered', count: offered, tone: 'pass' },
            { label: 'suppressed', count: suppressed, tone: 'hold' },
          ]}
        />
        <HealthSummary
          label="Flow compilation"
          segments={[
            {
              label: 'clean',
              count: artifacts.length - compileFailing - compileWarning,
              tone: 'pass',
            },
            { label: 'warnings', count: compileWarning, tone: 'hold' },
            { label: 'blocked', count: compileFailing, tone: 'block' },
          ]}
        />
        <HealthSummary
          label="Governance"
          segments={[
            { label: 'pending', count: pending.length, tone: 'hold' },
            { label: 'guardrail stops', count: blocked, tone: 'block' },
            { label: 'decided', count: crs.length - pending.length, tone: 'pass' },
          ]}
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
            {changeSets.isLoading ? (
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
            {activityQuery.isLoading ? (
              <LoadingState />
            ) : (
              <ul className="divide-y divide-border">
                {activity.slice(0, 6).map((a) => (
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
                { href: '/offers', label: 'Offers', blurb: 'Master and category offers' },
                { href: '/decisions', label: 'Decisions', blurb: 'Search traces and replay' },
                { href: '/arbitration', label: 'Arbitration', blurb: 'Tune P × V × B × C' },
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
