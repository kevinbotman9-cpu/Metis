import type { CascadeStage } from '@/components/cascade-rail';
import type { PolicyFunnelReportDto, PolicyFunnelStageDto } from '@/lib/api-client';
import type { Formatter } from '@/lib/format';
import { pct } from '@/lib/loop';

/**
 * The policy funnel as a Cascade. `docs/METIS_CONSOLE_SPEC.md` §4.7.
 *
 * The report's seven stages are reason codes in the order a decision meets
 * them, summed over decisions; `packages/ledger/src/policy-funnel.ts` says why
 * they nest. This turns them into the rail: an entry stage synthesised from
 * `entered`, then each stage's survivors, with what it removed.
 *
 * No stage is drawn as a break. §4.7 keeps that for volume lost for a
 * structural reason; a policy removing a candidate is the platform doing what
 * it was configured to do, and colouring it as a fault would teach a reader that
 * every targeting rule is a defect.
 */

/** The same words the trace reader uses for the same tiers. */
export const STAGE_LABEL = {
  not_live: 'Live and in date',
  eligibility: 'Eligibility',
  relevance: 'Relevance',
  suitability: 'Suitability',
  consent: 'Consent',
  frequency: 'Frequency & suppression',
  not_ranked: 'Ranked',
} as const satisfies Record<PolicyFunnelStageDto['id'], string>;

/** The synthesised first stage. Not a reason code, so not in the report. */
export const ENTERED = 'entered';

export interface FunnelView {
  stages: CascadeStage[];
  /** The stage that removed the most candidates, or null when none removed any. */
  largest: PolicyFunnelStageDto | null;
}

export function stageOf(report: PolicyFunnelReportDto, id: string): PolicyFunnelStageDto | undefined {
  return report.stages.find((s) => s.id === id);
}

/** Candidates that reached a stage: the survivors of the one above it. */
export function reaching(report: PolicyFunnelReportDto, id: string): number {
  const i = report.stages.findIndex((s) => s.id === id);
  return i <= 0 ? report.entered : report.stages[i - 1].survived;
}

export function buildFunnelView(report: PolicyFunnelReportDto, format: Formatter): FunnelView {
  const stages: CascadeStage[] = [
    {
      id: ENTERED,
      label: 'Candidates entered',
      value: report.entered,
      pct: 100,
      note: `over ${format.number(report.decisions)} decisions`,
    },
  ];

  for (const stage of report.stages) {
    const above = reaching(report, stage.id);
    stages.push({
      id: stage.id,
      label: STAGE_LABEL[stage.id],
      value: stage.survived,
      pct: report.entered > 0 ? (stage.survived / report.entered) * 100 : 0,
      // Said, not left as a full bar with no removals: a stage nobody asks and a
      // stage that asked and removed nothing look identical otherwise.
      note: stage.asked === false ? 'not asked by these flows' : `${pct(stage.survived, above, format)} of the stage above`,
      removed: stage.removed,
    });
  }

  const largest = report.stages.reduce<PolicyFunnelStageDto | null>(
    (best, s) => (s.removed > (best?.removed ?? 0) ? s : best),
    null
  );

  return { stages, largest };
}
