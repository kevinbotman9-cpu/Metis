import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execute } from '../src/deterministic/engine';
import type {
  ExecArtifact,
  CatalogueSnapshot,
  DecisionRequest,
  DeterministicDecision,
} from '../src/deterministic/types';

/**
 * The reference engine, tested against the corpus it generated.
 *
 * Circular only in appearance, for the same reason as the value corpus: the
 * corpus is committed, so this compares today's engine against the recorded
 * output of the day it was built. A change to arbitration, scoping, tie-breaks
 * or the trace shape that moves any hash fails here — and those hashes are
 * decision ids that already exist in stored traces.
 *
 * The same file drives `engines/kotlin`. If both pass, a decision hashed by
 * either engine carries the same chain hash, which is the whole point of
 * having two.
 */

const CORPUS = path.resolve(__dirname, '../../../docs/conformance/decision-corpus.json');

interface Case {
  name: string;
  artifact: ExecArtifact;
  catalogue: CatalogueSnapshot;
  request: DecisionRequest;
  expected: {
    id: string;
    chainHash: string;
    inputSnapshotHash: string;
    catalogueSnapshotHash: string;
    decision: DeterministicDecision;
  };
}

const corpus: { cases: Case[]; algorithm: string } = JSON.parse(
  fs.readFileSync(CORPUS, 'utf8')
);

describe('decision conformance (ADR-003)', () => {
  it('the corpus covers a meaningful set of distinct decisions', () => {
    expect(corpus.algorithm).toBe('sha256');
    expect(corpus.cases.length).toBeGreaterThanOrEqual(20);

    // Two cases sharing a chain hash means one is not exercising what its name
    // claims, and the suite would look bigger than it is.
    const hashes = new Set(corpus.cases.map((c) => c.expected.chainHash));
    expect(hashes.size).toBe(corpus.cases.length);
  });

  /**
   * A reason code the corpus never produces is a code no second engine is held
   * to. Two of the eight shipped that way on the first pass — RELEVANCE_FAILED
   * and SUITABILITY_FAILED — because the corpus had an eligibility case and
   * neither of the other two tiers.
   *
   * The list is written out rather than derived from what the corpus emits,
   * which would pass no matter what it contained.
   */
  it('exercises every reason code, so none ships unverified in a second engine', () => {
    const ALL = [
      'ELIGIBILITY_FAILED',
      'RELEVANCE_FAILED',
      'SUITABILITY_FAILED',
      'FREQUENCY_CAP_BREACHED',
      'CONSENT_WITHHELD',
      'OUT_OF_VALIDITY_WINDOW',
      'NOT_ACTIVE',
      'NOT_RANKED',
    ];
    const seen = new Set<string>();
    for (const c of corpus.cases) {
      for (const e of c.expected.decision.eliminations) {
        for (const d of e.denials) seen.add(d.code);
      }
    }
    expect(ALL.filter((code) => !seen.has(code))).toEqual([]);
  });

  /**
   * The evaluator is only proven by a corpus that runs more than one function
   * through it. With `multiplicative` alone, `expected-value` would be covered
   * by unit tests on the TypeScript side and by nothing at all on the Kotlin
   * side — which is the half that matters, since the whole point of a second
   * engine is that it agrees.
   */
  it('exercises every built-in ranking function', () => {
    const seen = new Set(
      corpus.cases.map((c) => {
        const u = c.expected.decision.arbitration.utility;
        return `${u.id}@${u.version}`;
      })
    );
    expect([...seen].sort()).toEqual(['expected-value@1.0.0', 'multiplicative@1.0.0']);
  });

  for (const c of corpus.cases) {
    it(c.name, () => {
      const trace = execute(c.artifact, c.catalogue, c.request);

      // Compare the decision before the hash: a hash mismatch alone says
      // nothing about which rule moved.
      expect(trace.decision).toEqual(c.expected.decision);
      expect(trace.decision.inputSnapshotHash).toBe(c.expected.inputSnapshotHash);
      expect(trace.decision.catalogueSnapshotHash).toBe(c.expected.catalogueSnapshotHash);
      expect(trace.chainHash).toBe(c.expected.chainHash);
      expect(trace.id).toBe(c.expected.id);
    });
  }

  it('the decision id is a prefix of the chain hash, on every case', () => {
    for (const c of corpus.cases) {
      expect(c.expected.id).toBe(`dec_${c.expected.chainHash.slice(0, 16)}`);
    }
  });
});
