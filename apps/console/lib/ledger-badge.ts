import type { LedgerSummaryDto } from '@/lib/api-client';
import type { Formatter } from '@/lib/format';

/**
 * What the chrome says about the data behind every screen.
 *
 * It said "Fixture data" whatever the ledger held — including a PostgreSQL
 * ledger in which a person had made every decision through the storefront
 * (2026-09-18). It says where the ledger is and who wrote what is in it, in the
 * split `seed:ledger` uses: decided before the seeded corpus ends, or after.
 */
export function ledgerBadge(
  summary: LedgerSummaryDto | undefined,
  failed: boolean,
  format: Pick<Formatter, 'number'>
): string {
  if (failed) return 'Ledger could not be read';
  if (!summary) return 'Reading the ledger…';
  const where = summary.store === 'postgres' ? 'PostgreSQL' : 'In memory';
  const n = (x: number) => format.number(x);
  if (summary.decisions === 0) return `${where} · no decisions yet`;
  if (summary.madeByHand === 0) return `${where} · seeded history, ${n(summary.seeded)} decisions`;
  const byHand = `${n(summary.madeByHand)} ${summary.madeByHand === 1 ? 'decision' : 'decisions'} made by using the demo`;
  if (summary.seeded === 0) return `${where} · ${byHand}`;
  return `${where} · seeded history and ${byHand}`;
}
