import { scopeCovers, scopedCapsOn, type CatalogueSnapshot, type ContactsRead, type ExecArtifact } from '@metis/runtime';
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
  q: {
    tenantId: string;
    customerRef: string;
    channel: string;
    occurredAt: string;
    /**
     * The catalogue the decision runs against. Its scoped caps on this channel
     * each get a count of the contacts about their scope (ADR-021 §9). Omitted,
     * none are read, and the engine refuses the read if the catalogue has any.
     */
    catalogue?: Pick<CatalogueSnapshot, 'frequencyPolicies' | 'offers' | 'actions'>;
  },
  onUnavailable: (error: unknown) => void = () => {}
): Promise<ContactsRead> {
  const base = { tenantId: q.tenantId, customerRef: q.customerRef, channel: q.channel, until: q.occurredAt };
  try {
    const scoped = q.catalogue ? scopedCapsOn(q.catalogue, q.channel) : [];
    const [withinPeriod, ...perCap] = await Promise.all([
      ledger.contactsFor(base),
      // About the offers the engine will hold this cap to, and no others: the
      // same `scopeCovers` the constraint node uses, over the same snapshot.
      // An action-scoped cap counts the contacts about that action, and no
      // other action of its offer (ADR-019 §4); every other level counts by
      // offer, so an offer's cap covers all of its actions.
      ...scoped.map((c) =>
        ledger.contactsFor(
          c.scope.level === 'action'
            ? {
                ...base,
                actionKeys: q.catalogue!.actions.filter((a) => a.id === c.scope.targetId).map((a) => a.key),
              }
            : { ...base, offerIds: q.catalogue!.offers.filter((o) => scopeCovers(c.scope, o)).map((o) => o.id) }
        )
      ),
    ]);
    return {
      status: 'read',
      channel: q.channel,
      withinPeriod,
      ...(scoped.length > 0 ? { scoped: Object.fromEntries(scoped.map((c, i) => [c.id, perCap[i]])) } : {}),
    };
  } catch (e) {
    onUnavailable(e);
    return { status: 'unavailable', channel: q.channel };
  }
}
