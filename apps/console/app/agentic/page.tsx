'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  ErrorState,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { apiClient, type AutonomySettingDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

const LADDER = [
  {
    level: 'L0',
    name: 'Observe',
    can: 'Explain decisions, answer "why did this customer get that offer"',
    gate: '—',
    rollback: '—',
  },
  {
    level: 'L1',
    name: 'Assist',
    can: 'Draft rules, copy and creatives as suggestions',
    gate: 'Human writes the change',
    rollback: '—',
  },
  {
    level: 'L2',
    name: 'Propose',
    can: 'Open a change set with a diff and simulation results',
    gate: 'Approve before publish',
    rollback: 'Manual',
  },
  {
    level: 'L3',
    name: 'Bounded',
    can: 'Auto-publish changes that stay inside the guardrails',
    gate: 'Post-hoc review',
    rollback: 'Automatic on breach',
  },
  {
    level: 'L4',
    name: 'Autonomous',
    can: 'Run experiments, promote winners, retire losers',
    gate: 'Audit only',
    rollback: 'Automatic',
  },
];

const OUTCOME_TONE: Record<string, 'pass' | 'block' | 'hold' | 'info' | 'neutral'> = {
  auto_applied: 'pass',
  proposed: 'info',
  suggested: 'neutral',
  blocked: 'block',
  reverted: 'hold',
};

function money(m: { amount: number; currency: string }) {
  const s = m.currency === 'GBP' ? '£' : m.currency === 'USD' ? '$' : '€';
  return `${s}${(m.amount / 100).toLocaleString('en-GB')}`;
}

function ScopeCard({ setting, canEdit }: { setting: AutonomySettingDto; canEdit: boolean }) {
  const g = setting.guardrails;
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (level: AutonomySettingDto['level']) =>
      apiClient.updateAutonomySetting({ id: setting.id, level }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autonomy'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setEditing(false);
    },
  });

  return (
    <div className="rounded-lg border border-border bg-surface p-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AutonomyBadge
              level={setting.level}
              name={LADDER.find((l) => l.level === setting.level)?.name}
            />
            <Badge tone="outline">{setting.scope.level}</Badge>
          </div>
          {setting.scope.targetId && (
            <p className="mt-1 font-mono text-label text-content-subtle">
              {setting.scope.targetId}
            </p>
          )}
        </div>
        {canEdit && (
          <Button variant="secondary" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel' : 'Change level'}
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-3 rounded border border-accent/40 bg-accent-subtle p-2">
          <p className="mb-1.5 text-label text-content-muted">
            Raising a level widens what agents may do here without asking. The change is audited.
          </p>
          <div className="flex flex-wrap gap-1">
            {LADDER.map((l) => (
              <button
                key={l.level}
                onClick={() => save.mutate(l.level as AutonomySettingDto['level'])}
                disabled={save.isPending || l.level === setting.level}
                className={cn(
                  'rounded border px-2 py-1 text-label font-medium transition-colors',
                  l.level === setting.level
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-border bg-surface text-content-muted hover:bg-surface-sunken'
                )}
              >
                {l.level} {l.name}
              </button>
            ))}
          </div>
          {save.isError && (
            <p role="alert" className="mt-1.5 text-label text-block">
              {(save.error as Error).message}
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-body text-content-muted">{setting.rationale}</p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-3 text-label">
        <div className="flex justify-between">
          <dt className="text-content-subtle">Blast radius</dt>
          <dd className="tnum font-medium">{g.maxBlastRadiusPct}%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-content-subtle">Boost delta</dt>
          <dd className="tnum font-medium">±{(g.maxBoostDelta * 100).toFixed(0)}%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-content-subtle">Budget delta</dt>
          <dd className="tnum font-medium">{money(g.maxBudgetDelta)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-content-subtle">Bias gate</dt>
          <dd className="tnum font-medium">{g.biasGateThreshold.toFixed(2)}</dd>
        </div>
        <div className="col-span-2 flex justify-between">
          <dt className="text-content-subtle">Simulation required</dt>
          <dd className="font-medium">{g.requireSimulationPass ? 'Yes' : 'No'}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <p className="mb-1 text-label uppercase tracking-wide text-content-subtle">
          Permitted changes
        </p>
        {g.allowedChangeTypes.length === 0 ? (
          <Badge tone="block">none — agent cannot write</Badge>
        ) : (
          <div className="flex flex-wrap gap-1">
            {g.allowedChangeTypes.map((t) => (
              <Badge key={t} tone="outline">
                {t.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {g.protectedAttributes.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-label uppercase tracking-wide text-content-subtle">
            Frozen attributes
          </p>
          <div className="flex flex-wrap gap-1">
            {g.protectedAttributes.map((a) => (
              <code
                key={a}
                className="rounded-sm bg-block-subtle px-1.5 py-0.5 font-mono text-[0.6875rem] text-block"
              >
                {a}
              </code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AgenticView() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:autonomy');
  const [outcomeFilter, setOutcomeFilter] = useState('');

  const settings = useQuery({
    queryKey: ['autonomy'],
    queryFn: () => apiClient.listAutonomySettings(),
  });
  const activity = useQuery({
    queryKey: ['agent-activity', outcomeFilter],
    queryFn: () => apiClient.listAgentActivity({ outcome: outcomeFilter || undefined, limit: 50 }),
  });

  const rows = settings.data?.settings ?? [];
  const feed = activity.data?.activity ?? [];
  const blocked = feed.filter((a) => a.outcome === 'blocked' || a.outcome === 'reverted').length;

  if (settings.error) {
    return (
      <PageBody>
        <ErrorState
          description={(settings.error as Error).message}
          onRetry={() => settings.refetch()}
        />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeader
        title="Agentic AI"
        description="How much authority agents hold, and over what. Autonomy is set per scope and resolves most-specific-first: offer beats category, category beats objective, objective beats tenant."
        actions={
          canEdit ? (
            // No API creates a scope rule — `updateAutonomySetting` edits the
            // ones that exist. Disabled with the reason rather than enabled and
            // dead.
            <Button
              variant="primary"
              size="md"
              disabled
              title="Not built: creating a scope rule has no API yet. Existing scopes can be changed."
            >
              New scope rule
            </Button>
          ) : (
            <Badge tone="outline">read only</Badge>
          )
        }
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Scope rules" value={rows.length} />
        <Metric
          label="Highest level"
          value={rows.reduce((max, s) => (s.level > max ? s.level : max), 'L0')}
          tone="accent"
        />
        <Metric
          label="Agent actions"
          value={feed.length}
          sub="in the feed"
        />
        <Metric
          label="Stopped by guardrails"
          value={blocked}
          tone={blocked > 0 ? 'block' : 'pass'}
          sub="blocked or reverted"
        />
      </div>

      {/* Ladder */}
      <Card className="mb-stack">
        <CardHeader
          title="The autonomy ladder"
          description="Each level is a different answer to: what may the agent change without asking?"
        />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-body">
              <thead>
                <tr className="border-b border-border text-label uppercase tracking-wide text-content-subtle">
                  <th className="px-cell py-2 text-left font-semibold">Level</th>
                  <th className="px-cell py-2 text-left font-semibold">The agent may</th>
                  <th className="px-cell py-2 text-left font-semibold">Human gate</th>
                  <th className="px-cell py-2 text-left font-semibold">Rollback</th>
                  <th className="px-cell py-2 text-right font-semibold">Scopes</th>
                </tr>
              </thead>
              <tbody>
                {LADDER.map((l) => {
                  const inUse = rows.filter((s) => s.level === l.level).length;
                  return (
                    <tr
                      key={l.level}
                      className={cn(
                        'border-b border-border/60',
                        inUse > 0 && 'bg-surface-sunken/40'
                      )}
                    >
                      <td className="px-cell py-cell-y">
                        <AutonomyBadge level={l.level} name={l.name} />
                      </td>
                      <td className="px-cell py-cell-y text-content-muted">{l.can}</td>
                      <td className="px-cell py-cell-y text-content-muted">{l.gate}</td>
                      <td className="px-cell py-cell-y text-content-muted">{l.rollback}</td>
                      <td className="px-cell py-cell-y text-right">
                        {inUse > 0 ? (
                          <span className="tnum font-medium text-content">{inUse}</span>
                        ) : (
                          <span className="text-content-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-stack lg:grid-cols-[1fr_1fr]">
        {/* Scope rules */}
        <div>
          <h2 className="mb-2 text-body font-semibold text-content">Autonomy by scope</h2>
          {settings.isLoading ? (
            <LoadingState />
          ) : (
            <div className="space-y-3">
              {rows.map((s) => (
                <ScopeCard key={s.id} setting={s} canEdit={canEdit} />
              ))}
            </div>
          )}
        </div>

        {/* Activity */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-body font-semibold text-content">Agent activity</h2>
            <select
              aria-label="Filter activity by outcome"
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="h-7 rounded border border-border bg-surface px-2 text-label"
            >
              <option value="">All outcomes</option>
              <option value="auto_applied">Auto-applied</option>
              <option value="proposed">Proposed</option>
              <option value="suggested">Suggested</option>
              <option value="blocked">Blocked</option>
              <option value="reverted">Reverted</option>
            </select>
          </div>

          <Card>
            <CardBody className="p-0">
              {activity.isLoading ? (
                <LoadingState />
              ) : feed.length === 0 ? (
                <p className="px-card py-8 text-center text-body text-content-muted">
                  No activity with this outcome.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {feed.map((a) => (
                    <li key={a.id} className="px-card py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AutonomyBadge level={a.level} />
                          <span className="font-mono text-label text-content-subtle">
                            {a.agentId}
                          </span>
                          <Badge tone="outline">{a.changeType.replace(/_/g, ' ')}</Badge>
                        </div>
                        <Badge tone={OUTCOME_TONE[a.outcome] ?? 'neutral'}>
                          {a.outcome.replace('_', ' ')}
                        </Badge>
                      </div>

                      <p className="mt-1.5 text-body text-content-muted">{a.summary}</p>

                      {a.guardrailBreached && (
                        <p className="mt-1.5 rounded border border-block/30 bg-block-subtle px-2 py-1 font-mono text-[0.6875rem] text-block">
                          {a.guardrailBreached}
                        </p>
                      )}

                      <div className="mt-1.5 flex items-center gap-3 text-label text-content-subtle">
                        <span className="tnum">
                          {new Date(a.timestamp).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {a.changeSetId && (
                          <Link
                            href={`/approvals/${a.changeSetId}`}
                            className="text-accent hover:underline"
                          >
                            {a.changeSetId} →
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </PageBody>
  );
}

export default function AgenticPage() {
  return (
    <RequireAuth>
      <AgenticView />
    </RequireAuth>
  );
}
