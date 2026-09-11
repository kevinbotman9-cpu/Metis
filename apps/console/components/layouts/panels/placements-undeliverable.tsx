import { Badge } from '@/components/ui/primitives';
import type { PanelProps } from '../panel';

/**
 * `placements.undeliverable` — the slots that decide and deliver nothing.
 *
 * Not an error. A slot worth deciding for with no far end is the honest state
 * of four of this tenant's five channels, and every decision made for one
 * records a suppressed delivery attempt. It is said above the list because the
 * list alone makes somebody count it (ADR-013).
 *
 * A panel for one screen, which is what ADR-015 §1 says a one-screen need is:
 * a pattern parameter would make every list–detail screen carry it.
 */
export function PlacementsUndeliverable({ rows }: PanelProps) {
  const undeliverable = rows.filter((p) => p.decidable && !p.delivery);
  if (undeliverable.length === 0) return null;
  const one = undeliverable.length === 1;

  return (
    <div className="rounded border border-hold/40 bg-hold-subtle px-cell py-cell-y">
      <Badge tone="hold">{undeliverable.length} decide, nothing delivers</Badge>
      <p className="mt-1.5 text-label text-content-muted">
        {undeliverable.map((p) => String(p.name)).join(', ')} — {one ? 'this slot decides' : 'these slots decide'} and
        nothing sends what {one ? 'it produces' : 'they produce'}. Every decision made for {one ? 'it' : 'them'} records
        a suppressed delivery attempt saying so.
      </p>
      <p className="mt-1 text-label text-content-subtle">
        ADR-013. An adapter is W-017, blocked on W-008 — no recipient address exists anywhere in the profile schema.
      </p>
    </div>
  );
}
