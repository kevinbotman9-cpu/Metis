'use client';

import Link from 'next/link';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/components/ui/primitives';
import { useFormat } from '@/components/tenant-format';
import { CODE_MEANING } from '@/components/trace-cascade';
import { pct } from '@/lib/loop';
import { ENTERED, STAGE_LABEL, reaching, stageOf, type FunnelView } from '@/lib/policy-funnel';
import type { PolicyFunnelReportDto, PolicyFunnelRuleDto } from '@/lib/api-client';

/**
 * The panes of the policy funnel Cascade: the whole funnel before a stage is
 * chosen, the chosen stage by rule, and the evidence for it. The rail is
 * `CascadeRail`; the view model is `lib/policy-funnel.ts`.
 *
 * Every figure a rule carries links to a decision it removed a candidate from,
 * because a count of removals nobody can open is a number to take on trust.
 */

const th = 'px-cell py-2 text-label font-semibold text-content-subtle';

/** Said above the panes when the stages are not a decomposition. Absent when they are. */
export function FunnelUnaccounted({ report }: { report: PolicyFunnelReportDto }) {
  const format = useFormat();
  if (report.unaccounted === 0) return null;
  return (
    <p role="alert" className="mb-stack rounded border border-block/40 bg-block-subtle px-3 py-2 text-body text-block">
      {format.number(report.unaccounted)} {report.unaccounted === 1 ? 'decision does' : 'decisions do'} not add up:
      removals and winner are not the candidates considered. Until they do, the stages below are not a
      decomposition.
    </p>
  );
}

export function FunnelRailFoot() {
  return <>Counts candidates, not decisions. Each is removed once, or offered.</>;
}

function RuleName({ rule }: { rule: PolicyFunnelRuleDto }) {
  if (rule.ruleId) return <code className="font-mono text-label text-content">{rule.ruleId}</code>;
  return <span className="text-label text-content-muted">{CODE_MEANING[rule.code] ?? rule.code}</span>;
}

/** The funnel whole, before any stage is chosen. */
export function FunnelFirstPaint({ report, view }: { report: PolicyFunnelReportDto; view: FunnelView }) {
  const format = useFormat();
  const largest = view.largest;
  const top = largest?.rules[0];

  return (
    <Card>
      <CardHeader title="Where candidates fall out" />
      <CardBody>
        <p className="text-body text-content">
          {format.number(report.entered)} candidates entered over {format.number(report.decisions)} decisions, and{' '}
          {format.number(report.offered)} were offered.
        </p>
        {largest ? (
          <p className="mt-2 text-body text-content">
            The largest drop is <strong>{STAGE_LABEL[largest.id]}</strong>: {format.number(largest.removed)} removed,{' '}
            {pct(largest.removed, report.entered, format)} of everything that entered.
            {top ? (
              <>
                {' '}
                <RuleName rule={top} /> alone removes {format.number(top.removed)}.
              </>
            ) : null}
          </p>
        ) : null}
      </CardBody>
      {/* Scrolls inside its own card. In the three-pane layout the middle column is
          narrow, and a table wider than it ran under the evidence card. */}
      <div className="overflow-x-auto">
      <table className="w-full">
        <caption className="sr-only">Candidates removed at each stage</caption>
        <thead>
          <tr className="border-y border-border">
            <th className={`${th} text-left`}>Stage</th>
            <th className={`${th} text-right`}>Removed</th>
            <th className={`${th} text-right`}>Left</th>
            <th className={`${th} text-right`}>Of those reaching it</th>
          </tr>
        </thead>
        <tbody>
          {report.stages.map((s) => (
            <tr key={s.id} className="border-b border-border last:border-0">
              <td className="px-cell py-cell-y text-body text-content">{STAGE_LABEL[s.id]}</td>
              {s.asked === false ? (
                <td colSpan={3} className="px-cell py-cell-y text-right text-label text-content-subtle">
                  Not asked by these flows
                </td>
              ) : (
                <>
                  <td className="tnum px-cell py-cell-y text-right text-body text-content">{format.number(s.removed)}</td>
                  <td className="tnum px-cell py-cell-y text-right text-body text-content-muted">
                    {format.number(s.survived)}
                  </td>
                  <td className="px-cell py-cell-y text-right text-label text-content-subtle">
                    {pct(s.removed, reaching(report, s.id), format)} removed
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Card>
  );
}

/** The chosen stage, by the rule that removed each candidate. */
export function FunnelStageDetail({ report, stageId }: { report: PolicyFunnelReportDto; stageId: string }) {
  const format = useFormat();

  if (stageId === ENTERED) {
    return (
      <Card>
        <CardHeader
          title={`${format.number(report.entered)} candidates entered`}
          description={`Every offer a flow was allowed to consider, once per decision, over ${format.number(report.decisions)} decisions.`}
        />
      </Card>
    );
  }

  const stage = stageOf(report, stageId);
  if (!stage) return null;
  const reached = reaching(report, stage.id);
  const title = `${STAGE_LABEL[stage.id]}: ${format.number(stage.removed)} removed`;

  if (stage.asked === false) {
    return (
      <Card>
        <CardHeader title={title} />
        <EmptyState
          title="Not asked by these flows"
          description="No flow in range has a node that asks this, so nothing could be removed here."
        />
      </Card>
    );
  }
  if (stage.removed === 0) {
    return (
      <Card>
        <CardHeader title={title} />
        <EmptyState
          title="Asked, and removed nothing"
          description={`${format.number(reached)} candidates reached this stage and every one went on.`}
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={title}
        description={`${pct(stage.removed, reached, format)} of the ${format.number(reached)} that reached it, by the rule that removed them.`}
      />
      <div className="overflow-x-auto">
      <table className="w-full">
        <caption className="sr-only">{`Rules that removed candidates at ${STAGE_LABEL[stage.id]}`}</caption>
        <thead>
          <tr className="border-b border-border">
            <th className={`${th} text-left`}>Rule</th>
            <th className={`${th} text-left`}>Code</th>
            <th className={`${th} text-right`}>Removed</th>
            <th className={`${th} text-right`}>Decisions</th>
            <th className={`${th} text-right`}>
              <span className="sr-only">Evidence</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {stage.rules.map((rule) => (
            <tr key={`${rule.ruleId}:${rule.code}`} className="border-b border-border last:border-0">
              <td className="px-cell py-cell-y">
                <RuleName rule={rule} />
              </td>
              <td className="px-cell py-cell-y">
                <Badge tone="outline">{rule.code}</Badge>
              </td>
              <td className="tnum px-cell py-cell-y text-right text-body text-content">{format.number(rule.removed)}</td>
              <td className="tnum px-cell py-cell-y text-right text-body text-content-muted">
                {format.number(rule.decisions)}
              </td>
              <td className="px-cell py-cell-y text-right">
                <Link
                  href={`/decisions/${rule.sampleDecisionId}`}
                  aria-label={`Open a decision ${rule.ruleId ?? rule.code} removed a candidate from`}
                  className="inline-flex min-h-6 items-center whitespace-nowrap text-label text-accent underline-offset-2 hover:underline"
                >
                  Open a decision
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border py-2">
      <dt className="text-content-muted">{label}</dt>
      <dd className="tnum text-right text-content">{children}</dd>
    </div>
  );
}

/** Evidence for the chosen stage, or for the funnel whole when none is chosen. */
export function FunnelStageEvidence({ report, stageId }: { report: PolicyFunnelReportDto; stageId: string | null }) {
  const format = useFormat();
  const stage = stageId ? stageOf(report, stageId) : undefined;

  if (!stage) {
    return (
      <>
        <h2 className="text-label font-semibold text-content-subtle">
          {stageId === ENTERED ? 'Candidates entered' : 'The funnel'}
        </h2>
        <p className="mt-1 text-body font-semibold text-content">
          {format.number(report.offered)} offered of {format.number(report.decisions)} decisions
        </p>
        <dl className="mt-3 flex flex-col text-label">
          <Row label="Candidates entered">{format.number(report.entered)}</Row>
          <Row label="From">{report.from ? format.date(report.from) : '—'}</Row>
          <Row label="To">{report.to ? format.date(report.to) : '—'}</Row>
          <Row label="Decisions that do not add up">{format.number(report.unaccounted)}</Row>
        </dl>
      </>
    );
  }

  const top = stage.rules[0];
  return (
    <>
      <h2 className="text-label font-semibold text-content-subtle">{STAGE_LABEL[stage.id]}</h2>
      <p className="mt-1 text-body font-semibold text-content">
        {format.number(stage.survived)} left
        {stage.asked === false ? ', not asked' : `, ${format.number(stage.removed)} removed`}
      </p>
      <dl className="mt-3 flex flex-col text-label">
        <Row label="Reason codes">
          <span className="font-mono">{stage.codes.join(', ')}</span>
        </Row>
        <Row label="Asked by these flows">{stage.asked === null ? 'Not known' : stage.asked ? 'Yes' : 'No'}</Row>
        <Row label="Reached it">{format.number(reaching(report, stage.id))}</Row>
        <Row label="Rules that removed any">{format.number(stage.rules.length)}</Row>
      </dl>
      {top ? (
        <Link
          href={`/decisions/${top.sampleDecisionId}`}
          className="mt-4 flex min-h-6 items-center text-label text-accent underline-offset-2 hover:underline"
        >
          Open a decision this stage removed a candidate from
        </Link>
      ) : null}
    </>
  );
}
