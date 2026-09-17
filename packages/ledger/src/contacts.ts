import type { CatalogueSnapshot, ContactsRead, ExecArtifact } from '@metis/runtime';
import type { DecisionLedger } from './ledger';

/**
 * Frequency caps read the platform's own contact history. ADR-021.
 *
 * Until this, `contactHistory` was whatever the caller typed: the storefront
 * reported how often it had shown an offer and knew nothing of any other
 * channel, so a cap the platform declared was enforced on a number the
 * platform never checked (ADR-014 §10). Both services — the console's
 * development API and the decision service — resolve a request through these
 * two functions, so they cannot read differently.
 */

/**
 * Whether a decision on this channel would hold any candidate to a cap: the
 * flow has a constraint node, and the catalogue has an active frequency policy
 * for this channel or for every channel.
 *
 * The platform reads the ledger only then. A decision it did not read for
 * carries no `contactsRead`, and that absence is what tells a trace "not read"
 * from "read and found none" (ADR-021 §5).
 */
export function capsApply(artifact: Pick<ExecArtifact, 'nodes'>, catalogue: Pick<CatalogueSnapshot, 'frequencyPolicies'>, channel: string): boolean {
  if (!artifact.nodes.some((n) => n.type === 'constraint')) return false;
  return catalogue.frequencyPolicies.some((c) => c.active && (!c.channel || c.channel === channel));
}

/**
 * This customer's contacts on this channel before `occurredAt`, as the engine
 * takes them.
 *
 * **A read that fails is `unavailable`, never zero** (ADR-021 §4). Zero would
 * offer a customer whose cap is already spent; `unavailable` makes the engine
 * hold back every candidate a cap covers, naming the cap. Why it failed is
 * reported to `onUnavailable` and kept out of the decision, because an error
 * message is operational and a decision's hash must not depend on one.
 */
export async function readContacts(
  ledger: Pick<DecisionLedger, 'contactsFor'>,
  q: { tenantId: string; customerRef: string; channel: string; occurredAt: string },
  onUnavailable: (error: unknown) => void = () => {}
): Promise<ContactsRead> {
  try {
    const withinPeriod = await ledger.contactsFor({
      tenantId: q.tenantId,
      customerRef: q.customerRef,
      channel: q.channel,
      until: q.occurredAt,
    });
    return { status: 'read', channel: q.channel, withinPeriod };
  } catch (e) {
    onUnavailable(e);
    return { status: 'unavailable', channel: q.channel };
  }
}
