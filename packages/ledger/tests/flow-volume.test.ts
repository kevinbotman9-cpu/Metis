import { describe, it, expect } from 'vitest';
import { buildFlowVolume, flowVolumeDecisionOf, type FlowVolumeDecision, type FlowVolumeGraph } from '../src/flow-volume';
import type { LedgerEntry } from '../src/types';

/**
 * Candidates through one flow, node by node.
 *
 * The claim is that the counts are a decomposition of what each decision
 * recorded: a node's arrivals are the survivors of the nodes before it, its
 * removals are what its step recorded, and an edge carries the survivors of the
 * node it leaves. These cover that, and the ways a sum over a graph gets it
 * wrong — splitting a candidate set at a branch, losing the platform's consent
 * step, and silently absorbing a removal at a node the graph does not have.
 */

const graph: FlowVolumeGraph = {
  nodes: [
    { id: 'src', type: 'source', label: 'Catalogue' },
    { id: 'elig', type: 'filter', label: 'Eligibility' },
    { id: 'freq', type: 'constraint', label: 'Frequency' },
    { id: 'rank', type: 'arbitrate', label: 'Rank' },
  ],
  edges: [
    { from: 'src', to: 'elig' },
    { from: 'elig', to: 'freq' },
    { from: 'freq', to: 'rank' },
  ],
  stepsBefore: { consent: 'rank' },
};

const decision = (
  id: string,
  candidates: number,
  winner: string | null,
  removedAt: Record<string, number>,
  occurredAt = '2026-06-01T12:00:00.000Z'
): FlowVolumeDecision => ({ decisionId: id, occurredAt, candidates, winner, removedAt });

const node = (report: ReturnType<typeof buildFlowVolume>, id: string) => report.nodes.find((n) => n.nodeId === id)!;

describe('volume through a flow', () => {
  it('carries each decision down the nodes in the order given', () => {
    const report = buildFlowVolume(
      [decision('d1', 5, 'a', { elig: 2, freq: 1, rank: 1 }), decision('d2', 5, null, { elig: 5 })],
      graph
    );

    expect(node(report, 'src')).toMatchObject({ entered: 10, removed: 0, survived: 10 });
    expect(node(report, 'elig')).toMatchObject({ entered: 10, removed: 7, survived: 3 });
    expect(node(report, 'freq')).toMatchObject({ entered: 3, removed: 1, survived: 2 });
    // The last node's survivors are the winners.
    expect(node(report, 'rank')).toMatchObject({ entered: 2, removed: 1, survived: 1 });
    expect(report).toMatchObject({ decisions: 2, entered: 10, offered: 1, unplaced: 0 });
  });

  it('gives an edge the survivors of the node it leaves', () => {
    const report = buildFlowVolume([decision('d1', 5, 'a', { elig: 2, freq: 1, rank: 1 })], graph);
    expect(report.edges).toEqual([
      { from: 'src', to: 'elig', volume: 5 },
      { from: 'elig', to: 'freq', volume: 3 },
      { from: 'freq', to: 'rank', volume: 2 },
    ]);
  });

  it('does not split a candidate set at a branch: both edges carry every survivor', () => {
    const branching: FlowVolumeGraph = {
      nodes: [
        { id: 'src', type: 'source', label: 'Catalogue' },
        { id: 'sw', type: 'switch', label: 'Switch' },
        { id: 'a', type: 'filter', label: 'A' },
        { id: 'b', type: 'filter', label: 'B' },
      ],
      edges: [
        { from: 'src', to: 'sw' },
        { from: 'sw', to: 'a' },
        { from: 'sw', to: 'b' },
      ],
    };
    const report = buildFlowVolume([decision('d1', 4, null, { a: 1 })], branching);
    expect(report.edges.filter((e) => e.from === 'sw').map((e) => e.volume)).toEqual([4, 4]);
  });

  it('counts consent the platform applied before the node it precedes, not as unplaced', () => {
    const report = buildFlowVolume([decision('d1', 5, 'a', { elig: 1, consent: 2, rank: 1 })], graph);
    expect(report.platformRemoved).toBe(2);
    expect(report.unplaced).toBe(0);
    expect(node(report, 'freq').survived).toBe(4);
    // Consent removed two between frequency and ranking.
    expect(node(report, 'rank')).toMatchObject({ entered: 2, removed: 1, survived: 1 });
    expect(report.edges.find((e) => e.from === 'freq')!.volume).toBe(4);
  });

  it('counts a removal at a step the graph does not hold, rather than absorbing it', () => {
    const report = buildFlowVolume([decision('d1', 5, null, { elig: 1, retired_node: 3 })], graph);
    expect(report.unplaced).toBe(3);
  });

  it('reports the window of the decisions it summed, and nothing for none', () => {
    const report = buildFlowVolume(
      [
        decision('d1', 1, null, {}, '2026-06-02T00:00:00.000Z'),
        decision('d2', 1, null, {}, '2026-06-01T00:00:00.000Z'),
      ],
      graph
    );
    expect(report.from).toBe('2026-06-01T00:00:00.000Z');
    expect(report.to).toBe('2026-06-02T00:00:00.000Z');
    expect(buildFlowVolume([], graph)).toMatchObject({ decisions: 0, entered: 0, from: null, to: null });
  });
});

describe('a ledger entry as the volume reads it', () => {
  it('counts each step’s denials against that step', () => {
    const entry = {
      decisionId: 'dec_1',
      occurredAt: '2026-06-01T12:00:00.000Z',
      record: {
        decision: {
          candidateKeys: ['a', 'b', 'c'],
          winner: 'a',
          eliminations: [
            { nodeId: 'elig', denials: [{ key: 'b' }], survived: ['a', 'c'] },
            { nodeId: 'freq', denials: [], survived: ['a', 'c'] },
            { nodeId: 'rank', denials: [{ key: 'c' }], survived: ['a'] },
          ],
        },
      },
    } as unknown as LedgerEntry;

    expect(flowVolumeDecisionOf(entry)).toEqual({
      decisionId: 'dec_1',
      occurredAt: '2026-06-01T12:00:00.000Z',
      candidates: 3,
      winner: 'a',
      removedAt: { elig: 1, rank: 1 },
    });
  });
});
