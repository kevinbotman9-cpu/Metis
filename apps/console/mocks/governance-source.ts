/**
 * The console's change sets and audit log, opened from a real store.
 *
 * Until 2026-09-14 both were arrays in the development store while the
 * catalogue they change and the flows they describe were durable. After a
 * restart an approved change set came back pending over a catalogue that
 * already held its edit — approving it again applied the diff twice — and the
 * audit log had lost who approved an edit the store still held.
 *
 * Now they live in `@metis/governance`: PostgreSQL when `METIS_DATABASE_URL` is
 * set, memory otherwise.
 *
 * ## What happens to the seed
 *
 * The catalogue's rule, and for the same reasons (`catalogue-source.ts`):
 *
 * - **An empty store** is given the fixture change sets, decided and pending as
 *   the fixtures have them, and the fixture audit log in its order.
 * - **A store holding `telco-us`** is used exactly as found.
 * - **A store holding only other tenants** is refused.
 *
 * Written through the store rather than `Governance`, as a restore: the facade
 * opens change sets pending and assigns audit ids, and the seed has decided
 * change sets and events cited by id elsewhere in the fixtures. Not a
 * transaction, like every other seed here.
 */

import type { GovernanceStore } from '@metis/governance';
import { changeSets, auditEvents } from './fixtures/governance';
import { CONSOLE_TENANT } from './catalogue-source';

export class GovernanceTenantRefused extends Error {
  constructor(
    readonly tenantId: string,
    readonly found: string[]
  ) {
    super(
      `The governance store holds ${found.map((t) => `'${t}'`).join(', ')} and not '${tenantId}'. ` +
        `This console serves '${tenantId}' alone and will not write its change sets and audit log beside ` +
        "another tenant's. Point METIS_DATABASE_URL at an empty database, or import the tenant first."
    );
    this.name = 'GovernanceTenantRefused';
  }
}

export interface OpenedGovernance {
  /** Whether this open wrote the seed, or found the tenant already there. */
  seeded: boolean;
}

export async function openGovernance(
  store: GovernanceStore,
  tenantId = CONSOLE_TENANT
): Promise<OpenedGovernance> {
  const tenants = await store.listTenants();
  if (tenants.includes(tenantId)) return { seeded: false };
  if (tenants.length > 0) throw new GovernanceTenantRefused(tenantId, tenants);

  try {
    for (const changeSet of changeSets) await store.insertChangeSet(tenantId, changeSet);
    // The fixture log is newest first and the store appends, so oldest goes in
    // first and the log reads back in the fixture's order.
    for (const event of [...auditEvents].reverse()) await store.appendAuditEvent(tenantId, event);
  } catch (e) {
    throw new Error(
      `Seeding the change sets and audit log for '${tenantId}' failed partway: ${(e as Error).message}. ` +
        'The store now holds part of the seed, and the next start will use that part as found. Start from an empty database.'
    );
  }
  return { seeded: true };
}
