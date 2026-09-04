/**
 * Strategy compiler.
 *
 * The point of the two-plane architecture is that nothing reaches the runtime
 * unless it has been proved safe first. This is where that proof happens: every
 * check below exists because its absence would surface as a wrong or
 * undeliverable decision in production.
 *
 * Two of these checks were written after the same bugs were found by hand, by
 * running the engine and noticing every decision came back empty:
 *   - ARBITRATION_MISSING_SCORE: a formula weighting propensity, with nothing
 *     scoring upstream, silently ranks nothing.
 *   - NO_DELIVERABLE_TREATMENT: an offer that can win but cannot be sent.
 *
 * Finding those at compile time is the difference between a platform that
 * catches its own mistakes and one that ships them.
 */

import { createHash } from 'node:crypto';
import type {
  Proposition,
  EngagementPolicy,
  ContactPolicy,
  ArbitrationConfig,
  PolicyScope,
  Connector,
} from '@metis/core/domain';
import {
  type Diagnostic,
  error,
  warning,
  didYouMean,
  sortDiagnostics,
} from './diagnostics';

// ---------------------------------------------------------------------------
// Inputs and outputs
// ---------------------------------------------------------------------------

export type StrategyNodeType =
  | 'source'
  | 'filter'
  | 'constraint'
  | 'score-model'
  | 'score-adaptive'
  | 'switch'
  | 'explain-annotate'
  | 'arbitrate';

export interface StrategyNode {
  id: string;
  type: StrategyNodeType;
  label: string;
  policyIds?: string[];
  model?: { id: string; version: string };
  /** Connectors a source node draws on. Their latency joins the critical path. */
  connectorIds?: string[];
  /** Worst-case contribution to latency, in milliseconds. */
  estimatedMs: number;
}

export interface StrategyEdge {
  from: string;
  to: string;
}

/** A strategy as authored, before compilation. */
export interface StrategySource {
  id: string;
  version: string;
  tenantId: string;
  nodes: StrategyNode[];
  edges: StrategyEdge[];
  candidateKeys: string[];
  /** Requested package ranges, resolved and pinned during compilation. */
  packageRanges?: Record<string, string>;
}

export interface CompileContext {
  propositions: Proposition[];
  engagementPolicies: EngagementPolicy[];
  contactPolicies: ContactPolicy[];
  arbitration: ArbitrationConfig;
  /** Versions available to resolve `packageRanges` against. */
  availablePackages?: Record<string, string[]>;
  /**
   * Issue and group ids that exist. Supplied so a policy scoped to something
   * that was deleted can be caught; omitted, that check is skipped rather
   * than guessed at.
   */
  knownScopeTargets?: { issues: string[]; groups: string[] };
  /**
   * Configured integrations. Omitted means the tenant has none, and a strategy
   * naming a connector is then rejected rather than assumed to be fine.
   */
  connectors?: Connector[];
  /**
   * Fields the caller guarantees on every request, e.g. the channel and
   * placement an inbound integration always sends.
   *
   * Omitted disables the UNRESOLVED_FIELD check entirely rather than guessing:
   * a check that fires on every strategy is one nobody reads.
   */
  requestFields?: string[];
  tenant: { id: string; latencyBudgetMs: number; maxNodes: number };
}

export interface CostManifest {
  nodeCount: number;
  /** Longest path through the graph. Branches run in parallel. */
  criticalPathMs: number;
  /** Sum of every node, the true worst case if nothing parallelises. */
  worstCaseMs: number;
  modelInvocations: { nodeId: string; model: string }[];
  latencyBudgetMs: number;
  withinBudget: boolean;
}

export interface CompiledStrategy {
  id: string;
  version: string;
  tenantId: string;
  nodes: StrategyNode[];
  edges: StrategyEdge[];
  candidateKeys: string[];
  /** Exact versions, locked at compile time so a replay is reproducible. */
  packageVersions: Record<string, string>;
  costManifest: CostManifest;
  /** sha256 over everything above. Changes if anything changes. */
  artifactHash: string;
  compiledAt: string;
}

export interface CompileResult {
  ok: boolean;
  artifact: CompiledStrategy | null;
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// Graph analysis
// ---------------------------------------------------------------------------

interface Graph {
  byId: Map<string, StrategyNode>;
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
}

function buildGraph(source: StrategySource): Graph {
  const byId = new Map(source.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of source.edges) {
    outgoing.set(e.from, [...(outgoing.get(e.from) ?? []), e.to]);
    incoming.set(e.to, [...(incoming.get(e.to) ?? []), e.from]);
  }
  return { byId, outgoing, incoming };
}

/** Nodes reachable from every root, so unreachable ones can be reported. */
function reachable(source: StrategySource, g: Graph): Set<string> {
  const roots = source.nodes.filter((n) => (g.incoming.get(n.id) ?? []).length === 0);
  const seen = new Set<string>();
  const stack = roots.map((r) => r.id);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of g.outgoing.get(id) ?? []) stack.push(next);
  }
  return seen;
}

function hasCycle(source: StrategySource, g: Graph): boolean {
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string): boolean => {
    const s = state.get(id) ?? 0;
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(id, 1);
    for (const next of g.outgoing.get(id) ?? []) {
      if (visit(next)) return true;
    }
    state.set(id, 2);
    return false;
  };
  return source.nodes.some((n) => visit(n.id));
}

/** Longest path to each node, following the DAG. Branches run in parallel. */
/**
 * What a node costs, including the integrations it waits on.
 *
 * Connectors on one node are fetched concurrently, so the node waits for the
 * slowest rather than the sum — the same assumption `resolveInputs` makes when
 * it runs them through Promise.all. Getting this wrong in either direction
 * matters: summing would reject strategies that are actually fine, and ignoring
 * connectors entirely would let a 180ms bureau call through a 50ms budget and
 * fail in production instead.
 */
function nodeCost(node: StrategyNode | undefined, connectors: Map<string, Connector>): number {
  if (!node) return 0;
  const own = node.estimatedMs ?? 0;
  const attached = (node.connectorIds ?? [])
    .map((id) => connectors.get(id))
    .filter((c): c is Connector => Boolean(c) && c!.active)
    .map((c) => c.declaredP95Ms);
  return own + (attached.length > 0 ? Math.max(...attached) : 0);
}

function criticalPath(source: StrategySource, g: Graph, connectors: Map<string, Connector>): number {
  const memo = new Map<string, number>();
  const cost = (id: string): number => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    // Guard against being called on a cyclic graph.
    memo.set(id, 0);
    const self = nodeCost(g.byId.get(id), connectors);
    const next = g.outgoing.get(id) ?? [];
    const total = self + (next.length > 0 ? Math.max(...next.map(cost)) : 0);
    memo.set(id, total);
    return total;
  };
  const roots = source.nodes.filter((n) => (g.incoming.get(n.id) ?? []).length === 0);
  return roots.length > 0 ? Math.max(...roots.map((r) => cost(r.id))) : 0;
}

/** Every node that can reach `target`, i.e. runs before it. */
function ancestorsOf(target: string, g: Graph): Set<string> {
  const seen = new Set<string>();
  const stack = [...(g.incoming.get(target) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const prev of g.incoming.get(id) ?? []) stack.push(prev);
  }
  return seen;
}

// ---------------------------------------------------------------------------
// Version resolution
// ---------------------------------------------------------------------------

function parseVersion(v: string): [number, number, number] {
  const [maj = 0, min = 0, patch = 0] = v.split('.').map((p) => Number.parseInt(p, 10) || 0);
  return [maj, min, patch];
}

function compareVersions(a: string, b: string): number {
  const [am, an, ap] = parseVersion(a);
  const [bm, bn, bp] = parseVersion(b);
  return am - bm || an - bn || ap - bp;
}

/**
 * Resolve a caret or exact range to the highest compatible available version.
 *
 * Deliberately small: enough for `^1.2.0` and exact pins, which is what the
 * package manifests use. An unrecognised range is an error rather than a
 * silent pass, because an unpinned version breaks replay.
 */
export function resolveRange(range: string, available: string[]): string | null {
  const sorted = [...available].sort(compareVersions);
  if (/^\d+\.\d+\.\d+$/.test(range)) {
    return sorted.includes(range) ? range : null;
  }
  if (range.startsWith('^')) {
    const want = range.slice(1);
    const [major] = parseVersion(want);
    const matches = sorted.filter(
      (v) => parseVersion(v)[0] === major && compareVersions(v, want) >= 0
    );
    return matches.length > 0 ? matches[matches.length - 1] : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

const SCORE_TYPES: StrategyNodeType[] = ['score-model', 'score-adaptive'];

export function compileStrategy(
  source: StrategySource,
  ctx: CompileContext
): CompileResult {
  const d: Diagnostic[] = [];
  const g = buildGraph(source);

  const propositionByKey = new Map(ctx.propositions.map((p) => [p.key, p]));
  const policyIds = new Set(ctx.engagementPolicies.map((p) => p.id));
  const connectorLookup = new Map((ctx.connectors ?? []).map((c) => [c.id, c]));

  // --- Structure ---------------------------------------------------------

  const seenIds = new Set<string>();
  for (const n of source.nodes) {
    if (seenIds.has(n.id)) {
      d.push(
        error(
          'DUPLICATE_NODE_ID',
          `Two nodes share the id '${n.id}'.`,
          'Node ids appear in every trace, so they must be unique. Rename one of them.',
          n.id
        )
      );
    }
    seenIds.add(n.id);
  }

  for (const e of source.edges) {
    for (const end of [e.from, e.to]) {
      if (!g.byId.has(end)) {
        d.push(
          error(
            'DANGLING_EDGE',
            `Edge ${e.from} -> ${e.to} references node '${end}', which does not exist.` +
              didYouMean(end, seenIds),
            'Point the edge at an existing node, or remove it.',
            `${e.from}->${e.to}`
          )
        );
      }
    }
  }

  if (source.nodes.length === 0) {
    d.push(
      error('EMPTY_STRATEGY', 'The strategy has no nodes.', 'Add at least a source and an arbitrate node.')
    );
  }

  if (source.nodes.length > ctx.tenant.maxNodes) {
    d.push(
      error(
        'TOO_MANY_NODES',
        `The strategy has ${source.nodes.length} nodes; the tenant limit is ${ctx.tenant.maxNodes}.`,
        'Split the strategy, or extract part of it into a sub-strategy.'
      )
    );
  }

  const cyclic = hasCycle(source, g);
  if (cyclic) {
    d.push(
      error(
        'CYCLE',
        'The strategy graph contains a cycle.',
        'Execution has to terminate, so the graph must be acyclic. Remove the edge that loops back.'
      )
    );
  }

  if (!cyclic) {
    const live = reachable(source, g);
    for (const n of source.nodes) {
      if (!live.has(n.id)) {
        d.push(
          warning(
            'UNREACHABLE_NODE',
            `Node '${n.id}' (${n.label}) cannot be reached from any entry point.`,
            'Connect it, or remove it. It will never execute.',
            n.id
          )
        );
      }
    }
  }

  const arbitrateNodes = source.nodes.filter((n) => n.type === 'arbitrate');
  if (arbitrateNodes.length === 0) {
    d.push(
      error(
        'NO_ARBITRATION',
        'The strategy has no arbitrate node, so it can never select a winner.',
        'Add an arbitrate node as the final step.'
      )
    );
  }

  // --- The bug this compiler exists to catch -----------------------------

  if (!cyclic) {
    for (const node of arbitrateNodes) {
      const upstream = ancestorsOf(node.id, g);
      const scoresUpstream = [...upstream].some((id) =>
        SCORE_TYPES.includes(g.byId.get(id)?.type as StrategyNodeType)
      );
      if (!scoresUpstream && ctx.arbitration.weights.propensity > 0) {
        d.push(
          warning(
            'ARBITRATION_MISSING_SCORE',
            `Arbitration at '${node.id}' weights propensity at ${ctx.arbitration.weights.propensity}, but no scoring node runs before it.`,
            'Add a score node upstream, or set the propensity weight to 0 so the formula matches what the strategy actually computes. Propensity will be treated as neutral.',
            node.id
          )
        );
      }
    }
  }

  // --- References --------------------------------------------------------

  for (const n of source.nodes) {
    for (const id of n.policyIds ?? []) {
      if (!policyIds.has(id)) {
        d.push(
          error(
            'UNKNOWN_POLICY',
            `Node '${n.id}' references engagement policy '${id}', which does not exist.` +
              didYouMean(id, policyIds),
            'Reference an existing policy, or create it first.',
            n.id
          )
        );
      }
    }

    // --- Integrations ----------------------------------------------------
    for (const id of n.connectorIds ?? []) {
      const connector = connectorLookup.get(id);
      if (!connector) {
        d.push(
          error(
            'UNKNOWN_CONNECTOR',
            `Node '${n.id}' names connector '${id}', which is not configured.` +
              didYouMean(id, new Set(connectorLookup.keys())),
            'Configure the integration first, or the fields it supplies will be missing at decision time.',
            n.id
          )
        );
        continue;
      }
      if (!connector.active) {
        d.push(
          warning(
            'CONNECTOR_INACTIVE',
            `Node '${n.id}' names connector '${connector.name}', which is configured but not active.`,
            'Its fields will be absent, and any policy depending on them will not evaluate. Activate it or remove the reference.',
            n.id
          )
        );
      }
      if (connector.declaredP95Ms > ctx.tenant.latencyBudgetMs) {
        d.push(
          error(
            'CONNECTOR_EXCEEDS_BUDGET',
            `Connector '${connector.name}' declares a p95 of ${connector.declaredP95Ms}ms, which alone exceeds the ${ctx.tenant.latencyBudgetMs}ms budget.`,
            'No strategy can call this synchronously and stay inside the budget. Pre-compute the field, cache it, or raise the budget.',
            n.id
          )
        );
      }
      if (connector.onFailure === 'fail' && connector.cacheTtlSeconds === 0) {
        d.push(
          warning(
            'CONNECTOR_NO_FALLBACK',
            `Connector '${connector.name}' fails the decision on error and caches nothing.`,
            'Every outage becomes a decision outage. Consider a cache TTL, or a default for the fields it supplies.',
            n.id
          )
        );
      }
    }

    if (SCORE_TYPES.includes(n.type)) {
      if (!n.model) {
        d.push(
          error(
            'UNPINNED_MODEL',
            `Score node '${n.id}' does not name a model.`,
            'Name the model and pin an exact version. Without a pin the decision cannot be replayed.',
            n.id
          )
        );
      } else if (!/^\d+\.\d+\.\d+$/.test(n.model.version)) {
        d.push(
          error(
            'UNPINNED_MODEL',
            `Score node '${n.id}' uses model version '${n.model.version}', which is not an exact version.`,
            'Pin an exact version such as 4.2.0. A floating version would change the answer on replay.',
            n.id
          )
        );
      }
    }
  }

  // --- Candidate set -----------------------------------------------------

  if (source.candidateKeys.length === 0) {
    d.push(
      error(
        'EMPTY_CANDIDATE_SET',
        'The strategy has no candidate propositions.',
        'Add at least one proposition key to the candidate set.'
      )
    );
  }

  for (const key of source.candidateKeys) {
    const p = propositionByKey.get(key);
    if (!p) {
      d.push(
        error(
          'UNKNOWN_PROPOSITION',
          `Candidate '${key}' is not a proposition in the catalogue.` +
            didYouMean(key, propositionByKey.keys()),
          'Reference an existing proposition, or create it first.',
          key
        )
      );
      continue;
    }

    if (p.status === 'retired') {
      d.push(
        warning(
          'RETIRED_CANDIDATE',
          `Candidate '${key}' is retired and can never win.`,
          'Remove it from the candidate set.',
          key
        )
      );
    } else if (p.status !== 'active') {
      d.push(
        warning(
          'INACTIVE_CANDIDATE',
          `Candidate '${key}' is ${p.status}, so it will not be offered while it stays that way.`,
          'Activate it before relying on it, or remove it from the candidate set.',
          key
        )
      );
    }

    if (p.status !== 'retired' && p.treatmentIds.length === 0) {
      d.push(
        error(
          'NO_DELIVERABLE_TREATMENT',
          `Proposition '${key}' has no treatment, so even if it wins there is nothing to deliver.`,
          'Add at least one active treatment for a channel this strategy serves.',
          key
        )
      );
    }

    for (const id of p.policyIds) {
      if (!policyIds.has(id)) {
        d.push(
          error(
            'UNKNOWN_POLICY',
            `Proposition '${key}' references engagement policy '${id}', which does not exist.` +
              didYouMean(id, policyIds),
            'Reference an existing policy, or create it first.',
            key
          )
        );
      }
    }
  }

  // --- Dead rules --------------------------------------------------------

  // A policy scoped to another group is not a defect of this strategy, so the
  // check is narrow on purpose: only a scope pointing at something that does
  // not exist anywhere in the catalogue is reported. Warning on every
  // non-covering policy produced noise on every strategy and taught readers to
  // ignore the compiler.
  const knownTargets = ctx.knownScopeTargets;
  if (knownTargets) {
    const valid = new Set([
      ...knownTargets.issues,
      ...knownTargets.groups,
      ...ctx.propositions.map((p) => p.id),
    ]);
    const scoped: { id: string; name: string; kind: string; scope: PolicyScope }[] = [
      ...ctx.contactPolicies.filter((c) => c.active).map((c) => ({
        id: c.id,
        name: c.name,
        kind: 'Contact policy',
        scope: c.scope,
      })),
      ...ctx.engagementPolicies.filter((e) => e.active).map((e) => ({
        id: e.id,
        name: e.name,
        kind: 'Engagement policy',
        scope: e.scope,
      })),
    ];

    for (const sp of scoped) {
      if (sp.scope.level === 'tenant') continue;
      if (sp.scope.targetId && !valid.has(sp.scope.targetId)) {
        d.push(
          error(
            'DANGLING_POLICY_SCOPE',
            `${sp.kind} '${sp.name}' is scoped to ${sp.scope.level} '${sp.scope.targetId}', which does not exist.` +
              didYouMean(sp.scope.targetId, valid),
            'Point the scope at something real, or the rule silently never applies.',
            sp.id
          )
        );
      }
    }
  }

  // --- Fields ------------------------------------------------------------

  // The check integrations exist for: a policy reading `creditScore` when no
  // connector supplies it and no caller promises it will never fire, and the
  // engine cannot tell "the rule failed" from "the field was never there".
  // Numeric comparisons on a missing value are false, so the offer is silently
  // suppressed for every customer and nothing looks broken.
  {
    const suppliedFields = new Set<string>();
    for (const n of source.nodes) {
      for (const id of n.connectorIds ?? []) {
        const connector = connectorLookup.get(id);
        if (!connector?.active) continue;
        for (const b of connector.provides) suppliedFields.add(b.field);
      }
    }

    // Fields the caller always supplies on the request. Declared per tenant,
    // because the console and an inbound channel promise different things.
    for (const f of ctx.requestFields ?? []) suppliedFields.add(f);

    // Two connectors claiming the same field is ambiguous: which value wins
    // depends on resolution order, and a decision that depends on that is not
    // reproducible in any useful sense.
    const claims = new Map<string, string[]>();
    for (const n of source.nodes) {
      for (const id of n.connectorIds ?? []) {
        const connector = connectorLookup.get(id);
        if (!connector?.active) continue;
        for (const b of connector.provides) {
          claims.set(b.field, [...(claims.get(b.field) ?? []), connector.name]);
        }
      }
    }
    for (const [field, owners] of [...claims.entries()].sort()) {
      if (owners.length > 1) {
        d.push(
          error(
            'FIELD_SUPPLIED_TWICE',
            `Field '${field}' is supplied by ${owners.length} connectors: ${owners.sort().join(', ')}.`,
            'Which value wins would depend on which call returned first. Remove one binding.'
          )
        );
      }
    }

    // Only checked when the tenant has told us what the caller supplies;
    // otherwise every field would look unresolved and the diagnostic would be
    // noise, which is how a useful check gets ignored.
    if (ctx.requestFields) {
      const referenced = new Map<string, string>();
      for (const n of source.nodes) {
        for (const id of n.policyIds ?? []) {
          const policy = ctx.engagementPolicies.find((p) => p.id === id);
          for (const c of policy?.conditions ?? []) {
            // Only the root of a dotted path can be supplied by a connector.
            referenced.set(c.field.split('.')[0], n.id);
          }
        }
      }
      for (const [field, nodeId] of [...referenced.entries()].sort()) {
        if (!suppliedFields.has(field)) {
          d.push(
            error(
              'UNRESOLVED_FIELD',
              `Policies on node '${nodeId}' read '${field}', which no connector supplies and the caller does not promise.` +
                didYouMean(field, suppliedFields),
              'A missing field fails every comparison silently, so the rule suppresses everything and looks like it is working.',
              nodeId
            )
          );
        }
      }
    }
  }

  // --- Cost --------------------------------------------------------------

  const connectorById = new Map((ctx.connectors ?? []).map((c) => [c.id, c]));
  const pathMs = cyclic ? 0 : Number(criticalPath(source, g, connectorById).toFixed(3));
  const worstCaseMs = Number(
    source.nodes.reduce((sum, n) => sum + nodeCost(n, connectorById), 0).toFixed(3)
  );
  const modelInvocations = source.nodes
    .filter((n) => SCORE_TYPES.includes(n.type) && n.model)
    .map((n) => ({ nodeId: n.id, model: `${n.model!.id}@${n.model!.version}` }));

  const withinBudget = pathMs <= ctx.tenant.latencyBudgetMs;
  if (!withinBudget) {
    d.push(
      error(
        'LATENCY_BUDGET_EXCEEDED',
        `Worst-case latency is ${pathMs}ms along the critical path; the tenant budget is ${ctx.tenant.latencyBudgetMs}ms.`,
        `Remove a model call, or raise the budget. The slowest path is ${pathMs - ctx.tenant.latencyBudgetMs}ms over.`
      )
    );
  } else if (pathMs > ctx.tenant.latencyBudgetMs * 0.8) {
    d.push(
      warning(
        'LATENCY_NEAR_BUDGET',
        `Worst-case latency is ${pathMs}ms, within ${Math.round(
          (pathMs / ctx.tenant.latencyBudgetMs) * 100
        )}% of the ${ctx.tenant.latencyBudgetMs}ms budget.`,
        'There is little headroom for another node.'
      )
    );
  }

  // --- Version pinning ---------------------------------------------------

  const packageVersions: Record<string, string> = {};
  for (const [name, range] of Object.entries(source.packageRanges ?? {})) {
    const available = ctx.availablePackages?.[name] ?? [];
    const resolved = resolveRange(range, available);
    if (!resolved) {
      d.push(
        error(
          'UNRESOLVED_PACKAGE',
          `No available version of '${name}' satisfies '${range}'${
            available.length > 0 ? ` (available: ${available.join(', ')})` : ' (none published)'
          }.`,
          'Publish a matching version, or widen the range.',
          name
        )
      );
      continue;
    }
    packageVersions[name] = resolved;
  }

  // --- Result ------------------------------------------------------------

  const diagnostics = sortDiagnostics(d);
  const ok = !diagnostics.some((x) => x.severity === 'error');

  if (!ok) return { ok: false, artifact: null, diagnostics };

  const costManifest: CostManifest = {
    nodeCount: source.nodes.length,
    criticalPathMs: pathMs,
    worstCaseMs,
    modelInvocations,
    latencyBudgetMs: ctx.tenant.latencyBudgetMs,
    withinBudget,
  };

  const body = {
    id: source.id,
    version: source.version,
    tenantId: source.tenantId,
    nodes: source.nodes,
    edges: source.edges,
    candidateKeys: source.candidateKeys,
    packageVersions,
    costManifest,
  };

  return {
    ok: true,
    diagnostics,
    artifact: {
      ...body,
      artifactHash: createHash('sha256')
        .update(stableStringify(body), 'utf8')
        .digest('hex'),
      // Metadata, not part of the hash: two compilations of the same source
      // must produce the same artifact hash.
      compiledAt: new Date().toISOString(),
    },
  };
}

/** Key-sorted JSON, so the artifact hash does not depend on property order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** Human-readable compile report, for a CLI or a PR comment. */
export function formatReport(result: CompileResult): string {
  const lines: string[] = [];
  const errors = result.diagnostics.filter((x) => x.severity === 'error');
  const warnings = result.diagnostics.filter((x) => x.severity === 'warning');

  lines.push(
    result.ok
      ? `Compiled successfully${warnings.length > 0 ? ` with ${warnings.length} warning(s)` : ''}.`
      : `Compilation failed: ${errors.length} error(s), ${warnings.length} warning(s).`
  );

  for (const x of result.diagnostics) {
    lines.push('');
    lines.push(`  ${x.severity.toUpperCase()} ${x.code}${x.at ? ` at ${x.at}` : ''}`);
    lines.push(`    ${x.message}`);
    if (x.remedy) lines.push(`    -> ${x.remedy}`);
  }

  if (result.artifact) {
    const c = result.artifact.costManifest;
    lines.push('');
    lines.push(
      `  ${c.nodeCount} nodes, critical path ${c.criticalPathMs}ms of ${c.latencyBudgetMs}ms budget, ${c.modelInvocations.length} model call(s).`
    );
    lines.push(`  artifact ${result.artifact.artifactHash.slice(0, 16)}`);
  }

  return lines.join('\n');
}
