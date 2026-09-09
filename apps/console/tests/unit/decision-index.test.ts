import { describe, it, expect } from 'vitest';
import { decisions, findTrace } from '@/mocks/fixtures/decisions';
import { executeAt, DECISION_COUNT } from '@/mocks/fixtures/engine';
import index from '@/mocks/fixtures/decision-index.json';

/**
 * The committed index and the generator have to be the same decisions.
 *
 * The index is what every screen reads; the generator is what produces a trace
 * when somebody opens one. If they drift, the console shows a row whose trace
 * says something else — a grid saying an offer won and a cascade saying nothing
 * survived — and nothing else would catch it, because each half is internally
 * consistent.
 *
 * Latency is the one column not compared. It is a stopwatch reading taken on
 * whichever machine built the file, and asserting it would fail everywhere else.
 */

const rows = index.rows as unknown[][];

describe('the committed decision index matches the generator', () => {
  it('has a row for every decision the generator makes', () => {
    expect(rows.length).toBe(DECISION_COUNT);
    expect(decisions.length).toBe(DECISION_COUNT);
  });

  it('names its columns, so a reordered row cannot pass silently', () => {
    expect(index.columns).toEqual([
      'slot', 'id', 'artifactId', 'artifactVersion', 'customerId', 'timestamp',
      'channel', 'placement', 'winner', 'winnerOfferId', 'candidateCount',
      'totalMs', 'chainHash',
    ]);
  });

  it('carries a slot for every row, each one distinct', () => {
    const slots = rows.map((r) => r[0] as number);
    expect(new Set(slots).size).toBe(slots.length);
    expect(Math.min(...slots)).toBe(0);
    expect(Math.max(...slots)).toBe(DECISION_COUNT - 1);
  });

  it('agrees with the generator on every reproducible column', () => {
    // A deterministic spread rather than all 10,400: re-executing the corpus
    // is the thirteen seconds the index exists to avoid, and a stale row would
    // have to be pathologically unlucky to hide from 400 samples.
    const step = Math.floor(rows.length / 400);
    for (let k = 0; k < rows.length; k += step) {
      const row = rows[k];
      const { trace } = executeAt(row[0] as number);
      const d = trace.decision;

      expect(row[1], `row ${k}: id`).toBe(trace.id);
      expect(row[2], `row ${k}: artifactId`).toBe(d.artifactId);
      expect(row[3], `row ${k}: artifactVersion`).toBe(d.artifactVersion);
      expect(row[4], `row ${k}: customerId`).toBe(d.customerRef);
      expect(row[5], `row ${k}: timestamp`).toBe(d.occurredAt);
      expect(row[6], `row ${k}: channel`).toBe(d.channel);
      expect(row[7], `row ${k}: placement`).toBe(d.placement);
      expect(row[8], `row ${k}: winner`).toBe(d.winner);
      expect(row[9], `row ${k}: winnerOfferId`).toBe(d.winnerOfferId);
      expect(row[10], `row ${k}: candidateCount`).toBe(d.candidateKeys.length);
      expect(row[12], `row ${k}: chainHash`).toBe(trace.chainHash);
    }
  });

  it('resolves a trace for a row, and the trace is that row', () => {
    for (const k of [0, 137, 999, 5000, rows.length - 1]) {
      const row = decisions[k];
      const trace = findTrace(row.id);
      expect(trace, `no trace for ${row.id}`).toBeDefined();
      expect(trace!.winner).toBe(row.winner);
      expect(trace!.channel).toBe(row.channel);
      expect(trace!.timestamp).toBe(row.timestamp);
      expect(trace!.candidateCount).toBe(row.candidateCount);
    }
  });

  it('is sorted newest first, which is how every screen reads it', () => {
    for (let i = 1; i < decisions.length; i += 97) {
      expect(decisions[i - 1].timestamp >= decisions[i].timestamp).toBe(true);
    }
  });

  it('returns nothing for an id it does not hold, rather than throwing', () => {
    expect(findTrace('dec_not_a_real_decision')).toBeUndefined();
  });
});

describe('the seeded tenant has the shape the console spec asks for', () => {
  it('covers 24 months', () => {
    const stamps = decisions.map((d) => d.timestamp).sort();
    const months = new Set(stamps.map((t) => t.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(24);
  });

  it('exercises both outcomes at a rate a demo can show', () => {
    const offered = decisions.filter((d) => d.winner).length;
    const rate = offered / decisions.length;
    // Neither state should be a rounding error. A grid that is all winners
    // shows no governance; one that is nearly all suppressions reads as broken.
    expect(rate).toBeGreaterThan(0.25);
    expect(rate).toBeLessThan(0.75);
  });

  it('spreads decisions across the hours people are actually awake', () => {
    const byHour = new Array(24).fill(0);
    for (const d of decisions) byHour[Number(d.timestamp.slice(11, 13))]++;
    const peak = byHour.indexOf(Math.max(...byHour));
    const trough = byHour.indexOf(Math.min(...byHour));
    expect(peak).toBeGreaterThan(11);
    expect(trough).toBeLessThan(7);
  });

  it('uses more than one flow and more than one channel', () => {
    expect(new Set(decisions.map((d) => d.artifactId)).size).toBeGreaterThan(1);
    expect(new Set(decisions.map((d) => d.channel)).size).toBeGreaterThan(3);
  });
});
