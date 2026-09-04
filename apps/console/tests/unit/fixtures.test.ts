/**
 * Integrity checks on the fixture store.
 *
 * These catch the class of bug that made the console look broken before:
 * dangling references and non-deterministic IDs.
 */

import { describe, it, expect } from 'vitest';
import {
  issues,
  groups,
  propositions,
  treatments,
  engagementPolicies,
  contactPolicies,
  levers,
  autonomySettings,
} from '@/mocks/fixtures/catalogue';
import { decisions, traces, findTrace } from '@/mocks/fixtures/decisions';
import { artifacts } from '@/mocks/fixtures/artifacts';

describe('taxonomy integrity', () => {
  it('gives every group a real issue', () => {
    const issueIds = new Set(issues.map((i) => i.id));
    for (const g of groups) expect(issueIds).toContain(g.issueId);
  });

  it('gives every proposition a real group, with a matching denormalised issue', () => {
    const byId = new Map(groups.map((g) => [g.id, g]));
    for (const p of propositions) {
      const group = byId.get(p.groupId);
      expect(group, `${p.id} references missing group ${p.groupId}`).toBeDefined();
      // issueId is denormalised for rendering; it must not drift from the group.
      expect(p.issueId).toBe(group!.issueId);
    }
  });

  it('resolves every treatment reference in both directions', () => {
    const treatmentIds = new Set(treatments.map((t) => t.id));
    const propositionIds = new Set(propositions.map((p) => p.id));

    for (const p of propositions) {
      for (const id of p.treatmentIds) {
        expect(treatmentIds, `${p.id} references missing treatment ${id}`).toContain(id);
      }
    }
    for (const t of treatments) {
      expect(propositionIds).toContain(t.propositionId);
      // The treatment must be listed by the proposition it claims to belong to.
      const owner = propositions.find((p) => p.id === t.propositionId)!;
      expect(owner.treatmentIds).toContain(t.id);
    }
  });

  it('resolves every policy reference', () => {
    const policyIds = new Set(engagementPolicies.map((p) => p.id));
    for (const p of propositions) {
      for (const id of p.policyIds) {
        expect(policyIds, `${p.id} references missing policy ${id}`).toContain(id);
      }
    }
  });

  it('points every scoped policy, lever and autonomy rule at something real', () => {
    const targets = new Set([
      ...issues.map((i) => i.id),
      ...groups.map((g) => g.id),
      ...propositions.map((p) => p.id),
    ]);
    const scoped = [...engagementPolicies, ...contactPolicies, ...levers, ...autonomySettings];
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
    expect(unique(issues)).toBe(true);
    expect(unique(groups)).toBe(true);
    expect(unique(propositions)).toBe(true);
    expect(unique(treatments)).toBe(true);
    expect(unique(engagementPolicies)).toBe(true);
  });

  it('flags an active proposition with no deliverable treatment', () => {
    // Not a failure — the console surfaces these. This asserts the console has
    // something to surface, so the empty state stays exercised.
    const undeliverable = propositions.filter(
      (p) => p.status !== 'retired' && p.treatmentIds.length === 0
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

  it('keeps every decision inside the latency budget', () => {
    for (const d of decisions) expect(d.totalMs).toBeLessThan(50);
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

describe('strategy artifacts', () => {
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

  it('keeps every strategy inside the 50ms latency budget', () => {
    for (const a of artifacts) expect(a.estimatedP95LatencyMs).toBeLessThan(50);
  });

  it('draws candidates from real proposition keys', () => {
    const keys = new Set(propositions.map((p) => p.key));
    for (const a of artifacts) {
      for (const k of a.candidateKeys) {
        expect(keys, `${a.id} references unknown proposition key ${k}`).toContain(k);
      }
    }
  });
});

describe('console decisions come from the real engine', () => {
  it('replays every decision the console shows to an identical chain hash', async () => {
    const { generated, catalogueSnapshot } = await import('@/mocks/fixtures/engine');
    const { replay } = await import('@metis/runtime/deterministic/engine');

    for (const g of generated) {
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
    const { generated } = await import('@/mocks/fixtures/engine');
    const { canonicalise } = await import('@metis/runtime/deterministic/canonical');

    for (const g of generated.slice(0, 5)) {
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

  it('draws decisions from more than one strategy', () => {
    expect(new Set(decisions.map((d) => d.artifactId)).size).toBeGreaterThan(1);
  });

  it('records a winner only when arbitration had a survivor', () => {
    for (const t of traces) {
      const arbitrate = t.eliminations.find((e) => e.nodeType === 'arbitrate');
      if (!arbitrate) continue;
      expect(Boolean(t.winner)).toBe(arbitrate.survived.length > 0);
    }
  });

  it('names a winner that is a real proposition key', () => {
    const keys = new Set(propositions.map((p) => p.key));
    for (const t of traces) {
      if (t.winner) expect(keys).toContain(t.winner);
    }
  });
});
