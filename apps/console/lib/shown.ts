/**
 * What a decision showed — ADR-020 §1.
 *
 * The record holds the slate: every offer a placement showed, best first. The
 * screens read `winner` until 2026-09-18, so a grid decision that showed three
 * offers was headed "5 candidates, one offered" over a funnel that said three,
 * and its second and third offers stood in the score table beside the two that
 * were ranked below the last slot, as though nothing separated them. That is the
 * defect ADR-020 exists to fix, reproduced on the screen after the record was
 * fixed. Every place a screen says what a decision offered reads this.
 *
 * A record without a slate — one built by hand in a story or a test — is taken
 * as having shown its winner, which is all it can say.
 */

export interface ShownEntry {
  rank: number;
  action: string;
}

export function shownBy(d: {
  winner?: string | null;
  slate?: readonly { rank: number; action: string }[] | null;
}): ShownEntry[] {
  if (d.slate && d.slate.length > 0) return d.slate.map((e) => ({ rank: e.rank, action: e.action }));
  return d.winner ? [{ rank: 1, action: d.winner }] : [];
}

/** "none offered", "one offered", "3 offered". */
export function offeredPhrase(n: number): string {
  return n === 0 ? 'none offered' : n === 1 ? 'one offered' : `${n} offered`;
}

/** "none was offered", "1 was offered", "3 were offered". */
export function offeredClause(n: number): string {
  return n === 0 ? 'none was offered' : n === 1 ? '1 was offered' : `${n} were offered`;
}

/** The slot an action was shown in, or null when it was not shown. */
export function slotOf(shown: readonly ShownEntry[], action: string): number | null {
  return shown.find((e) => e.action === action)?.rank ?? null;
}
