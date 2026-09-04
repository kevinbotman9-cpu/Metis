/**
 * Compiler diagnostics.
 *
 * These are read by marketers and compliance officers, not only engineers, so
 * a diagnostic has to say what is wrong, where, and what to do about it. A
 * message like "type mismatch" fails that test; "Proposition 'upsell_5g' has no
 * active treatment for any channel, so it can never be delivered" passes it.
 */

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  severity: Severity;
  /** Stable machine-readable code, for suppressions and dashboards. */
  code: string;
  /** Node, edge or candidate the problem attaches to, when there is one. */
  at?: string;
  message: string;
  /** What the author should do. Always present on errors. */
  remedy?: string;
}

export const error = (code: string, message: string, remedy: string, at?: string): Diagnostic => ({
  severity: 'error',
  code,
  message,
  remedy,
  at,
});

export const warning = (code: string, message: string, remedy?: string, at?: string): Diagnostic => ({
  severity: 'warning',
  code,
  message,
  remedy,
  at,
});

/**
 * Levenshtein distance, capped for early exit.
 *
 * Only used to offer "did you mean" suggestions, so exact distances beyond the
 * threshold do not matter.
 */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Suggest the closest known identifiers to a misspelled one.
 *
 * A reference error that lists candidates is actionable; one that just says
 * "not found" sends the author hunting through the catalogue.
 */
export function suggest(unknownName: string, known: Iterable<string>, limit = 3): string[] {
  const max = Math.max(2, Math.floor(unknownName.length / 3));
  return [...known]
    .map((candidate) => ({ candidate, d: distance(unknownName, candidate, max) }))
    .filter((x) => x.d <= max)
    .sort((a, b) => a.d - b.d || a.candidate.localeCompare(b.candidate))
    .slice(0, limit)
    .map((x) => x.candidate);
}

/** Render suggestions as a sentence fragment, or nothing when there are none. */
export function didYouMean(unknownName: string, known: Iterable<string>): string {
  const options = suggest(unknownName, known);
  if (options.length === 0) return '';
  if (options.length === 1) return ` Did you mean '${options[0]}'?`;
  return ` Did you mean ${options.map((o) => `'${o}'`).join(', ')}?`;
}

/** Group diagnostics for display: errors first, then warnings, stable order. */
export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const rank = (d: Diagnostic) => (d.severity === 'error' ? 0 : 1);
  return [...diagnostics].sort(
    (a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code) || (a.at ?? '').localeCompare(b.at ?? '')
  );
}
