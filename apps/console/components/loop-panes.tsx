'use client';

import Link from 'next/link';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Sparkline } from '@/components/ui/health-summary';
import { LoopFlow } from '@/components/loop-flow';
import { useFormat } from '@/components/tenant-format';
import type { Formatter } from '@/lib/format';
import type { ChannelStagesDto, PerformanceRowDto } from '@/lib/api-client';
import { channelLabel, pct, type Loop, type LoopReport } from '@/lib/loop';
import { cn } from '@/lib/cn';

/**
 * The panes of the loop Cascade, shared by `/performance` and the Overview.
 * `docs/METIS_CONSOLE_SPEC.md` §4.7.
 *
 * The rail is `CascadeRail`; the arithmetic is `lib/loop.ts`. These are the
 * middle and right panes: the whole loop before a stage is chosen, the chosen
 * stage, and the evidence for it. Written once so the two screens that draw the
 * loop cannot tell a reader two different things about the same decisions.
 */

/** Minor units in the tenant's currency, or a dash where no outcome carried a value. */
function money(minor: number | null, format: Formatter) {
  if (minor === null) {
    return (
      <span className="text-content-muted" title="No outcome carried a value.">
        —
      </span>
    );
  }
  return <span className="tnum tabular-nums">{format.minor(minor)}</span>;
}

/**
 * A rate, or a dash and the reason it is absent.
 *
 * Over decisions with an outcome, never over decisions offered: dividing 0
 * acceptances by 146 offers gives 0.0%, which reads as "we measured and nobody
 * took it" — the opposite of the truth when no channel reported back.
 */
function Rate({ value, measured }: { value: number | null; measured: number }) {
  const format = useFormat();
  if (value === null) {
    return (
      <span className="text-content-muted" title="No outcome has been recorded, so there is no rate to report.">
        —
      </span>
    );
  }
  return (
    <span className="tnum tabular-nums" title={`Of ${measured} decision(s) with an outcome.`}>
      {format.number(value, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })}
    </span>
  );
}

/** One line under the rail, saying what the whole loop is closed on. */
export function LoopRailFoot({ loop }: { loop: Loop }) {
  if (loop.dead.length === 0) {
    return <>Every channel that offered something delivers it, so the loop is closed end to end.</>;
  }
  return (
    <>
      The loop is <strong className="font-semibold text-content">closed on {loop.population}</strong> and open on{' '}
      {loop.dead.length}. Until a sender exists, every figure below <em>Deliverable</em> describes{' '}
      {loop.population}.
    </>
  );
}

/**
 * A stage larger than the one above it. §4.7: the stages are measuring
 * different populations, so the screen says it is wrong rather than drawing it.
 */
export function LoopInversions({ loop }: { loop: Loop }) {
  const format = useFormat();
  if (loop.inversions.length === 0) return null;
  return (
    <Card className="mb-stack border-block/40">
      <CardBody>
        {loop.inversions.map((i) => (
          <p key={i.stage} className="text-body text-block">
            <strong>{i.stage}</strong> counts {format.number(i.value)}, more than the {format.number(i.aboveValue)} at{' '}
            {i.above}. Each stage is a subset of the one above it, so these two figures are counting different
            decisions, and every rate between them is wrong until that is found.
          </p>
        ))}
      </CardBody>
    </Card>
  );
}

/**
 * The loop whole, before a stage is chosen: realised value against the expected
 * ceiling, the flow with the drop-outs drawn as volume leaving, and three trends.
 */
export function LoopFirstPaint({ data, loop }: { data: LoopReport; loop: Loop }) {
  const format = useFormat();
  const { tail, population, dead, undeliverable } = loop;

  return (
    <>
      <div className="mb-stack grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-label text-content-subtle">Realised value</p>
            <p className="tnum mt-1 text-[1.5rem] font-bold text-content">{money(loop.realised, format)}</p>
            <p className="mt-1 text-label text-content-subtle">from {format.number(data.acted)} acted on</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-label text-content-subtle">Expected, at the ceiling</p>
            <p className="tnum mt-1 text-[1.5rem] font-bold text-content">
              {money(loop.expectedDelivered, format)}
            </p>
            <p className="mt-1 text-label text-content-subtle">
              if all {format.number(data.deliverable ?? 0)} delivered offers had been taken — a bound, not a forecast
            </p>
          </CardBody>
        </Card>
        <Card className={cn(undeliverable > 0 && 'border-block/40')}>
          <CardBody>
            <p className="text-label text-content-subtle">Never had the chance</p>
            <p className={cn('tnum mt-1 text-[1.5rem] font-bold', undeliverable > 0 ? 'text-block' : 'text-content')}>
              {money(loop.expectedUndelivered, format)}
            </p>
            <p className="mt-1 text-label text-content-subtle">
              the same ceiling over the {format.number(undeliverable)} decisions nothing sent
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
            stages={loop.stages.map((s) => ({ id: s.id, label: s.label, value: s.value, broken: Boolean(s.broken) }))}
          />
        </CardBody>
      </Card>

      {/* A surface that leads with a conversion rate computed over decisions
          nobody reported on is the most common way these mislead. */}
      {data.offered > 0 && data.measured === 0 ? (
        <p className="mb-stack rounded border border-hold/40 bg-hold-subtle px-2 py-1.5 text-body text-hold">
          Nothing has been reported back. {format.number(data.offered)} offers were made and no channel has recorded an
          impression, a click or an acceptance against any of them, so every rate here is empty rather than zero.
        </p>
      ) : null}

      {data.measured > 0 && (data.deliverable ?? 0) > data.measured ? (
        <p className="mb-stack text-label text-content-muted">
          {format.number((data.deliverable ?? 0) - data.measured)} of {format.number(data.deliverable ?? 0)} deliverable
          offers have no outcome recorded. Every rate below the break describes the {format.number(data.measured)} that
          do, on {population}, and says nothing about the rest.
        </p>
      ) : null}

      <div className="mb-stack grid gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Decisions per day',
            value: format.number(Math.round(tail.reduce((s, d) => s + d.decisions, 0) / Math.max(1, tail.length))),
            series: tail.map((d) => d.decisions),
            tone: 'accent' as const,
          },
          {
            label: 'Deliverable share',
            value: pct(data.deliverable ?? 0, data.offered, format),
            series: tail.map((d) => d.deliverable),
            tone: 'hold' as const,
          },
          {
            label: `Seen per day · ${population}`,
            value: format.number(Math.round(tail.reduce((s, d) => s + d.seen, 0) / Math.max(1, tail.length))),
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
                {dead.length} {dead.length === 1 ? 'channel decides' : 'channels decide'} and nothing delivers the result.
              </strong>{' '}
              {format.number(undeliverable)} decisions on {dead.map((c) => channelLabel(c.channel)).join(', ')}. Every
              figure below <em>Deliverable</em> in the rail describes {population}.
            </p>
            <p className="mt-2 text-label text-content-subtle">
              W-017 is the adapter and is blocked on W-008 — there is no recipient address in the profile schema.
              ADR-013.
            </p>
            <Link href="/placements" className="mt-3 block text-label text-accent underline-offset-2 hover:underline">
              Open placements →
            </Link>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

function StageTable({
  title,
  description,
  head,
  children,
}: {
  title: string;
  description: string;
  head: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="px-cell py-2 text-left text-label font-semibold text-content-subtle">Channel</th>
            <th className="px-cell py-2 text-right text-label font-semibold text-content-subtle">{head}</th>
            <th className="px-cell py-2 text-right text-label font-semibold text-content-subtle">Of the stage above</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}

function StageRows({
  channels,
  get,
  of,
}: {
  channels: ChannelStagesDto[];
  get: (c: ChannelStagesDto) => number;
  of?: (c: ChannelStagesDto) => number;
}) {
  const format = useFormat();
  return (
    <>
      {channels.map((c) => (
        <tr key={c.channel} className="border-b border-border last:border-0">
          <td className="px-cell py-cell-y">
            <Badge tone={c.delivers ? 'outline' : 'hold'}>{channelLabel(c.channel)}</Badge>
          </td>
          <td className="tnum px-cell py-cell-y text-right text-content-muted">{format.number(get(c))}</td>
          <td className="px-cell py-cell-y text-right text-label text-content-subtle">
            {of ? pct(get(c), of(c), format) : c.delivers ? 'delivered' : 'no sender'}
          </td>
        </tr>
      ))}
    </>
  );
}

/** The selected stage, in the middle pane. */
export function LoopStageDetail({ data, loop, stage }: { data: LoopReport; loop: Loop; stage: string }) {
  const format = useFormat();
  const { population, undeliverable, delivering } = loop;

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
      cell: (r) => (
        <Badge tone={delivering.some((c) => c.channel === r.channel) ? 'outline' : 'hold'}>
          {channelLabel(r.channel)}
        </Badge>
      ),
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
      cell: (r) => money(r.valueMinor, format),
    },
  ];

  switch (stage) {
    case 'decisions':
      return (
        <StageTable
          title={`${format.number(data.decisions)} decisions`}
          description="Every request that reached a decision flow and returned a ranked slate. Each produced a decision record, a chain hash and a replayable trace."
          head="Decisions"
        >
          <StageRows channels={data.channels} get={(c) => c.decisions} />
        </StageTable>
      );
    case 'offered':
      return (
        <StageTable
          title={`${format.number(data.offered)} returned an offer`}
          description="The rest found nothing eligible after targeting policy and frequency. A suppressed decision is a result, not a shortfall."
          head="Offered"
        >
          <StageRows channels={data.channels} get={(c) => c.offered} of={(c) => c.decisions} />
        </StageTable>
      );
    case 'deliverable':
      return (
        <>
          {undeliverable > 0 ? (
            <Card className="mb-stack border-block/40">
              <CardBody>
                <p className="text-body text-content">
                  <strong>The loop breaks here.</strong> {format.number(undeliverable)} of{' '}
                  {format.number(data.offered)} decisions picked an offer on a channel with nothing to send it. They
                  were decided correctly, recorded, and reached nobody — a replay of any of them returns a
                  byte-identical hash confirming a choice that could never have been shown.
                </p>
                <p className="mt-2 text-label text-content-subtle">
                  An adapter is W-017, blocked on W-008: no recipient address exists anywhere in the profile schema.
                  ADR-013.
                </p>
              </CardBody>
            </Card>
          ) : null}
          <StageTable
            title={`${format.number(data.deliverable ?? 0)} could be delivered`}
            description="A channel delivers when a placement on it names something that carries the result to a customer."
            head="Deliverable"
          >
            <StageRows channels={data.channels} get={(c) => c.deliverable} of={(c) => c.offered} />
          </StageTable>
        </>
      );
    case 'seen':
      return (
        <StageTable
          title={`${format.number(data.measured)} were seen`}
          description={`An impression is of an offer somebody could look at. Measured over ${population}, because nothing else was sent.`}
          head="Seen"
        >
          <StageRows channels={data.channels} get={(c) => c.seen} of={(c) => c.deliverable} />
        </StageTable>
      );
    case 'acted':
      return (
        <Card>
          <CardHeader
            title={`${format.number(data.acted)} were acted on`}
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
}

/** Evidence for the selected stage, or for the loop whole when none is. */
export function LoopStageEvidence({ data, loop, stage }: { data: LoopReport; loop: Loop; stage: string | null }) {
  const format = useFormat();
  const selected = loop.stages.find((s) => s.id === stage);

  if (!selected) {
    return (
      <>
        <h2 className="text-label font-semibold uppercase tracking-wide text-content-subtle">The loop</h2>
        <p className="mt-1 text-body font-semibold text-content">
          Closed on {loop.population}, open on {loop.dead.length}
        </p>
        <dl className="mt-3 flex flex-col text-label">
          {data.channels.map((c) => (
            <div key={c.channel} className="flex items-center justify-between border-t border-border py-2">
              <dt className="text-content-muted">{channelLabel(c.channel)}</dt>
              <dd>
                <Badge tone={c.delivers ? 'pass' : 'hold'}>{c.delivers ? 'delivers' : 'no sender'}</Badge>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-label leading-relaxed text-content-subtle">Select a stage to see what it is made of.</p>
      </>
    );
  }

  const valueOf = (c: ChannelStagesDto) =>
    selected.id === 'decisions'
      ? c.decisions
      : selected.id === 'offered'
        ? c.offered
        : selected.id === 'deliverable'
          ? c.deliverable
          : selected.id === 'seen'
            ? c.seen
            : c.acted;

  return (
    <>
      <h2 className="text-label font-semibold uppercase tracking-wide text-content-subtle">{selected.label}</h2>
      <p className="mt-1 text-body font-semibold text-content">
        {format.number(selected.value)} · {selected.note}
      </p>
      <dl className="mt-3 flex flex-col text-label">
        {data.channels.map((c) => (
          <div key={c.channel} className="flex items-center justify-between border-t border-border py-2">
            <dt className={cn('text-content-muted', !c.delivers && 'text-content-subtle')}>
              {channelLabel(c.channel)}
              {!c.delivers ? ' · no sender' : ''}
            </dt>
            <dd className="tnum text-content">{format.number(valueOf(c))}</dd>
          </div>
        ))}
      </dl>
      {selected.id === 'deliverable' ? (
        <Link href="/creatives?view=coverage" className="mt-4 block text-label text-accent underline-offset-2 hover:underline">
          Open the coverage matrix →
        </Link>
      ) : null}
      {selected.id === 'acted' ? (
        <Link href="/decisions" className="mt-4 block text-label text-accent underline-offset-2 hover:underline">
          Open the decisions behind these →
        </Link>
      ) : null}
    </>
  );
}
