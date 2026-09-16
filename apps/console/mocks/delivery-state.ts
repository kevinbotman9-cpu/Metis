/**
 * What the platform records about delivering a decision to a placement — ADR-013 §1.
 *
 * One rule, read by the two places that write a delivery attempt: the
 * development API when a placement decision is made, and the seed job when it
 * writes the seeded history into the ledger (ADR-018 §2). Two copies of this
 * would be two answers to "did anything leave the building", and the seeded
 * outcomes are gated on this answer (ADR-018 §5.3).
 *
 * - A slot with no deliverer records `suppressed: no_adapter`.
 * - A slot delivered by an adapter records `suppressed: adapter_not_built`,
 *   because no adapter exists yet.
 * - Anything else — today, `caller`, where the page asked and renders the
 *   answer itself — records `dispatched`.
 */
export interface DeliveryDecision {
  state: 'dispatched' | 'suppressed';
  reason: 'no_adapter' | 'adapter_not_built' | null;
}

export function deliveryFor(placement: { delivery: { mode: string } | null } | undefined): DeliveryDecision {
  if (!placement || !placement.delivery) return { state: 'suppressed', reason: 'no_adapter' };
  if (placement.delivery.mode === 'adapter') return { state: 'suppressed', reason: 'adapter_not_built' };
  return { state: 'dispatched', reason: null };
}
