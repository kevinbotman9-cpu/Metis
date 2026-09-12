// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TraceEvidence } from '@/components/trace-evidence';
import type { DenialGroup, TraceStage } from '@/components/trace-cascade';
import type { TraceDto, TargetingPolicyDto } from '@/lib/api-client';

/**
 * The evidence pane's pack attribution, on its own fixture.
 *
 * This is the rebuild of an e2e assertion that walked `/decisions` until it
 * found an affordability refusal and then asserted the pane named "UK Consumer
 * Duty 1.4.0 / pack_uk_consumer_duty". It passed for months because the
 * `telco-uk` tenant happened to install two regulatory packs. `telco-us`
 * installs none — the brief names no pack and the tenant declares no
 * suitability policies — so the e2e went red for a reason that is not a defect,
 * and there is no way for a `@screen-only` test to reach the state by clicking:
 * packs are seeded, and the console has no pack-install screen (G-006).
 *
 * Deleting it would have quietly dropped the only check that the pane attributes
 * a rule to the pack that supplied it. So the fixture comes from here instead of
 * from whichever tenant happens to be loaded, which is what the guard should
 * always have rested on: the component is handed a pack and asked what it says.
 *
 * Three states, because the pane deliberately distinguishes them and two of them
 * are absences. "The artifact has not loaded" and "no pack claims this rule" are
 * different sentences, and a pane that showed a blank for either would read as
 * complete.
 */

afterEach(cleanup);

const POLICY: TargetingPolicyDto = {
  id: 'pol_afford_line',
  name: 'Affordability on a new line',
  tier: 'suitability',
  active: true,
  conditions: [{ field: 'customer.bill_to_income_ratio', operator: 'lte', value: 0.1 }],
} as unknown as TargetingPolicyDto;

const TRACE = {
  id: 'dec_evidence_fixture',
  winner: null,
  candidateCount: 3,
  eliminations: [],
  timings: {},
  sourceBindings: [],
  sourceCalls: [],
} as unknown as TraceDto;

/** The stage and group the pane reads, as the cascade would hand them over. */
const STAGE: TraceStage = {
  nodeId: 'filter_suitability',
  nodeType: 'filter',
  tier: 'suitability',
  label: 'Suitability',
  reason: 'Affordability on a new line removed 1 candidate.',
  removed: 1,
  survived: 2,
  denials: [
    { key: 'fios_gigabit', code: 'SUITABILITY_FAILED', ruleId: 'pol_afford_line' } as never,
  ],
};

const GROUP: DenialGroup = {
  ruleId: 'pol_afford_line',
  codes: ['SUITABILITY_FAILED'],
  keys: ['fios_gigabit'],
};

const pane = (policySources: Record<string, unknown> | null) =>
  render(
    <TraceEvidence
      trace={TRACE}
      stage={STAGE}
      group={GROUP}
      policies={[POLICY]}
      packageVersions={{ '@metis/nodes-core': '1.4.0' }}
      policySources={policySources as never}
    />
  );

describe('the pane names the pack that supplied a rule', () => {
  it('names it, its version and its id', () => {
    pane({
      pol_afford_line: {
        packId: 'pack_consumer_duty',
        name: 'Consumer Duty',
        version: '1.4.0',
      },
    });

    // All three, because each answers a different question a reviewer asks: what
    // rule is this, which release of it ran, and what do I type to find it.
    expect(screen.getByText('Consumer Duty')).toBeTruthy();
    expect(screen.getByText('1.4.0')).toBeTruthy();
    expect(screen.getByText('pack_consumer_duty')).toBeTruthy();
  });

  it('says the tenant authored the rule when no pack claims it', () => {
    pane({});
    expect(screen.getByText(/no installed pack claims this rule/)).toBeTruthy();
    expect(screen.queryByText('pack_consumer_duty')).toBeNull();
  });

  it('says the artifact has not loaded, which is not the same as no pack', () => {
    pane(null);
    expect(screen.getByText(/the artifact has not loaded/)).toBeTruthy();
    expect(screen.queryByText(/no installed pack claims this rule/)).toBeNull();
  });
});
