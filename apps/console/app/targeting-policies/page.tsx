'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  Badge,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Select,
} from '@/components/ui/primitives';
import { NoDecisionsYet, useEmptyReason } from '@/components/no-decisions-yet';
import { ProvenanceBanner } from '@/components/ui/provenance-banner';
import { CascadeRail } from '@/components/cascade-rail';
import { CascadePanes } from '@/components/cascade-panes';
import {
  FunnelFirstPaint,
  FunnelRailFoot,
  FunnelStageDetail,
  FunnelStageEvidence,
  FunnelUnaccounted,
} from '@/components/policy-funnel-panes';
import { buildFunnelView } from '@/lib/policy-funnel';
import { useFormat } from '@/components/tenant-format';
import { DataTable, type Column } from '@/components/ui/data-table';
import { apiClient, type TargetingPolicyDto } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth-provider';
import { EntityFormDialog } from '@/components/entity-form-dialog';
import { DeleteDialog } from '@/components/delete-dialog';
import { bindingFor, invalidationsFor, type Row } from '@/lib/layouts/sources';
import { cn } from '@/lib/cn';
import { InfoTip } from '@/components/ui/tooltip';

/** How a policy is written. Shared with any screen that writes one. */
const POLICY = bindingFor('TargetingPolicy');
/** Stable, because the form resets whenever its defaults change identity. */
const POLICY_DEFAULTS = POLICY.defaults?.([]);

const KINDS = [
  {
    key: 'eligibility',
    title: 'Eligibility',
    question: 'Can we offer this?',
    blurb: 'Hard contractual and legal gates. Failing one removes the candidate outright.',
    tone: 'accent' as const,
  },
  {
    key: 'relevance',
    title: 'Relevance',
    question: 'Should we offer it now?',
    blurb: 'Situational relevance — already held, trigger not fired, wrong moment.',
    tone: 'info' as const,
  },
  {
    key: 'suitability',
    title: 'Suitability',
    question: 'Is it right for this customer?',
    blurb: 'Affordability, fair value and ethical checks. The tier a regulator reads.',
    tone: 'hold' as const,
  },
];

/**
 * Where candidates fall out of decisions, by reason code and by rule.
 *
 * A second question of the same subject, answered as a view on this page
 * rather than a route of its own, as `/creatives?view=coverage` is: the policies
 * are what the funnel counts, and a separate route would be a screen with no
 * layout manifest and a Cascade with no renderer to give it one.
 */
function PolicyFunnel() {
  // Which of the two blanks this screen is showing, when it shows one.
  const emptyReason = useEmptyReason();
  const format = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [flowId, setFlowId] = useState('');

  const selected = params.get('stage');
  const setSelected = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('stage', id);
    else next.delete('stage');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['policy-funnel', flowId],
    queryFn: () => apiClient.getPolicyFunnel({ flowId: flowId || undefined }),
  });
  const flows = useQuery({ queryKey: ['artifacts'], queryFn: () => apiClient.listArtifacts() });
  const view = useMemo(() => (data ? buildFunnelView(data, format) : null), [data, format]);

  if (isLoading) return <LoadingState label="Summing removals over decisions" />;
  if (error || !data || !view) {
    return (
      <ErrorState
        description="Could not build the funnel."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <>
      <ProvenanceBanner provenance={data.provenance} />

      <div className="mb-stack flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Flow" htmlFor="funnel-flow">
            <Select id="funnel-flow" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
              <option value="">All flows</option>
              {(flows.data?.artifacts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {data.decisions === 0 ? (
        emptyReason === 'new-tenant' ? (
          <NoDecisionsYet
            shows={[
              'The qualification funnel: how many candidates each tier removed, and which rule removed them',
              'Eligibility, relevance and suitability as three stages with volumes between them',
              'Every removal traceable to the offer it removed and the policy that named it',
            ]}
          />
        ) : (
          <EmptyState
            title="Nothing has been decided in this window"
            description="This tenant has a decision history; this flow has no part of it. Choose another flow."
          />
        )
      ) : (
        <>
          <FunnelUnaccounted report={data} />
          <CascadePanes
            rail={
              <CascadeRail
                label="Where candidates fall out"
                stages={view.stages}
                selected={selected}
                onSelect={setSelected}
                foot={<FunnelRailFoot />}
              />
            }
            evidence={<FunnelStageEvidence report={data} stageId={selected} />}
          >
            {selected ? (
              <FunnelStageDetail report={data} stageId={selected} />
            ) : (
              <FunnelFirstPaint report={data} view={view} />
            )}
          </CascadePanes>
        </>
      )}
    </>
  );
}

function PoliciesView() {
  const [kind, setKind] = useState<string>('');

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get('view') === 'funnel' ? 'funnel' : 'policies';
  const setView = (next: 'policies' | 'funnel') => {
    const q = new URLSearchParams(params.toString());
    q.delete('stage');
    if (next === 'funnel') q.set('view', 'funnel');
    else q.delete('view');
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['targeting-policies'],
    queryFn: () => apiClient.listTargetingPolicies(),
  });

  const all = data?.policies ?? [];
  const rows = kind ? all.filter((p) => p.kind === kind) : all;

  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:policies');
  const [editing, setEditing] = useState<TargetingPolicyDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TargetingPolicyDto | null>(null);

  const columns: Column<TargetingPolicyDto>[] = [
    {
      key: 'name',
      header: 'Policy',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div>
          <div className="font-medium text-content">{p.name}</div>
          <div className="text-label text-content-muted">{p.description}</div>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Tier',
      width: 'w-32',
      sortValue: (p) => p.kind,
      cell: (p) => (
        <Badge tone={KINDS.find((k) => k.key === p.kind)?.tone ?? 'neutral'}>{p.kind}</Badge>
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      width: 'w-40',
      sortValue: (p) => p.scope.level,
      cell: (p) => (
        <div>
          <Badge tone="outline">{p.scope.level}</Badge>
          {p.scope.targetId && (
            <div className="mt-0.5 font-mono text-label text-content-subtle">
              {p.scope.targetId}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'conditions',
      header: 'Conditions',
      secondary: true,
      cell: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.conditions.map((c, i) => (
            <code
              key={i}
              className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-label text-content-muted"
            >
              {c.field} {c.operator} {JSON.stringify(c.value)}
            </code>
          ))}
        </div>
      ),
    },
    {
      key: 'active',
      header: 'State',
      width: 'w-20',
      sortValue: (p) => String(p.active),
      cell: (p) => (
        <Badge tone={p.active ? 'pass' : 'neutral'}>{p.active ? 'active' : 'off'}</Badge>
      ),
    },
    // Offered only to somebody who can act on it. An enabled control that
    // answers 403 is the defect this console has had before.
    ...(canEdit
      ? [
          {
            key: 'edit',
            header: '',
            width: 'w-40',
            cell: (p: TargetingPolicyDto) => (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Button variant="secondary" onClick={() => setDeleting(p)} aria-label={`Delete policy ${p.name}`}>
                  Delete
                </Button>
              </div>
            ),
          } as Column<TargetingPolicyDto>,
        ]
      : []),
  ];

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
        title="Targeting policies"
        description={
          view === 'funnel'
            ? 'Candidates removed at each stage, summed over decisions. Each is removed once, or offered.'
            : 'The trace records which tier removed a candidate.'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-2" role="group" aria-label="View">
              <Button
                variant={view === 'policies' ? 'primary' : 'secondary'}
                size="md"
                aria-pressed={view === 'policies'}
                onClick={() => setView('policies')}
              >
                Policies
              </Button>
              <Button
                variant={view === 'funnel' ? 'primary' : 'secondary'}
                size="md"
                aria-pressed={view === 'funnel'}
                onClick={() => setView('funnel')}
              >
                Funnel
              </Button>
            </div>
            {canEdit && view === 'policies' ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                New policy
              </Button>
            ) : null}
          </div>
        }
      />

      {view === 'funnel' ? (
        <PolicyFunnel />
      ) : (
      <>

      {/* The declared form: `packages/ui-metadata/src/registry/targeting-policy.ts`,
          written through the entity's binding, which is where the scope a new
          policy takes is decided. */}
      <EntityFormDialog<Row>
        open={creating || editing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        entity="TargetingPolicy"
        record={(editing as unknown as Row) ?? null}
        defaults={POLICY_DEFAULTS}
        save={(body, record) => POLICY.save!(body, record, null)}
        invalidate={invalidationsFor(POLICY, null)}
      />
      <DeleteDialog<TargetingPolicyDto>
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        entity="TargetingPolicy"
        record={deleting}
        name={deleting?.name ?? ''}
        remove={(record) => POLICY.remove!(record as unknown as Row, null)}
        invalidate={invalidationsFor(POLICY, null)}
      />

      <div className="mb-stack grid gap-3 lg:grid-cols-3">
        {KINDS.map((k) => {
          const count = all.filter((p) => p.kind === k.key).length;
          const selected = kind === k.key;
          return (
            <div key={k.key} className="relative">
            <button
              onClick={() => setKind(selected ? '' : k.key)}
              aria-pressed={selected}
              className={cn(
                'h-full w-full rounded-lg border p-card pr-8 text-left transition-colors',
                selected
                  ? 'border-accent bg-accent-subtle'
                  : 'border-border bg-surface hover:border-border-strong'
              )}
            >
              <div className="flex items-center justify-between">
                <Badge tone={k.tone}>{k.title}</Badge>
                <span className="tnum text-body font-semibold text-content">{count}</span>
              </div>
              <p className="mt-2 text-body font-medium text-content">{k.question}</p>
              {/* A zero here is ambiguous: it reads as an omission, and on the
                  tier a regulator reads that is the worst thing for it to read
                  as. This tenant genuinely declares no suitability policy —
                  its brief names no affordability rule — so the screen states
                  that rather than leaving a reader to guess whether the rules
                  are missing or were never written. */}
              {count === 0 ? (
                <p className="mt-2 text-label text-content-subtle">
                  This tenant declares none. An empty tier is a stated fact here, not a gap:
                  nothing has been authored on it, and nothing is being skipped.
                </p>
              ) : null}
            </button>
            {/* Outside the button: a tooltip trigger cannot be nested inside one. */}
            <div className="absolute bottom-card right-card">
              <InfoTip label={`About ${k.title.toLowerCase()}`}>{k.blurb}</InfoTip>
            </div>
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title={kind ? `${kind} rules` : 'All policies'}
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          isLoading={isLoading}
          defaultSort={{ key: 'kind', dir: 'asc' }}
          emptyTitle="No policies in this tier"
          caption="Targeting policies"
        />
      </Card>
      </>
      )}
    </PageBody>
  );
}

export default function TargetingPoliciesPage() {
  return (
    <RequireAuth>
      <PoliciesView />
    </RequireAuth>
  );
}
