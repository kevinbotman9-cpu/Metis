import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { executeAt, DECISION_COUNT } from '@/mocks/fixtures/engine';

/**
 * What the reseed must not move — ADR-019 §9, amended 2026-09-18.
 *
 * The reseed carries ADR-019 §1–7, ADR-020 §1–5, ADR-021 §9's fixture and
 * ADR-022 in full, and every one of them moves every decision id. None of them
 * may move the encoding or the request: where a value came from, what a slate
 * held, what an action is and which caps exist are all outside the input. So
 * three things are held here, against a control captured **once, before the
 * first stage**, and committed — never regenerated, because a control rebuilt
 * from the tree it checks checks nothing:
 *
 * - `canonical-corpus.json`, byte for byte (line endings normalised, Rule 10);
 * - `inputSnapshotHash` on each of the 45 decision-corpus cases that existed
 *   before the reseed, by name — cases the reseed adds have no earlier hash;
 * - `inputSnapshotHash` on all 10,400 seeded decisions, in seed order, as one
 *   digest. Seed order, not decision id: every id moves.
 *
 * It must be green after every stage of the reseed, not only the last.
 *
 * **What it does not hold.** `inputSnapshotHash` hashes `request.input`, and a
 * seeded request carries `contactHistory` and `consent` beside the input, not in
 * it. A change to either leaves this green — found by the bite-proof, whose
 * first mutation (the weekly contact count) did not bite for exactly that
 * reason. Those two are in the chain hash, which the reseed moves anyway.
 */

const root = resolve(__dirname, '../../../..');
const lf = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const control = JSON.parse(lf('docs/conformance/reseed-control.json')) as {
  canonicalCorpus: { file: string; sha256OfLfText: string };
  decisionCorpus: { count: number; inputSnapshotHash: Record<string, string> };
  seeded: { count: number; inputSnapshotHashDigest: string };
};

describe('the reseed control group', () => {
  it('leaves the canonical corpus byte-identical', () => {
    expect(sha(lf(control.canonicalCorpus.file))).toBe(control.canonicalCorpus.sha256OfLfText);
  });

  it('leaves inputSnapshotHash unchanged on every decision-corpus case that existed before it', () => {
    const cases = JSON.parse(lf('docs/conformance/decision-corpus.json')).cases as {
      name: string;
      expected: { inputSnapshotHash: string };
    }[];
    const now = new Map(cases.map((c) => [c.name, c.expected.inputSnapshotHash]));
    const pinned = Object.entries(control.decisionCorpus.inputSnapshotHash);
    expect(pinned).toHaveLength(control.decisionCorpus.count);
    const missing = pinned.filter(([name]) => !now.has(name)).map(([name]) => name);
    const moved = pinned.filter(([name, h]) => now.has(name) && now.get(name) !== h).map(([name]) => name);
    expect(missing, 'a pre-reseed case was removed or renamed').toEqual([]);
    expect(moved, 'the request reached the input snapshot').toEqual([]);
  });

  describe('on the seeded history', () => {
    let hashes: string[];
    beforeAll(() => {
      hashes = Array.from({ length: DECISION_COUNT }, (_, i) => executeAt(i).trace.decision.inputSnapshotHash);
    }, 180_000);

    it('leaves inputSnapshotHash unchanged on all 10,400 seeded decisions, in seed order', () => {
      expect(DECISION_COUNT).toBe(control.seeded.count);
      expect(sha(hashes.join('\n'))).toBe(control.seeded.inputSnapshotHashDigest);
    });
  });
});
