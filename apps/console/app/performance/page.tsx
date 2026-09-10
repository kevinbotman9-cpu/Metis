'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  Field,
} from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Sparkline } from '@/components/ui/health-summary';
import { ProvenanceBanner } from '@/components/ui/provenance-banner';
import { CascadeRail, type CascadeStage } from '@/components/cascade-rail';
import { LoopFlow } from '@/components/loop-flow';
import { apiClient, type PerformanceRowDto, type ChannelStagesDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

/**
 * What happened after the decisions — the loop, read as a Cascade.
 *
 * `docs/METIS_CONSOLE_SPEC.md` §4.7. Five stages, each a subset of the one
 * above: **decisions → offered → deliverable → seen → acted**. The rail carries
 * the shape; the middle pane holds whichever stage is selected; the right pane
 * holds evidence for it.
 *
 * This was four figures in a row until 2026-09-10, and the four hid the thing
 * that matters most about this platform: it decides on five channels and
 * delivers on one. 2,687 of the 3,426 decisions that offered something reached
 * nobody, because the channel that won them has no sender — and the old screen
 * put those beside the ones that were delivered, with the same marker, and
 * offered a click rate over the pair.
 *
 * Three rules the pattern imposes and this screen keeps:
 *
 * **The break is drawn, not smoothed.** `Deliverable` is rendered in the block
 * colour and states the count that fell out. A smaller bar would read as a poor
 * result; a break reads as a broken thing, and only one of those is actionable.
 *
 * **Rates below the break name their population.** Every percentage under
 * `Deliverable` says which channel it describes, in the same line as the
 * number. "19% click rate" over one delivered channel of five is not a click
 * rate for the product.
 *
 * **Selecting a stage never changes the rail.** Losing it on selection turns a
 * decomposition into a drill-down, and the reader loses their place in the
 * whole.
 */

const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  web: 'Web',
  push: 'Push',
  outbound_call: 'Outbound call',
};

/** The trailing window the sparklines and trends describe. */
const WINDOW_DAYS = 30;

function pct(n: number, of: number): string {
  if (of <= 0) return '—';
  return `${((n / of) * 100).toFixed(of > 1000 ? 0 : 1)}%`;
}

function money(minor: number | null) {
  if (minor === null) {
    return (
      <span className="text-content-muted" title="No outcome carried a value.">
        —
      </span>
    );
  }
  return (
    <span className="tnum tabular-nums">
      {(minor / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
    </span>
  );
}

/**
 * A rate, or an em dash and the reason it is absent.
 *
 * Over decisions with an outcome, never over decisions offered: dividing 0
 * acceptances by 146 offers gives 0.0%, which reads as "we measured and nobody
 * took it" — the opposite of the truth when no channel reported back.
 */
function Rate({ value, measured }: { value: number | null; measured: number }) {
  if (value === null) {
    return (
      <span
        className="text-content-muted"
        title="No outcome has been recorded, so there is no rate to report."
      >
        —
      </span>
    );
  }
  return (
    <span className="tnum tabular-nums" title={`Of ${measured} decision(s) with an outcome.`}>
      {(value * 100).toFixed(1)}%
    </span>
  );
}

function PerformanceView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [channel, setChannel] = useState('');
  const [flowId, setFlowId] = useState('');

  // Which stage is open lives in the URL: a colleague should be able to be sent
  // the break rather than told how to reach it.
  const selected = params.get('stage');
  const setSelected = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('stage', id);
    else next.delete('stage');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['performance', channel, flowId],
    queryFn: () =>
      apiClient.getPerformance({
        channel: channel || undefined,
        flowId: flowId || undefined,
      }),
  });

  const flows = useQuery({ queryKey: ['artifacts'], queryFn: () => apiClient.listArtifacts() });
  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: () => apiClient.getTaxonomy() });

  const marginByKey = useMemo(
    () =>
      new Map(
        (taxonomy.data?.offers ?? []).map((o) => [o.key, o.financials.expectedMargin.amount])
      ),
    [taxonomy.data]
  );

  const stages = useMemo<CascadeStage[]>(() => {
    if (!data) return [];
    const tail = data.series.slice(-WINDOW_DAYS);
    const undeliverable = data.offered - (data.deliverable ?? 0);
    const dead = data.channels.filter((c) => !c.delivers && c.offered > 0);

    return [
      {
        id: 'decisions',
        label: 'Decisions made',
        value: data.decisions,
        pct: 100,
        note: `${data.channels.length} channels`,
        series: tail.map((d) => d.decisions),
      },
      {
        id: 'offered',
        label: 'Offered something',
        value: data.offered,
        pct: (data.offered / Math.max(1, data.decisions)) * 100,
        note: `${pct(data.offered, data.decisions)} of decisions`,
        series: tail.map((d) => d.offered),
      },
      {
        id: 'deliverable',
        label: 'Deliverable',
        value: data.deliverable ?? 0,
        pct: ((data.deliverable ?? 0) / Math.max(1, data.decisions)) * 100,
        note: `${pct(data.deliverable ?? 0, data.offered)} of offered`,
        series: tail.map((d) => d.deliverable),
        broken:
          undeliverable > 0
            ? `${undeliverable.toLocaleString('en-GB')} decisions won a slot on a channel nothing delivers — ${dead
                .map((c) => CHANNEL_LABEL[c.channel] ?? c.channel)
                .join(', ')}. They were decided correctly and reached nobody.`
            : undefined,
      },
      {
        id: 'seen',
        label: 'Seen',
        value: data.measured,
        pct: (data.measured / Math.max(1, data.decisions)) * 100,
        note: `${pct(data.measured, data.deliverable ?? 0)} of deliverable`,
        series: tail.map((d) => d.seen),
      },
      {
        id: 'acted',
        label: 'Acted on',
        value: data.acted,
        pct: (data.acted / Math.max(1, data.decisions)) * 100,
        note: `${pct(data.acted, data.measured)} of seen`,
        series: tail.map((d) => d.acted),
      },
    ];
  }, [data]);

  if (isLoading) return <LoadingState label="Joining outcomes to decisions" />;
  if (error || !data) {
    return (
      <ErrorState
        description="Could not build the report."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const delivering = data.channels.filter((c) => c.delivers);
  const dead = data.channels.filter((c) => !c.delivers && c.offered > 0);
  const undeliverable = data.offered - (data.deliverable ?? 0);

  /** The one line every rate under the break has to carry. */
  const population =
    delivering.length === 1
      ? `${CHANNEL_LABEL[delivering[0].channel] ?? delivering[0].channel} only`
      : `${delivering.length} delivered channels`;

  const realised = data.rows.reduce((sum, r) => sum + (r.valueMinor ?? 0), 0);

  /**
   * Expected margin × decisions, for a set of rows.
   *
   * A **ceiling**, and labelled as one everywhere it appears. Expected margin
   * is what an offer is worth if the customer takes it, and arbitration ranks
   * on it; multiplying it by decisions gives what the platform would have made
   * had every single one been accepted, which nothing ever is. It is the only
   * expectation this data supports — there is no propensity in a decision
   * record to weight it by — so it is stated as a bound rather than dressed up
   * as a forecast.
   */
  const ceiling = (rows: PerformanceRowDto[]) =>
    rows.reduce((sum, r) => sum + r.offered * (marginByKey.get(r.action) ?? 0), 0);

  const delivered = data.rows.filter((r) => delivering.some((c) => c.channel === r.channel));
  const undelivered = data.rows.filter((r) => !delivering.some((c) => c.channel === r.channel));

  const columns: Column<PerformanceRowDto>[] = [
    {
      key: 'action',
      header: 'Action',
      sortValue: (r) => r.action,
      cell: (r) => (
        <div className="min-w-0 max-w-[16rem]">
          <Link
            href={`/decisions?action=${encodeURIComponent(r.action)}`}
            className="block truncate text-body text-accent underline-offset-2 hover:underline"
          >
            {r.action}
          </Link>
          <p className="truncate text-label text-content-subtle">{r.flowId}</p>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      width: 'w-28',
      sortValue: (r) => r.channel,
      cell: (r) => {
        const delivers = delivering.some((c) => c.channel === r.channel);
        return (
          <Badge tone={delivers ? 'outline' : 'hold'}>
            {CHANNEL_LABEL[r.channel] ?? r.channel}
          </Badge>
        );
      },
    },
    {
      key: 'offered',
      header: 'Offered',
      width: 'w-24',
      align: 'right',
      sortValue: (r) => r.offered,
      cell: (r) => <span className="tnum text-content-muted">{r.offered}</span>,
    },
    {
      key: 'measured',
      header: 'Seen',
      width: 'w-20',
      align: 'right',
      sortValue: (r) => r.measured,
      cell: (r) => <span className="tnum text-content-muted">{r.measured}</span>,
    },
    {
      key: 'clickRate',
      header: 'Click',
      width: 'w-24',
      align: 'right',
      sortValue: (r) => r.clickRate ?? -1,
      cell: (r) => <Rate value={r.clickRate} measured={r.measured} />,
    },
    {
      key: 'acceptanceRate',
      header: 'Accepted',
      width: 'w-24',
      align: 'right',
      sortValue: (r) => r.acceptanceRate ?? -1,
      cell: (r) => <Rate value={r.acceptanceRate} measured={r.measured} />,
    },
    {
      key: 'value',
      header: 'Realised',
      width: 'w-28',
      align: 'right',
      secondary: true,
      sortValue: (r) => r.valueMinor ?? -1,
      cell: (r) => money(r.valueMinor),
    },
  ];

  const stageRows = (get: (c: ChannelStagesDto) => number, of?: (c: ChannelStagesDto) => number) =>
    data.channels.map((c) => (
      <tr key={c.channel} className="border-b border-border last:border-0">
        <td className="px-cell py-cell-y">
          <Badge tone={c.delivers ? 'outline' : 'hold'}>
            {CHANNEL_LABEL[c.channel] ?? c.channel}
          </Badge>
        </td>
        <td className="tnum px-cell py-cell-y text-right text-content-muted">
          {get(c).toLocaleString('en-GB')}
        </td>
        <td className="px-cell py-cell-y text-right text-label text-content-subtle">
          {of ? pct(get(c), of(c)) : c.delivers ? 'delivered' : 'no sender'}
        </td>
      </tr>
    ));

  const StageTable = ({
    title,
    description,
    head,
    body,
  }: {
    title: string;
    description: string;
    head: string;
    body: React.ReactNode;
  }) => (
    <Card>
      <CardHeader title={title} description={description} />
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="px-cell py-2 text-left text-label font-semibold text-content-subtle">
              Channel
            </th>
            <th className="px-cell py-2 text-right text-label font-semibold text-content-subtle">
              {head}
            </th>
            <th className="px-cell py-2 text-right text-label font-semibold text-content-subtle">
              Of the stage above
            </th>
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </Card>
  );

  const middle = () => {
    switch (selected) {
      case 'decisions':
        return (
          <StageTable
            title={`${data.decisions.toLocaleString('en-GB')} decisions`}
            description="Every request that reached a decision flow and returned a ranked slate. Each produced a decision record, a chain hash and a replayable trace."
            head="Decisions"
            body={stageRows((c) => c.decisions)}
          />
        );
      case 'offered':
        return (
          <StageTable
            title={`${data.offered.toLocaleString('en-GB')} returned an offer`}
            description="The rest found nothing eligible after targeting policy and frequency. A suppressed decision is a result, not a shortfall."
            head="Offered"
            body={stageRows(
              (c) => c.offered,
              (c) => c.decisions
            )}
          />
        );
      case 'deliverable':
        return (
          <>
            <Card className="mb-stack border-block/40">
              <CardBody>
                <p className="text-body text-content">
                  <strong>The loop breaks here.</strong>{' '}
                  {undeliverable.toLocaleString('en-GB')} of {data.offered.toLocaleString('en-GB')}{' '}
                  decisions picked an offer on a channel with nothing to send it. They were decided
                  correctly, recorded, and reached nobody — a replay of any of them returns a
                  byte-identical hash confirming a choice that could never have been shown.
                </p>
                <p className="mt-2 text-label text-content-subtle">
                  An adapter is W-017, blocked on W-008: no recipient address exists anywhere in the
                  profile schema. ADR-013.
                </p>
              </CardBody>
            </Card>
            <StageTable
              title={`${(data.deliverable ?? 0).toLocaleString('en-GB')} could be delivered`}
              description="A channel delivers when a placement on it names something that carries the result to a customer."
              head="Deliverable"
              body={stageRows(
                (c) => c.deliverable,
                (c) => c.offered
              )}
            />
          </>
        );
      case 'seen':
        return (
          <StageTable
            title={`${data.measured.toLocaleString('en-GB')} were seen`}
            description={`An impression is of an offer somebody could look at. Measured over ${population}, because nothing else was sent.`}
            head="Seen"
            body={stageRows(
              (c) => c.seen,
              (c) => c.deliverable
            )}
          />
        );
      case 'acted':
        return (
          <Card>
            <CardHeader
              title={`${data.acted.toLocaleString('en-GB')} were acted on`}
              description={`Clicks, acceptances and conversions, by action. Every rate is over what was measured on ${population} — never over what was decided.`}
            />
            <DataTable
              columns={columns}
              rows={data.rows}
              rowKey={(r) => `${r.action}:${r.channel}:${r.flowId}`}
              defaultSort={{ key: 'offered', dir: 'desc' }}
              caption={`${data.rows.length} action and channel pairs`}
              emptyTitle="Nothing measured yet"
            />
          </Card>
        );
      default:
        return null;
    }
  };

  const evidence = () => {
    const stage = stages.find((s) => s.id === selected);
    if (!stage) {
      return (
        <>
          <h2 className="text-label font-semibold uppercase tracking-wide text-content-subtle">
            The loop
          </h2>
          <p className="mt-1 text-body font-semibold text-content">
            Closed on {population}, open on {dead.length}
          </p>
          <dl className="mt-3 flex flex-col text-label">
            {data.channels.map((c) => (
              <div
                key={c.channel}
                className="flex items-center justify-between border-t border-border py-2"
              >
                <dt className="text-content-muted">{CHANNEL_LABEL[c.channel] ?? c.channel}</dt>
                <dd>
                  <Badge tone={c.delivers ? 'pass' : 'hold'}>
                    {c.delivers ? 'delivers' : 'no sender'}
                  </Badge>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-label leading-relaxed text-content-subtle">
            Select a stage to see what it is made of.
          </p>
        </>
      );
    }
    return (
      <>
        <h2 className="text-label font-semibold uppercase tracking-wide text-content-subtle">
          {stage.label}
        </h2>
        <p className="mt-1 text-body font-semibold text-content">
          {stage.value.toLocaleString('en-GB')} · {stage.note}
        </p>
        <dl className="mt-3 flex flex-col text-label">
          {data.channels.map((c) => {
            const value =
              stage.id === 'decisions'
                ? c.decisions
                : stage.id === 'offered'
                  ? c.offered
                  : stage.id === 'deliverable'
                    ? c.deliverable
                    : stage.id === 'seen'
                      ? c.seen
                      : c.acted;
            return (
              <div
                key={c.channel}
                className="flex items-center justify-between border-t border-border py-2"
              >
                <dt className={cn('text-content-muted', !c.delivers && 'text-content-subtle')}>
                  {CHANNEL_LABEL[c.channel] ?? c.channel}
                  {!c.delivers ? ' · no sender' : ''}
                </dt>
                <dd className="tnum text-content">{value.toLocaleString('en-GB')}</dd>
              </div>
            );
          })}
        </dl>
        {stage.id === 'deliverable' ? (
          <Link
            href="/creatives?view=coverage"
            className="mt-4 block text-label text-accent underline-offset-2 hover:underline"
          >
            Open the coverage matrix →
          </Link>
        ) : null}
        {stage.id === 'acted' ? (
          <Link
            href="/decisions"
            className="mt-4 block text-label text-accent underline-offset-2 hover:underline"
          >
            Open the decisions behind these →
          </Link>
        ) : null}
      </>
    );
  };

  const tail = data.series.slice(-WINDOW_DAYS);
  const overview = () => (
    <>
      <div className="mb-stack grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-label text-content-subtle">Realised value</p>
            <p className="tnum mt-1 text-[1.5rem] font-bold text-content">{money(realised)}</p>
            <p className="mt-1 text-label text-content-subtle">
              from {data.acted.toLocaleString('en-GB')} acted on
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-label text-content-subtle">Expected, at the ceiling</p>
            <p className="tnum mt-1 text-[1.5rem] font-bold text-content">
              {money(ceiling(delivered))}
            </p>
            <p className="mt-1 text-label text-content-subtle">
              if all {(data.deliverable ?? 0).toLocaleString('en-GB')} delivered offers had been
              taken — a bound, not a forecast
            </p>
          </CardBody>
        </Card>
        <Card className="border-block/40">
          <CardBody>
            <p className="text-label text-content-subtle">Never had the chance</p>
            <p className="tnum mt-1 text-[1.5rem] font-bold text-block">
              {money(ceiling(undelivered))}
            </p>
            <p className="mt-1 text-label text-content-subtle">
              the same ceiling over the {undeliverable.toLocaleString('en-GB')} decisions nothing
              sent
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-stack">
        <CardHeader
          title="From decision to outcome"
          description="Bar height is volume. The wedge between two stages is what left the loop there."
        />
        <CardBody>
          <LoopFlow
            stages={stages.map((s) => ({
              id: s.id,
              label: s.label,
              value: s.value,
              broken: Boolean(s.broken),
            }))}
          />
        </CardBody>
      </Card>

      {/* The honest headline, kept from the four-figure version of this screen.
          A surface that leads with a conversion rate computed over decisions
          nobody reported on is the most common way these mislead. */}
      {data.offered > 0 && data.measured === 0 ? (
        <p className="mb-stack rounded border border-hold/40 bg-hold-subtle px-2 py-1.5 text-body text-hold">
          Nothing has been reported back. {data.offered.toLocaleString('en-GB')} offers were made
          and no channel has recorded an impression, a click or an acceptance against any of them,
          so every rate here is empty rather than zero.
        </p>
      ) : null}

      {data.measured > 0 && (data.deliverable ?? 0) > data.measured ? (
        <p className="mb-stack text-label text-content-muted">
          {((data.deliverable ?? 0) - data.measured).toLocaleString('en-GB')} of{' '}
          {(data.deliverable ?? 0).toLocaleString('en-GB')} deliverable offers have no outcome
          recorded. Every rate below the break describes the{' '}
          {data.measured.toLocaleString('en-GB')} that do, on {population}, and says nothing about
          the rest.
        </p>
      ) : null}

      <div className="mb-stack grid gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Decisions per day',
            value: Math.round(
              tail.reduce((s, d) => s + d.decisions, 0) / Math.max(1, tail.length)
            ).toLocaleString('en-GB'),
            series: tail.map((d) => d.decisions),
            tone: 'accent' as const,
          },
          {
            label: 'Deliverable share',
            value: pct(data.deliverable ?? 0, data.offered),
            series: tail.map((d) => d.deliverable),
            tone: 'hold' as const,
          },
          {
            label: `Seen per day · ${population}`,
            value: Math.round(
              tail.reduce((s, d) => s + d.seen, 0) / Math.max(1, tail.length)
            ).toLocaleString('en-GB'),
            series: tail.map((d) => d.seen),
            tone: 'pass' as const,
          },
        ].map((t) => (
          <Card key={t.label}>
            <CardBody>
              <p className="text-label text-content-subtle">{t.label}</p>
              <p className="tnum mt-1 text-[1.25rem] font-bold text-content">{t.value}</p>
              <div className="mt-2">
                <Sparkline values={t.series} label={`${t.label}, last ${tail.length} days`} tone={t.tone} />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {dead.length > 0 ? (
        <Card className="border-block/40">
          <CardHeader title="Wants your attention" description="One thing, and it is structural." />
          <CardBody>
            <p className="text-body text-content">
              <strong>
                {dead.length} channels decide and nothing delivers the result.
              </strong>{' '}
              {undeliverable.toLocaleString('en-GB')} decisions on{' '}
              {dead.map((c) => CHANNEL_LABEL[c.channel] ?? c.channel).join(', ')}. Every figure
              below <em>Deliverable</em> in the rail describes {population}.
            </p>
            <p className="mt-2 text-label text-content-subtle">
              W-017 is the adapter and is blocked on W-008 — there is no recipient address in the
              profile schema. ADR-013.
            </p>
            <Link
              href="/placements"
              className="mt-3 block text-label text-accent underline-offset-2 hover:underline"
            >
              Open placements →
            </Link>
          </CardBody>
        </Card>
      ) : null}
    </>
  );

  return (
    <PageBody>
      <PageHeader
        title="Performance"
        description="The loop, end to end. Each stage is a subset of the one above it, and where it breaks is drawn rather than smoothed."
      />

      <ProvenanceBanner provenance={data.provenance} />

      <p className="mb-stack text-label text-content-subtle">
        {data.from && data.to
          ? `Decisions from ${new Date(data.from).toLocaleDateString('en-GB')} to ${new Date(
              data.to
            ).toLocaleDateString('en-GB')}. `
          : ''}
        Counts are distinct decisions, never events — a channel that fires twice reports once.
      </p>

      <div className="mb-stack flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field label="Channel" htmlFor="perf-channel">
            <Select id="perf-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">All channels</option>
              {data.channels.map((c) => (
                <option key={c.channel} value={c.channel}>
                  {CHANNEL_LABEL[c.channel] ?? c.channel}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-56">
          <Field label="Flow" htmlFor="perf-flow">
            <Select id="perf-flow" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
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
        <EmptyState
          title="Nothing has been decided in this window"
          description="The loop starts at a decision. Narrow the filters or widen the window."
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,19rem)]">
          <Card className="self-start">
            <CascadeRail
              label="The loop"
              stages={stages}
              selected={selected}
              onSelect={setSelected}
              foot={
                <>
                  The loop is <strong className="font-semibold text-content">closed on {population}</strong>{' '}
                  and open on {dead.length}. Until a sender exists, every figure below{' '}
                  <em>Deliverable</em> describes {population}.
                </>
              }
            />
          </Card>

          <div className="min-w-0">{selected ? middle() : overview()}</div>

          <Card className="self-start">
            <CardBody>{evidence()}</CardBody>
          </Card>
        </div>
      )}

      {/* What this screen will not claim. Kept verbatim from the version this
          replaced: it is cited in `docs/CAPABILITIES.md` as the place the
          product says it in its own words, and a rebuild that quietly dropped
          it would have made that row a lie. */}
      <p className="mt-stack text-label text-content-muted">
        Rates are over the decisions someone reported back on, never over the decisions offered —
        dividing by offers nobody reported on turns silence into 0%. A dash means the number does
        not exist rather than being zero. Counting only: attribution and uplift are statistical
        claims, and this platform does not make one it cannot show you the workings for.
      </p>
    </PageBody>
  );
}

export default function PerformancePage() {
  return (
    <RequireAuth>
      <PerformanceView />
    </RequireAuth>
  );
}
