'use client';

import { InfoTip } from '@/components/ui/tooltip';
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
  ErrorState,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { apiClient, type FrequencyPolicyDto } from '@/lib/api-client';

function FrequencyPolicyView() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['frequency-policies'],
    queryFn: () => apiClient.listFrequencyPolicies(),
  });

  const rows = data?.policies ?? [];

  const columns: Column<FrequencyPolicyDto>[] = [
    {
      key: 'name',
      header: 'Rule',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div>
          <div className="font-medium text-content">{p.name}</div>
          <div className="text-label text-content-muted">{p.description}</div>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 'w-28',
      sortValue: (p) => p.channel ?? 'all',
      cell: (p) =>
        p.channel ? (
          <Badge tone="outline">{p.channel.replace('_', ' ')}</Badge>
        ) : (
          <span className="text-label text-content-subtle">All channels</span>
        ),
    },
    {
      key: 'cap',
      header: 'Cap',
      width: 'w-32',
      align: 'right',
      sortValue: (p) => p.maxContacts,
      cell: (p) => (
        <span className="tnum">
          {p.maxContacts} <span className="text-content-subtle">/ {p.period}</span>
        </span>
      ),
    },
    {
      key: 'cooldown',
      header: 'Rest after decline',
      width: 'w-36',
      align: 'right',
      sortValue: (p) => p.cooldownDaysAfterReject,
      cell: (p) =>
        p.cooldownDaysAfterReject > 0 ? (
          <span className="tnum">{p.cooldownDaysAfterReject}d</span>
        ) : (
          <span className="text-content-subtle">none</span>
        ),
    },
    {
      key: 'scope',
      header: 'Scope',
      width: 'w-40',
      secondary: true,
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
        title="Frequency policy"
        description="The trace names the rule that suppressed an offer."
      />

      <div className="mb-stack grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Rules" value={rows.length} />
        <Metric
          label="Channel-specific"
          value={rows.filter((p) => p.channel).length}
          sub="rest apply to all"
        />
        <Metric
          label="With cooldown"
          value={rows.filter((p) => p.cooldownDaysAfterReject > 0).length}
          sub="suppress after decline"
        />
        <Metric
          label="Inactive"
          value={rows.filter((p) => !p.active).length}
          tone={rows.filter((p) => !p.active).length > 0 ? 'hold' : 'neutral'}
        />
      </div>

      <Card>
        <CardHeader
          title="Frequency and suppression rules"
          description="The most restrictive matching rule wins."
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          isLoading={isLoading}
          defaultSort={{ key: 'scope', dir: 'asc' }}
          emptyTitle="No frequency policies configured"
          caption="Frequency policies"
        />
      </Card>

      <div className="mt-stack">
        <Card>
          <CardHeader
            title="How suppression appears in a decision"
            tip={
              <InfoTip label="About the two reason codes">
                FREQUENCY_CAP_BREACHED: contacted too often. COOLDOWN_ACTIVE: the customer declined this offer and its
                rest period has not elapsed. Both name the rule.
              </InfoTip>
            }
          />
          <CardBody>
            <p className="text-body text-content-muted">
              A block still ranks candidates; the trace keeps the full ranking and records why nothing went out.
            </p>
            <p className="mt-3 text-body text-content-muted">
              <strong className="text-content">Where the decline comes from.</strong> The platform
              does not record rejections of its own — the outcome funnel runs impression, click,
              acceptance, conversion, and has no negative event in it. The caller states the decline
              on the request, the same way it states how many times it has already made contact.
              Rest periods apply to the offer that was declined, not to everything the rule covers.
            </p>
          </CardBody>
        </Card>
      </div>
    </PageBody>
  );
}

export default function FrequencyPolicyPage() {
  return (
    <RequireAuth>
      <FrequencyPolicyView />
    </RequireAuth>
  );
}
