import { describe, it, expect } from 'vitest';
import { stagesFor, groupDenials, labelFor, CODE_MEANING } from '@/components/trace-cascade';
import type { TraceDto, DenialDto } from '@/lib/api-client';

/**
 * The elimination funnel, derived from a trace.
 *
 * The screen this feeds is the design north star — the trace is the hero — and
 * the centre of the demo path, so the arithmetic on it has to be right before
 * anybody looks at the layout.
 *
 * Two properties carry the weight. The rail comes from the flow that actually
 * ran, not from the three-tier model, because flows differ and a fixed rail
 * would show empty stages for nodes a flow does not have. And the removals
 * group by `ruleId`, because the code is a closed set of eight that a whole
 * tier shares — grouping by it produces one group per stage and tells the
 * reader nothing the rail did not already say.
 */

const denial = (key: string, code: string, ruleId: string | null): DenialDto =>
  ({ key, code, ruleId }) as DenialDto;

const trace = (over: Partial<TraceDto> = {}): TraceDto =>
  ({
    id: 'dec_test',
    candidateCount: 22,
    eliminations: [],
    timings: {},
    ...over,
  }) as unknown as TraceDto;

describe('the rail is the flow that ran', () => {
  it('opens on the candidates that entered, which no node reports', () => {
    // `candidateCount` sits on the trace, not in `eliminations`. Without a
    // synthesised first stage the rail would open on the first node's
    // survivors and never say how many were considered.
    const stages = stagesFor(trace({ candidateCount: 22 }));
    expect(stages[0].label).toBe('Candidates entered');
    expect(stages[0].survived).toBe(22);
    expect(stages[0].removed).toBe(0);
  });

  it('has one stage per node, in execution order', () => {
    const stages = stagesFor(
      trace({
        eliminations: [
          { nodeId: 'filter_eligibility', nodeType: 'filter', reason: '', denials: [], survived: ['a', 'b'] },
          { nodeId: 'arbitrate_priority', nodeType: 'arbitrate', reason: '', denials: [], survived: ['a'] },
        ],
      } as Partial<TraceDto>)
    );
    // Entry, then the two nodes, in the order the engine recorded them. Order
    // is meaning here: it is the order the candidates were removed in.
    expect(stages.map((s) => s.nodeId)).toEqual([
      '__entry',
      'filter_eligibility',
      'arbitrate_priority',
    ]);
  });

  it('names the tier from the node id, because the type cannot', () => {
    // `filter_suitability` is `nodeType: 'constraint'` in this tenant's own
    // flow, and `constraint_contact` is also `constraint`. The type says how a
    // node behaves, not which question it answers, so two nodes answering
    // different questions share one. Registered as a gap.
    expect(labelFor('filter_suitability', 'constraint')).toBe('Suitability');
    expect(labelFor('constraint_contact', 'constraint')).toBe('Frequency & suppression');
    expect(labelFor('filter_web_eligibility', 'filter')).toBe('Eligibility');
    expect(labelFor('arbitrate_priority', 'arbitrate')).toBe('Ranked');
  });

  it('shows an unrecognised node as its own id rather than inventing a name', () => {
    // A flow somebody authors tomorrow will have nodes this does not know. A
    // raw identifier on screen reads as unnamed, which is true; a wrong
    // friendly label reads as named, which is worse than useless in a trace.
    expect(labelFor('zz_custom_node', 'filter')).toBe('zz_custom_node');
  });

  it('carries each node’s own timing, and null where none was recorded', () => {
    const stages = stagesFor(
      trace({
        timings: { filter_eligibility: 3 },
        eliminations: [
          { nodeId: 'filter_eligibility', nodeType: 'filter', reason: '', denials: [], survived: [] },
          { nodeId: 'filter_relevance', nodeType: 'filter', reason: '', denials: [], survived: [] },
        ],
      } as Partial<TraceDto>)
    );
    expect(stages[1].ms).toBe(3);
    // Null, not zero. Zero is a measurement; this is the absence of one.
    expect(stages[2].ms).toBeNull();
  });

  it('never loses a candidate between stages', () => {
    // The property the Cascade pattern rests on. Survivors at each node, plus
    // everything removed up to and including it, must equal what entered — a
    // stage that does not conserve candidates means the two figures are
    // counting different populations, which is the defect §4.7 exists to make
    // visible rather than to hide.
    const stages = stagesFor(
      trace({
        candidateCount: 22,
        eliminations: [
          {
            nodeId: 'filter_eligibility',
            nodeType: 'filter',
            reason: '',
            denials: [denial('a', 'ELIGIBILITY_FAILED', 'pol_x'), denial('b', 'ELIGIBILITY_FAILED', 'pol_x')],
            survived: Array.from({ length: 20 }, (_, i) => `s${i}`),
          },
          {
            nodeId: 'arbitrate_priority',
            nodeType: 'arbitrate',
            reason: '',
            denials: Array.from({ length: 19 }, (_, i) => denial(`s${i}`, 'NOT_RANKED', null)),
            survived: ['s19'],
          },
        ],
      } as Partial<TraceDto>)
    );

    let removedSoFar = 0;
    for (const stage of stages) {
      removedSoFar += stage.removed;
      expect(
        stage.survived + removedSoFar,
        `${stage.nodeId}: ${stage.survived} survived + ${removedSoFar} removed`
      ).toBe(22);
    }
  });
});

describe('removals group by the rule that made them', () => {
  it('groups by ruleId, not by code', () => {
    // Three removals, one code, three different rules. Grouping by code gives
    // one useless group; grouping by rule names three things somebody can go
    // and change.
    const groups = groupDenials([
      denial('a', 'RELEVANCE_FAILED', 'pol_not_on_5g'),
      denial('b', 'RELEVANCE_FAILED', 'pol_heavy_user'),
      denial('c', 'RELEVANCE_FAILED', 'pol_heavy_user'),
    ]);
    expect(groups.map((g) => g.ruleId)).toEqual(['pol_heavy_user', 'pol_not_on_5g']);
    expect(groups[0].keys).toEqual(['b', 'c']);
  });

  it('puts the rule that removed most first', () => {
    const groups = groupDenials([
      denial('a', 'ELIGIBILITY_FAILED', 'pol_small'),
      denial('b', 'ELIGIBILITY_FAILED', 'pol_big'),
      denial('c', 'ELIGIBILITY_FAILED', 'pol_big'),
      denial('d', 'ELIGIBILITY_FAILED', 'pol_big'),
    ]);
    expect(groups[0]).toMatchObject({ ruleId: 'pol_big' });
    expect(groups[0].keys).toHaveLength(3);
  });

  it('groups under the code where no rule is identifiable', () => {
    // `ruleId` is null for codes that are properties of the candidate rather
    // than of a rule — the spec says so and requires the key to be present
    // rather than omitted. `NOT_RANKED` is the common one, and it is not a
    // fault: it passed every gate and was beaten.
    const groups = groupDenials([
      denial('a', 'NOT_RANKED', null),
      denial('b', 'NOT_RANKED', null),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ruleId).toBeNull();
    expect(groups[0].codes).toEqual(['NOT_RANKED']);
    expect(CODE_MEANING.NOT_RANKED).toMatch(/not a fault/i);
  });

  it('keeps a rule and a ruleless code apart', () => {
    const groups = groupDenials([
      denial('a', 'ELIGIBILITY_FAILED', 'pol_x'),
      denial('b', 'NOT_RANKED', null),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('explains every code the spec declares', () => {
    // The enum is closed and the screen renders the meaning beside the code.
    // A code with no entry would render blank at exactly the moment somebody
    // is asking why an offer was refused.
    for (const code of [
      'ELIGIBILITY_FAILED',
      'RELEVANCE_FAILED',
      'SUITABILITY_FAILED',
      'FREQUENCY_CAP_BREACHED',
      'CONSENT_WITHHELD',
      'OUT_OF_VALIDITY_WINDOW',
      'NOT_ACTIVE',
      'NOT_RANKED',
    ]) {
      expect(CODE_MEANING[code], `${code} has no meaning on screen`).toBeTruthy();
    }
  });
});
