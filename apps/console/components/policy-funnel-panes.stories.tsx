import type { Meta, StoryObj } from '@storybook/react';
import {
  FunnelFirstPaint,
  FunnelStageDetail,
  FunnelStageEvidence,
  FunnelUnaccounted,
} from './policy-funnel-panes';
import { buildFunnelView } from '@/lib/policy-funnel';
import { formatterFor } from '@/lib/format';
import type { PolicyFunnelReportDto } from '@/lib/api-client';

/**
 * The panes of the policy funnel Cascade — `/targeting-policies?view=funnel`.
 *
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The report is small on purpose and has the seeded tenant's shape rather than
 * its numbers: one flow with eligibility, relevance and a contact constraint and
 * no suitability node, so Suitability is not asked.
 */

const F = formatterFor({ locale: 'en-US', currency: 'USD' });

const rule = (ruleId: string | null, code: string, removed: number, decisions: number) => ({
  ruleId,
  code,
  removed,
  decisions,
  sampleDecisionId: 'dec_a72e674d48ab7cef',
});

const REPORT = {
  decisions: 100,
  entered: 500,
  offered: 45,
  unaccounted: 0,
  from: '2026-08-14T00:00:00.000Z',
  to: '2026-09-12T00:00:00.000Z',
  provenance: { source: 'seed', syntheticCount: 100, recordedCount: 0, note: '' },
  stages: [
    { id: 'not_live', codes: ['NOT_ACTIVE', 'OUT_OF_VALIDITY_WINDOW'], asked: true, removed: 0, survived: 500, rules: [] },
    {
      id: 'eligibility',
      codes: ['ELIGIBILITY_FAILED'],
      asked: true,
      removed: 170,
      survived: 330,
      rules: [rule('pol_5g_coverage', 'ELIGIBILITY_FAILED', 70, 70), rule('pol_fios_serviceable', 'ELIGIBILITY_FAILED', 45, 45), rule('pol_has_broadband', 'ELIGIBILITY_FAILED', 55, 40)],
    },
    {
      id: 'relevance',
      codes: ['RELEVANCE_FAILED'],
      asked: true,
      removed: 230,
      survived: 100,
      rules: [rule('pol_entertainment_affinity', 'RELEVANCE_FAILED', 115, 58), rule('pol_broadband_need_met', 'RELEVANCE_FAILED', 115, 60)],
    },
    { id: 'suitability', codes: ['SUITABILITY_FAILED'], asked: false, removed: 0, survived: 100, rules: [] },
    { id: 'consent', codes: ['CONSENT_WITHHELD'], asked: true, removed: 15, survived: 85, rules: [rule(null, 'CONSENT_WITHHELD', 15, 15)] },
    { id: 'frequency', codes: ['FREQUENCY_CAP_BREACHED', 'COOLDOWN_ACTIVE'], asked: true, removed: 0, survived: 85, rules: [] },
    { id: 'not_ranked', codes: ['NOT_RANKED'], asked: true, removed: 40, survived: 45, rules: [rule(null, 'NOT_RANKED', 40, 40)] },
  ],
} as unknown as PolicyFunnelReportDto;

const VIEW = buildFunnelView(REPORT, F);

const meta: Meta = {
  title: 'Policy/PolicyFunnelPanes',
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj;

/** Before a stage is chosen: the whole funnel, and where it drops most. */
export const FirstPaint: Story = {
  render: () => <FunnelFirstPaint report={REPORT} view={VIEW} />,
};

/** A stage with removals: by rule, largest first, each opening a decision it came from. */
export const RelevanceSelected: Story = {
  render: () => <FunnelStageDetail report={REPORT} stageId="relevance" />,
};

/** A stage no flow asks, said rather than drawn as a stage that kept everyone. */
export const NotAsked: Story = {
  render: () => <FunnelStageDetail report={REPORT} stageId="suitability" />,
};

/** A stage that asked and removed nothing — a different fact from not asking. */
export const AskedAndRemovedNothing: Story = {
  render: () => <FunnelStageDetail report={REPORT} stageId="frequency" />,
};

export const EvidenceWhole: Story = {
  render: () => <FunnelStageEvidence report={REPORT} stageId={null} />,
};

export const EvidenceForAStage: Story = {
  render: () => <FunnelStageEvidence report={REPORT} stageId="eligibility" />,
};

/** Decisions that do not add up: the screen says the stages are not a decomposition. */
export const Unaccounted: Story = {
  render: () => <FunnelUnaccounted report={{ ...REPORT, unaccounted: 3 }} />,
};
