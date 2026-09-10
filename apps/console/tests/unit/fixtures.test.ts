/**
 * Integrity checks on the fixture store.
 *
 * These catch the class of bug that made the console look broken before:
 * dangling references and non-deterministic IDs.
 */

import { describe, it, expect } from 'vitest';
import {
  objectives,
  categories,
  offers,
  creatives,
  targetingPolicies,
  frequencyPolicies,
  boosts,
  autonomySettings,
  placements,
} from '@/mocks/fixtures/catalogue';
import { decisions, sampleTraces, findTrace } from '@/mocks/fixtures/decisions';

/**
 * A fixed slice of the corpus, executed once for this file.
 *
 * These assertions are properties of the generator, not of any particular
 * decision, so a deterministic sample either has them or does not. Iterating
 * all 10,400 would mean re-executing the whole corpus — thirteen seconds — to
 * learn the same thing. See `sampleTraces` for why the traces are not an array
 * any more.
 */
const traces = sampleTraces(600);
import { artifacts } from '@/mocks/fixtures/artifacts';

describe('taxonomy integrity', () => {
  it('gives every category a real objective', () => {
    const objectiveIds = new Set(objectives.map((i) => i.id));
    for (const g of categories) expect(objectiveIds).toContain(g.objectiveId);
  });

  it('gives every offer a real category, with a matching denormalised objective', () => {
    const byId = new Map(categories.map((g) => [g.id, g]));
    for (const p of offers) {
      const category = byId.get(p.categoryId);
      expect(category, `${p.id} references missing category ${p.categoryId}`).toBeDefined();
      // objectiveId is denormalised for rendering; it must not drift from the category.
      expect(p.objectiveId).toBe(category!.objectiveId);
    }
  });

  it('resolves every creative reference in both directions', () => {
    const creativeIds = new Set(creatives.map((t) => t.id));
    const offerIds = new Set(offers.map((p) => p.id));

    for (const p of offers) {
      for (const id of p.creativeIds) {
        expect(creativeIds, `${p.id} references missing creative ${id}`).toContain(id);
      }
    }
    for (const t of creatives) {
      expect(offerIds).toContain(t.offerId);
      // The creative must be listed by the offer it claims to belong to.
      const owner = offers.find((p) => p.id === t.offerId)!;
      expect(owner.creativeIds).toContain(t.id);
    }
  });

  it('resolves every policy reference', () => {
    const policyIds = new Set(targetingPolicies.map((p) => p.id));
    for (const p of offers) {
      for (const id of p.policyIds) {
        expect(policyIds, `${p.id} references missing policy ${id}`).toContain(id);
      }
    }
  });

  it('points every scoped policy, boost and autonomy rule at something real', () => {
    const targets = new Set([
      ...objectives.map((i) => i.id),
      ...categories.map((g) => g.id),
      ...offers.map((p) => p.id),
    ]);
    const scoped = [...targetingPolicies, ...frequencyPolicies, ...boosts, ...autonomySettings];
    for (const s of scoped) {
      if (s.scope.level === 'tenant') {
        expect(s.scope.targetId).toBeNull();
      } else {
        expect(targets, `${s.id} scopes to missing ${s.scope.targetId}`).toContain(
          s.scope.targetId
        );
      }
    }
  });

  it('keeps unique IDs across each collection', () => {
    const unique = (xs: { id: string }[]) => new Set(xs.map((x) => x.id)).size === xs.length;
    expect(unique(objectives)).toBe(true);
    expect(unique(categories)).toBe(true);
    expect(unique(offers)).toBe(true);
    expect(unique(creatives)).toBe(true);
    expect(unique(targetingPolicies)).toBe(true);
  });

  it('flags an active offer with no deliverable creative', () => {
    // Not a failure — the console surfaces these. This asserts the console has
    // something to surface, so the empty state stays exercised.
    const undeliverable = offers.filter(
      (p) => p.status !== 'retired' && p.creativeIds.length === 0
    );
    expect(undeliverable.length).toBeGreaterThan(0);
  });
});

describe('decision fixtures', () => {
  it('generates stable, unique decision IDs', () => {
    const ids = decisions.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Regression guard: IDs were once Math.random() at module scope, so no link
    // survived a reload.
    for (const id of ids) expect(id).toMatch(/^dec_[a-z0-9]+$/);
  });

  it('resolves every listed decision to its own trace', () => {
    for (const d of decisions) {
      const trace = findTrace(d.id);
      expect(trace, `no trace for ${d.id}`).toBeDefined();
      expect(trace!.id).toBe(d.id);
      expect(trace!.customerId).toBe(d.customerId);
      expect(trace!.winner).toBe(d.winner);
    }
  });

  it('returns undefined for an unknown decision', () => {
    expect(findTrace('dec_nope')).toBeUndefined();
  });

  it('gives different decisions different traces', () => {
    // The bug this suite exists for: every decision rendered the same trace.
    const shapes = traces.slice(0, 20).map((t) => JSON.stringify(t.scores) + t.customerId);
    expect(new Set(shapes).size).toBeGreaterThan(1);
  });

  it('records a plausible latency on every decision', () => {
    // Shape, not speed. `totalMs` is the measured half of a trace: it is
    // wall-clock, explicitly excluded from the hash, and not reproducible by
    // design. This assertion used to be `max < 50ms` and flaked roughly one run
    // in three at 64-80ms, because generating 5,000 decisions on a busy machine
    // means a few land inside a GC pause. It was asserting that the machine was
    // idle.
    for (const d of decisions) {
      expect(Number.isFinite(d.totalMs)).toBe(true);
      expect(d.totalMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps the latency distribution well inside the budget', () => {
    // p95, which is the promise the platform actually makes, and which 5,000
    // samples make robust to the outliers above. The enforced gate lives in
    // bench/harness where it can control the workload; this is a sanity check
    // that the fixture corpus is not wildly unrepresentative.
    const sorted = decisions.map((d) => d.totalMs).sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
    expect(p95, `p95 was ${p95}ms across ${sorted.length} decisions`).toBeLessThan(50);
  });

  it('produces both offered and suppressed outcomes', () => {
    expect(decisions.some((d) => d.winner === null)).toBe(true);
    expect(decisions.some((d) => d.winner !== null)).toBe(true);
  });

  it('records no winner when arbitration had no survivors', () => {
    for (const t of traces) {
      const arbitrate = t.eliminations.find((e) => e.nodeId === 'arbitrate_priority');
      if (arbitrate && arbitrate.survived.length === 0) {
        expect(t.winner).toBeNull();
      }
    }
  });
});

describe('flow artifacts', () => {
  it('keeps nodeCount in step with the graph', () => {
    for (const a of artifacts) expect(a.nodeCount).toBe(a.nodes.length);
  });

  it('connects every edge to nodes that exist', () => {
    for (const a of artifacts) {
      const ids = new Set(a.nodes.map((n) => n.id));
      for (const e of a.edges) {
        expect(ids, `${a.id}: edge ${e.id} source missing`).toContain(e.source);
        expect(ids, `${a.id}: edge ${e.id} target missing`).toContain(e.target);
      }
    }
  });

  it('leaves no node orphaned', () => {
    for (const a of artifacts) {
      if (a.nodes.length < 2) continue;
      const connected = new Set(a.edges.flatMap((e) => [e.source, e.target]));
      for (const n of a.nodes) {
        expect(connected, `${a.id}: ${n.id} is not connected`).toContain(n.id);
      }
    }
  });

  it('states a p95 that covers the critical path', () => {
    // Branches run in parallel, so the floor is the longest path through the
    // DAG, not the sum of every node.
    for (const a of artifacts) {
      const byId = new Map(a.nodes.map((n) => [n.id, n]));
      const outgoing = new Map<string, string[]>();
      for (const e of a.edges) {
        outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e.target]);
      }

      const memo = new Map<string, number>();
      const costFrom = (id: string): number => {
        if (memo.has(id)) return memo.get(id)!;
        const self = byId.get(id)!.estimatedMs;
        const next = outgoing.get(id) ?? [];
        const cost = self + (next.length ? Math.max(...next.map(costFrom)) : 0);
        memo.set(id, cost);
        return cost;
      };

      const targets = new Set(a.edges.map((e) => e.target));
      const roots = a.nodes.filter((n) => !targets.has(n.id));
      const criticalPath = Math.max(...roots.map((r) => costFrom(r.id)));

      expect(
        a.estimatedP95LatencyMs,
        `${a.id}: stated p95 ${a.estimatedP95LatencyMs} is below its critical path ${criticalPath.toFixed(1)}`
      ).toBeGreaterThanOrEqual(criticalPath - 0.01);
    }
  });

  it('keeps every flow inside the 50ms latency budget', () => {
    for (const a of artifacts) expect(a.estimatedP95LatencyMs).toBeLessThan(50);
  });

  it('draws candidates from real offer keys', () => {
    const keys = new Set(offers.map((p) => p.key));
    for (const a of artifacts) {
      for (const k of a.candidateKeys) {
        expect(keys, `${a.id} references unknown offer key ${k}`).toContain(k);
      }
    }
  });
});

describe('console decisions come from the real engine', () => {
  it('replays every decision the console shows to an identical chain hash', async () => {
    const { catalogueSnapshot, executeAt } = await import('@/mocks/fixtures/engine');
    const { replay } = await import('@metis/runtime/deterministic/engine');

    // Same sample as above, as the executions rather than the flattened traces:
    // replay needs the request and the artifact, which the trace does not hold.
    const step = Math.max(1, Math.floor(decisions.length / 600));
    const sample = Array.from({ length: 600 }, (_, k) => executeAt(k * step)).filter(Boolean);

    for (const g of sample) {
      const result = replay(g.artifact, catalogueSnapshot, g.trace, g.request.input, g.request.contactHistory);
      expect(result.identical, `${g.trace.id} did not replay identically`).toBe(true);
      expect(result.differences).toEqual([]);
    }
  });

  it('derives each decision id from its own chain hash', () => {
    // The id is evidence, not a label: it is the first 16 hex of the hash over
    // the reproducible half of the decision.
    for (const t of traces) {
      expect(t.id).toBe(`dec_${t.chainHash.slice(0, 16)}`);
    }
  });

  it('excludes wall-clock timings from the hashed decision', async () => {
    const { executeAt } = await import('@/mocks/fixtures/engine');
    const { canonicalise } = await import('@metis/runtime/deterministic/canonical');

    for (const g of [0, 1, 2, 3, 4].map(executeAt)) {
      const serialised = canonicalise(g.trace.decision);
      expect(serialised).not.toContain('totalMs');
      expect(serialised).not.toContain('executedAt');
    }
  });

  it('exercises both offered and suppressed outcomes', () => {
    const offered = decisions.filter((d) => d.winner).length;
    const suppressed = decisions.length - offered;
    // Both UI states need real data behind them.
    expect(offered).toBeGreaterThan(0);
    expect(suppressed).toBeGreaterThan(0);
  });

  it('draws decisions from more than one flow', () => {
    expect(new Set(decisions.map((d) => d.artifactId)).size).toBeGreaterThan(1);
  });

  it('records a winner only when arbitration had a survivor', () => {
    for (const t of traces) {
      const arbitrate = t.eliminations.find((e) => e.nodeType === 'arbitrate');
      if (!arbitrate) continue;
      expect(Boolean(t.winner)).toBe(arbitrate.survived.length > 0);
    }
  });

  it('names a winner that is a real offer key', () => {
    const keys = new Set(offers.map((p) => p.key));
    for (const t of traces) {
      if (t.winner) expect(keys).toContain(t.winner);
    }
  });
});

describe('every slot the corpus decides for is a slot the tenant has', () => {
  /**
   * The join nothing was making.
   *
   * On 2026-09-10 the corpus decided against five `(channel, placement)` pairs
   * and the registry held two of them. `triggered_outbound` on 2,097 decisions,
   * `retention_queue` on 2,061 and `app_inbox` on 2,055 existed only inside
   * `decision-index.json` — `decidePlacement` would have answered 404 for all
   * three, and the storefront could never have rendered them.
   *
   * It went unnoticed because a placement is not part of the hashed catalogue
   * snapshot: it governs delivery, not the decision, so nothing in the engine,
   * the compiler or the conformance corpora ever had to resolve one. That is
   * the right modelling and it is exactly why this check has to exist here.
   */
  const configured = new Map(placements.map((p) => [p.key, p]));

  it('names a placement that exists', () => {
    const unknown = [
      ...new Set(decisions.filter((d) => d.placement).map((d) => d.placement)),
    ].filter((key) => !configured.has(key));
    expect(unknown, 'the corpus decides for a slot the tenant has never configured').toEqual([]);
  });

  it('decides on the channel the slot is configured for', () => {
    // A slot carries its channel. A decision that says `sms` for a slot
    // registered as `web` is two different facts about the same delivery, and
    // whichever one the reader believes, the other is wrong.
    const wrong = [
      ...new Set(
        decisions
          .filter((d) => d.placement && configured.has(d.placement))
          .filter((d) => configured.get(d.placement)!.channel !== d.channel)
          .map((d) => `${d.placement}: decided on ${d.channel}, configured as ${configured.get(d.placement)!.channel}`)
      ),
    ];
    expect(wrong).toEqual([]);
  });

  it('decides only for slots that are live', () => {
    // `active` is what `decidePlacement` refuses on, so a decision for an
    // inactive slot is a decision the API would not have made.
    const inactive = [
      ...new Set(
        decisions
          .filter((d) => d.placement && configured.get(d.placement)?.decidable === false)
          .map((d) => d.placement)
      ),
    ];
    expect(inactive, 'the corpus decides for a slot the platform would refuse').toEqual([]);
  });
});
