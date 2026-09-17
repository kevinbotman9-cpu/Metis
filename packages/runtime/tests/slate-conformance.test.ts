import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { selectSlate } from '../src/slate';
import { ranking } from '../src/shadow';
import type { DecisionRecord, DeterministicDecision } from '../src/deterministic/types';

/**
 * Every ranking outside the engine agrees with the engine, on the corpus both
 * engines are held to. ADR-020 §6.
 *
 * ADR-019 §8 moved the engine's tie-break from the candidate's name to the
 * flow's declared order. Two places that rank candidates outside the engine —
 * the slate and the shadow comparison — kept the name, each under a comment
 * saying it matched the engine, and stayed green: each had a tie test pinned to
 * its own alphabetical order and nothing comparing it with the engine. This is
 * that comparison.
 *
 * It reads `expected.decision` from `docs/conformance/decision-corpus.json`,
 * which the TypeScript and Kotlin engines must both reproduce byte for byte. A
 * slate is drawn from the record, so a slate over that record is the slate
 * either engine's decision would show — until an engine writes the slate itself
 * (ADR-020 §1), when the slate joins the record and the corpus holds it directly.
 *
 * The order is stated here independently — priority descending, then position
 * in `candidateKeys` — rather than by calling `orderCandidates`, which both
 * implementations now call. A check that reused the function under test would
 * agree with it whatever it did.
 */

const CORPUS = path.resolve(__dirname, '../../../docs/conformance/decision-corpus.json');
const corpus: { cases: { name: string; expected: { id: string; decision: DeterministicDecision } }[] } = JSON.parse(
  fs.readFileSync(CORPUS, 'utf8')
);

/** Survivors and those beaten at the arbitrate step: what a slate is drawn from. */
function finalistsOf(d: DeterministicDecision): string[] {
  const step = [...d.eliminations].reverse().find((s) => s.nodeType === 'arbitrate');
  if (!step) return [];
  return [...step.survived, ...step.denials.filter((x) => x.code === 'NOT_RANKED').map((x) => x.key)];
}

/** True when `a` belongs before `b` by the engine's rule, stated independently. */
function before(d: DeterministicDecision, a: string, b: string): boolean {
  const pa = d.scores[a].priority;
  const pb = d.scores[b].priority;
  if (pa !== pb) return pa > pb;
  return d.candidateKeys.indexOf(a) < d.candidateKeys.indexOf(b);
}

const ranked = corpus.cases
  .map((c) => ({ name: c.name, d: c.expected.decision, finalists: finalistsOf(c.expected.decision) }))
  .filter((c) => c.finalists.length > 1);

/** A tie among finalists whose declared order is not their alphabetical order. */
function tiesAgainstTheAlphabet(d: DeterministicDecision, keys: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (const a of keys) {
    for (const b of keys) {
      if (a < b && d.scores[a].priority === d.scores[b].priority && d.candidateKeys.indexOf(b) < d.candidateKeys.indexOf(a)) {
        pairs.push([b, a]);
      }
    }
  }
  return pairs;
}

describe('the corpus holds the cases this check needs', () => {
  it('has decisions with more than one finalist', () => {
    expect(ranked.length).toBeGreaterThanOrEqual(10);
  });

  it('has a tie the alphabet would break the other way, at the winner and below the runner-up', () => {
    // Without these the checks below pass for a name-based tie-break too.
    const atWinner = ranked.filter((c) =>
      tiesAgainstTheAlphabet(c.d, c.finalists).some(([first]) => first === c.d.arbitration.winner)
    );
    const belowRunnerUp = ranked.filter((c) =>
      tiesAgainstTheAlphabet(c.d, c.finalists).some(
        ([first, second]) =>
          ![c.d.arbitration.winner, c.d.arbitration.runnerUp].includes(first) &&
          ![c.d.arbitration.winner, c.d.arbitration.runnerUp].includes(second)
      )
    );
    expect(atWinner.map((c) => c.name)).toContain('tie on priority breaks by the order the flow declared');
    expect(belowRunnerUp.map((c) => c.name)).toContain('a tie below the runner-up breaks by the order the flow declared');
  });
});

describe('a slate agrees with the decision it is drawn from, at every slot count', () => {
  for (const c of ranked) {
    it(c.name, () => {
      for (let slots = 1; slots <= c.finalists.length + 1; slots++) {
        const slate = selectSlate(c.d, slots);
        const shown = slate.entries.map((e) => e.action);

        expect(shown[0], `slot 1 of ${slots}`).toBe(c.d.arbitration.winner);
        if (slots >= 2) expect(shown[1], `slot 2 of ${slots}`).toBe(c.d.arbitration.runnerUp);
        expect(shown).toHaveLength(Math.min(slots, c.finalists.length));
        expect(slate.unfilled).toBe(Math.max(0, slots - c.finalists.length));
      }

      const order = selectSlate(c.d, c.finalists.length).ranked.map((e) => e.action);
      expect([...order].sort()).toEqual([...c.finalists].sort());
      for (let i = 1; i < order.length; i++) {
        expect(before(c.d, order[i - 1], order[i]), `${order[i - 1]} before ${order[i]}`).toBe(true);
      }
    });
  }
});

describe('the shadow comparison ranks as the engine does', () => {
  for (const c of ranked) {
    it(c.name, () => {
      const record = { id: c.name, decision: c.d } as unknown as DecisionRecord;
      const order = ranking(record);
      for (let i = 1; i < order.length; i++) {
        expect(before(c.d, order[i - 1], order[i]), `${order[i - 1]} before ${order[i]}`).toBe(true);
      }
      // And the finalists within it in the slate's order: the two outside
      // rankings agree with each other, not only with the rule.
      const finalists = new Set(c.finalists);
      expect(order.filter((k) => finalists.has(k))).toEqual(selectSlate(c.d, c.finalists.length).ranked.map((e) => e.action));
    });
  }
});
