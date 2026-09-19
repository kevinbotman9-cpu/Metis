'use client';

import { InfoTip } from '@/components/ui/tooltip';
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
import {
  EvidenceAction,
  EvidenceFields,
  EvidenceLabel,
  EvidencePick,
  EvidenceQuote,
  EvidenceRow,
} from '@/components/ui/evidence';

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

/**
 * One line under the rail, saying what the whole loop is closed on — or nothing,
 * when the Deliverable stage's own pass-through already says it.
 *
 * `railFootOf` is what a screen should call: a foot that repeats the stage above
 * it is the duplication the Overview's evidence pane was cut for (2026-09-17).
 */
export function railFootOf(loop: Loop): React.ReactNode | undefined {
  const deliverable = loop.stages.find((s) => s.id === 'deliverable');
  if (loop.dead.length === 0 && deliverable?.passThrough) return undefined;
  return <LoopRailFoot loop={loop} />;
}

export function LoopRailFoot({ loop }: { loop: Loop }) {
  if (loop.stages[0]?.value === 0) {
    return <>Nothing has been decided yet, so every stage reads zero.</>;
  }
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
export function LoopFirstPaint({
  data,
  loop,
  dense = false,
}: {
  data: LoopReport;
  loop: Loop;
  /**
   * The Overview's shape, decided by the product owner on 2026-09-17: one row of
   * six cards instead of two of three, and nothing the rail beside it already
   * says. It removes 300px of the Overview's scroll.
   *
   * `/performance` keeps the fuller shape. It is the screen a marketer reads to
   * quote a rate, and two of the sentences dropped here are asserted there on
   * purpose — the coverage sentence ("Every rate below the break describes…")
   * and the channel card. Nothing is lost on the Overview: the rail carries the
   * break and the population beneath it.
   */
  dense?: boolean;
}) {
  const format = useFormat();
  const { tail, population, dead, undeliverable } = loop;

  /**
   * The three per-day cards, or none.
   *
   * One day of history is not a trend: the sparkline says "one day so far" and
   * the figures repeat the rail — 12 decisions, 8 seen, 100% deliverable, all
   * of them already one row to the left. A card that cannot say anything stands
   * down, which is the rule the pass-through stage follows. Decided by the
   * product owner on 2026-09-17, from a hand-made tenant.
   */
  const trends = tail.length < 2 ? [] : [
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
        <p className="tnum mt-1 text-figure font-semibold text-content">{t.value}</p>
        <div className="mt-2">
          <Sparkline values={t.series} label={`${t.label}, last ${tail.length} days`} tone={t.tone} />
        </div>
      </CardBody>
    </Card>
  ));

  return (
    // Dense: a full-height column, so the funnel below the cards takes the
    // height they leave instead of the pane stretching around a fixed drawing.
    <div className={cn(dense && 'flex h-full min-h-0 flex-col')}>
      {/*
        One accent on the page, and it is not this card.

        Realised value held it from 2026-09-17, on the argument that the loop
        exists to move this number. Measured against the screen: the figure is a
        dash whenever nothing carried a value, and drawn plain below
        `REALISED_FLOOR` (ADR-023 §3) — so on the seeded tenant and on every
        hand-made one the page had no visible accent at all. The product owner
        moved it the same day to the funnel's largest drop, which is present
        whenever anything has been decided and is the loss a person can act on
        (ADR-023 §3, amended).

        The card keeps the floor: above it the figure can be read as a return,
        below it the line says it cannot. That distinction is the card's job;
        the colour was not doing it.
      */}
      {/* Dense: the six cards share one row, which is what took 300px out of the
          Overview's scroll. Three abreast on a laptop, six on a wide screen.
          Six columns only when there are six cards: with no trend cards the
          three sat in half a row of six, wrapped every line, and stood 156px
          tall at 1440x900 — height the funnel below needed (2026-09-18). */}
      <div className={cn('mb-stack grid gap-3 sm:grid-cols-3', dense && trends.length > 0 && 'xl:grid-cols-6')}>
        <Card>
          <CardBody>
            <p className="text-label text-content-subtle">Realised value</p>
            <p className="tnum mt-1 text-figure font-semibold text-content">{money(loop.realised, format)}</p>
            <p className="mt-1 text-label text-content-subtle">{loop.realisedLine}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-label text-content-subtle">Expected, at the ceiling</p>
            <p className="tnum mt-1 text-figure font-semibold text-content">
              {money(loop.expectedDelivered, format)}
            </p>
            {/* No sentence under the figure, by the product owner's decision
                (2026-09-18): the one it had explained the method rather than
                telling anyone anything. The title says it is a ceiling. */}
          </CardBody>
        </Card>
        <Card className={cn(undeliverable > 0 && 'border-block/40')}>
          <CardBody>
            <p className="text-label text-content-subtle">Never had the chance</p>
            <p className={cn('tnum mt-1 text-figure font-semibold', undeliverable > 0 ? 'text-block' : 'text-content')}>
              {money(loop.expectedUndelivered, format)}
            </p>
            {/* No sentence under the figure either (2026-09-18, as above). */}
          </CardBody>
        </Card>
        {dense ? trends : null}
      </div>

      {/* Last on the dense page, so it carries no bottom margin — and it takes
          the height the cards above it leave, rather than sitting at a fixed
          height inside a card that stretched around it. */}
      <Card className={cn(dense ? 'flex min-h-0 flex-1 flex-col' : 'mb-stack')}>
        <CardHeader
          title="From decision to outcome"
          // The tip said "bar height is volume; the wedge is what left the loop
          // there", which the drawing says by being the drawing. Kept where the
          // reader is quoting figures, dropped where they are scanning.
          tip={
            dense ? undefined : (
              <InfoTip label="About the flow diagram">
                Bar height is volume. The wedge between two stages is what left the loop there.
              </InfoTip>
            )
          }
        />
        <CardBody className={cn(dense && 'relative min-h-0 flex-1')}>
          {/* Dense: the drawing sits inside the card's padding. Absolute, it
              covered the padding too, and once it filled the card's width it
              ran to the card's edges (2026-09-18). */}
          <div className={cn(dense && 'absolute inset-card')}>
            <LoopFlow
              stages={loop.stages.map((s) => ({
                id: s.id,
                label: s.label,
                value: s.value,
                broken: Boolean(s.broken),
                // The rail's own tone for the stage, so the two are one object.
                tone: s.tone ?? 'neutral',
              }))}
              dense={dense}
              accentStage={loop.accentStage}
            />
          </div>
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

      {/* The population every rate below the break describes. Asserted on
          `/performance` on purpose (`performance-cascade.spec.ts`,
          `outcome-loop.spec.ts`); on the Overview the rail's foot carries it. */}
      {!dense && data.measured > 0 && (data.deliverable ?? 0) > data.measured ? (
        <p className="mb-stack text-label text-content-muted">
          {format.number((data.deliverable ?? 0) - data.measured)} of {format.number(data.deliverable ?? 0)} deliverable
          offers have no outcome recorded. Every rate below the break describes the {format.number(data.measured)} that
          do, on {population}, and says nothing about the rest.
        </p>
      ) : null}

      {dense ? null : <div className="mb-stack grid gap-3 sm:grid-cols-3">{trends}</div>}

      {/* The same break the rail draws in the block colour, with the schema
          reason and a way out. Dropped where the rail is beside it. */}
      {!dense && dead.length > 0 ? (
        <Card className="border-block/40">
          <CardHeader title="Wants your attention" />
          <CardBody>
            <p className="text-body text-content">
              <strong>
                {dead.map((c) => channelLabel(c.channel)).join(', ')} {dead.length === 1 ? 'decides' : 'decide'} and
                nothing sends:
              </strong>{' '}
              no recipient address in the profile schema. Figures below <em>Deliverable</em> describe {population}.
            </p>
            <Link href="/placements" className="mt-3 block text-label text-accent underline-offset-2 hover:underline">
              Open placements →
            </Link>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function StageTable({
  title,
  description,
  tip,
  head,
  children,
}: {
  title: string;
  description?: string;
  tip?: React.ReactNode;
  head: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} tip={tip} />
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
  const { population, delivering } = loop;

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
          head="Decisions"
        >
          <StageRows channels={data.channels} get={(c) => c.decisions} />
        </StageTable>
      );
    case 'offered':
      return (
        <StageTable
          title={`${format.number(data.offered)} returned an offer`}
          head="Offered"
        >
          <StageRows channels={data.channels} get={(c) => c.offered} of={(c) => c.decisions} />
        </StageTable>
      );
    case 'deliverable':
      return (
        <>
          <StageTable
            title={`${format.number(data.deliverable ?? 0)} could be delivered`}
            tip={
              <InfoTip label="About deliverable">
                A channel delivers when a placement on it names something that carries the result to a customer.
              </InfoTip>
            }
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
          description={`Measured on ${population}.`}
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
            description={`Rates are over decisions measured on ${population}, not decisions made.`}
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

/**
 * Evidence for the selected stage, or for the loop whole when none is.
 *
 * Its quote is a sentence the loop already derives, never one written here: the
 * break's own statement from `lib/loop.ts`, and for the stages below it the
 * population their rates describe. A stage with nothing to add has no quote.
 */
export function LoopStageEvidence({ data, loop, stage }: { data: LoopReport; loop: Loop; stage: string | null }) {
  const format = useFormat();
  const selected = loop.stages.find((s) => s.id === stage);
  const breakStage = loop.stages.find((s) => s.broken);

  if (!selected) {
    return (
      <>
        <EvidenceLabel>The loop</EvidenceLabel>
        <EvidencePick>{loop.closure}</EvidencePick>
        {breakStage?.broken ? (
          <EvidenceQuote title="Where the loop breaks" tone="block">
            {breakStage.broken}
          </EvidenceQuote>
        ) : null}
        {/* Neutral, beside the red: drop-off is not a defect. `lib/loop.ts` says when it speaks. */}
        {loop.losesMost.kind !== 'nothing' ? (
          <EvidenceQuote title="Where it loses most" tone="neutral">
            {loop.losesMost.sentence}
            {loop.losesMost.kind === 'stage' && loop.losesMost.unreported ? <> {loop.losesMost.unreported}</> : null}
          </EvidenceQuote>
        ) : null}
        {/* "Why the rest offered nothing" moved onto the Offered stage in the
            rail on 2026-09-17: the cause belongs on the stage that dropped, and
            saying it twice on one screen is what the Overview's pane was cut for. */}
        <EvidenceFields>
          {data.channels.map((c) => (
            <EvidenceRow key={c.channel} label={channelLabel(c.channel)}>
              <Badge tone={c.delivers ? 'pass' : 'hold'}>{c.delivers ? 'delivers' : 'no sender'}</Badge>
            </EvidenceRow>
          ))}
        </EvidenceFields>
        <p className="mt-3 text-label text-content-subtle">Select a stage to see what it is made of.</p>
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

  const measuredBelow = selected.id === 'seen' || selected.id === 'acted';

  return (
    <>
      <EvidenceLabel>{selected.label}</EvidenceLabel>
      <EvidencePick>
        {format.number(selected.value)} · {selected.note}
      </EvidencePick>
      {selected.broken ? (
        <EvidenceQuote title="Why it breaks here" tone="block">
          {selected.broken}
        </EvidenceQuote>
      ) : selected.passThrough ? (
        <EvidenceQuote title="Why nothing can drop here" tone="neutral">
          {selected.passThrough}
        </EvidenceQuote>
      ) : measuredBelow ? (
        <EvidenceQuote title="What these rates describe" tone="hold">
          Rates are over decisions measured on {loop.population}, not decisions made.
        </EvidenceQuote>
      ) : null}
      <EvidenceFields>
        {data.channels.map((c) => (
          <EvidenceRow key={c.channel} label={`${channelLabel(c.channel)}${c.delivers ? '' : ' · no sender'}`}>
            <span className={cn('tnum', c.delivers ? 'text-content' : 'text-content-subtle')}>
              {format.number(valueOf(c))}
            </span>
          </EvidenceRow>
        ))}
      </EvidenceFields>
      {selected.id === 'deliverable' ? (
        <EvidenceAction href="/creatives?view=coverage" primary sub="Every offer against the channels that deliver it">
          Open the coverage matrix
        </EvidenceAction>
      ) : null}
      {selected.id === 'offered' && loop.offeredNothing ? (
        <EvidenceAction href="/targeting-policies" sub="Which rule removed the candidates, by stage">
          Open the policy funnel
        </EvidenceAction>
      ) : null}
      {selected.id === 'acted' ? (
        <EvidenceAction href="/decisions" sub="Each one opens its trace">
          Open the decisions behind these
        </EvidenceAction>
      ) : null}
    </>
  );
}
