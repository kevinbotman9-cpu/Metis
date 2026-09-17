import type { DecisionRecord } from '../deterministic/types';
import { orderCandidates } from '../deterministic/engine';

/**
 * Comparing a shadow decision against the one that was actually returned.
 *
 * §12's migration factory needs "shadow production decisions → candidate/rank/
 * reason comparison" before anyone is asked to trust a cutover. A single
 * agree/disagree bit would not survive that conversation: two flows can pick
 * the same winner for opposite reasons, and a migration that changes *why*
 * without changing *what* is exactly the case a regulator asks about.
 *
 * So the comparison is three separate questions, and a divergence names which
 * one failed:
 *
 *   - **winner** — did it choose the same action?
 *   - **ranking** — did it order the candidates the same way? A shadow that
 *     wins by a hair today wins by nothing tomorrow.
 *   - **reasons** — did it deny the same candidates for the same coded reason?
 *
 * Agreement on the winner while diverging on reasons is the interesting case,
 * and the one a boolean would hide.
 */

export type DivergenceKind = 'winner' | 'ranking' | 'reasons';

export interface Divergence {
  kind: DivergenceKind;
  /** Short enough to group by, specific enough to act on. */
  summary: string;
}

export interface ShadowComparison {
  decisionId: string;
  shadowDecisionId: string;
  activeVersion: string;
  shadowVersion: string;
  /** True only when all three questions agree. */
  agrees: boolean;
  divergences: Divergence[];
  /**
   * What the shadow cost, measured on its own.
   *
   * Recorded rather than folded into the decision's own timings: a shadow that
   * quietly doubled the reported latency would make a migration look like a
   * performance regression, and one that was excluded silently would hide a
   * real cost. It is a separate number so it can be read as one.
   */
  shadowMs: number;
}

/**
 * Candidate keys in the order the flow ranked them, best first.
 *
 * Each record ranked by the engine's own `orderCandidates` over that record's
 * declared `candidateKeys`, so a tie does not read as a divergence — and a tie
 * that two versions declare in different orders, which the engine breaks
 * differently, does.
 *
 * It broke ties by key until ADR-020 §6, under a comment saying that was the
 * engine's tie-break. It had stopped being the engine's at ADR-019 §8.
 */
export function ranking(record: DecisionRecord): string[] {
  const { decision } = record;
  return orderCandidates(
    Object.keys(decision.scores).map((key) => ({ key })),
    decision.scores,
    { id: decision.artifactId, version: decision.artifactVersion, candidateKeys: decision.candidateKeys }
  ).map((c) => c.key);
}

/** Every denial, as `key:CODE`, sorted so two runs compare as sets. */
function reasons(record: DecisionRecord): string[] {
  const out: string[] = [];
  for (const step of record.decision.eliminations) {
    for (const d of step.denials) out.push(`${d.key}:${d.code}`);
  }
  return out.sort();
}

export function compareShadow(
  active: DecisionRecord,
  shadow: DecisionRecord,
  versions: { activeVersion: string; shadowVersion: string },
  shadowMs: number
): ShadowComparison {
  const divergences: Divergence[] = [];

  if (active.decision.winner !== shadow.decision.winner) {
    divergences.push({
      kind: 'winner',
      summary: `${active.decision.winner ?? 'no offer'} → ${shadow.decision.winner ?? 'no offer'}`,
    });
  }

  const a = ranking(active);
  const b = ranking(shadow);
  if (a.join(',') !== b.join(',')) {
    divergences.push({
      kind: 'ranking',
      summary: `${a.join(' > ') || 'none'} → ${b.join(' > ') || 'none'}`,
    });
  }

  const ra = reasons(active);
  const rb = reasons(shadow);
  if (ra.join(',') !== rb.join(',')) {
    // The set difference both ways, because a reason that disappeared matters
    // as much as one that appeared — an offer silently no longer being denied
    // is how a suitability rule stops applying without anyone noticing.
    const gone = ra.filter((r) => !rb.includes(r));
    const added = rb.filter((r) => !ra.includes(r));
    const parts: string[] = [];
    if (gone.length) parts.push(`no longer: ${gone.join(', ')}`);
    if (added.length) parts.push(`now: ${added.join(', ')}`);
    divergences.push({ kind: 'reasons', summary: parts.join('; ') });
  }

  return {
    decisionId: active.id,
    shadowDecisionId: shadow.id,
    activeVersion: versions.activeVersion,
    shadowVersion: versions.shadowVersion,
    agrees: divergences.length === 0,
    divergences,
    shadowMs,
  };
}

export interface ShadowReport {
  flowName: string;
  activeVersion: string | null;
  shadowVersion: string | null;
  compared: number;
  agreed: number;
  /** Rounded to four places; a rate quoted to more than that is theatre. */
  agreementRate: number;
  /** Most common divergences first, then alphabetically so ties are stable. */
  topDivergences: { kind: DivergenceKind; summary: string; count: number }[];
  /** What the shadow cost, so it can be judged rather than assumed. */
  shadowMsP50: number;
  shadowMsP95: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

export function buildShadowReport(
  flowName: string,
  versions: { activeVersion: string | null; shadowVersion: string | null },
  comparisons: ShadowComparison[],
  topN = 5
): ShadowReport {
  const agreed = comparisons.filter((c) => c.agrees).length;
  const counts = new Map<string, { kind: DivergenceKind; summary: string; count: number }>();

  for (const c of comparisons) {
    for (const d of c.divergences) {
      // NUL as the separator, written as an escape: neither a kind nor a summary
      // can contain one, so two different divergences cannot collide on a
      // shared key. A literal NUL here made git store this file as binary.
      const key = `${d.kind}\u0000${d.summary}`;
      const existing = counts.get(key);
      if (existing) existing.count++;
      else counts.set(key, { kind: d.kind, summary: d.summary, count: 1 });
    }
  }

  const ms = comparisons.map((c) => c.shadowMs).sort((x, y) => x - y);

  return {
    flowName,
    activeVersion: versions.activeVersion,
    shadowVersion: versions.shadowVersion,
    compared: comparisons.length,
    agreed,
    // Zero comparisons is a 0% rate, not 100%. Nothing has agreed yet, and a
    // report that opened at "100% agreement, 0 compared" would be read by
    // somebody in a hurry as a reason to cut over.
    agreementRate:
      comparisons.length === 0 ? 0 : Math.round((agreed / comparisons.length) * 10000) / 10000,
    topDivergences: [...counts.values()]
      .sort((x, y) => (y.count !== x.count ? y.count - x.count : x.summary.localeCompare(y.summary)))
      .slice(0, topN),
    shadowMsP50: percentile(ms, 50),
    shadowMsP95: percentile(ms, 95),
  };
}
