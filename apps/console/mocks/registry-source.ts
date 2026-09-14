/**
 * The console's decision flows, opened from a real registry.
 *
 * Until 2026-09-14 the flows were the last thing a person authored that a
 * restart threw away. Drafts were an array in the development store; published
 * versions and environment pointers sat in an `InMemoryRegistryStore` that every
 * start refilled from the fixture flows — compiled against the *fixture*
 * catalogue, although the catalogue itself had been durable for a day. So after
 * a restart a published flow was gone, and what remained had been judged
 * against a catalogue nobody was editing.
 *
 * Now drafts, versions, environments and the registry's event log live in
 * `@metis/registry`: PostgreSQL when `METIS_DATABASE_URL` is set, memory
 * otherwise, chosen the same way as the catalogue and the ledger.
 *
 * ## What happens to the seed
 *
 * The same rule as `catalogue-source.ts`, applied after the catalogue is open:
 *
 * - **A registry holding nothing for `telco-us`** is given the fixture flows.
 *   Each becomes a draft, and each of its versions goes through the real publish
 *   path **against the catalogue as stored** — so a catalogue a person edited
 *   before this registry existed is the one the seed is judged by, and a flow
 *   that no longer compiles against it is refused and has no active version.
 * - **A registry holding the tenant's drafts** is used exactly as found.
 * - **A registry holding published flows and no drafts** is refused. Decisions
 *   would run those flows while the console had nothing to show or edit for
 *   them, and seeding drafts beside them would put fixture graphs next to
 *   versions they did not produce.
 *
 * There is no refusal for "another tenant only", unlike the catalogue: the
 * registry store cannot list tenants. The catalogue in the same database has
 * already refused that case before this runs. A registry in a *different*
 * database from its catalogue is not a configuration this console can make,
 * since both read `METIS_DATABASE_URL`.
 *
 * Seeding is a sequence of writes and not a transaction, like the catalogue's.
 * A seed interrupted after the first draft leaves a registry the next start
 * uses as found, with some flows missing; the error says so.
 */

import type { ArtifactRegistry } from '@metis/registry';
import type { Catalogue } from '@metis/catalogue';
import { artifacts } from './fixtures/artifacts';
import { compileContextFor, compileSourcesFrom, toSource } from './fixtures/compiled';
import { CONSOLE_TENANT } from './catalogue-source';

export class RegistryDraftsMissing extends Error {
  constructor(
    readonly tenantId: string,
    readonly flows: string[]
  ) {
    super(
      `The registry holds published flows for '${tenantId}' (${flows.join(', ')}) and no drafts. ` +
        'The console edits a flow through its draft, so it would run these and be unable to show ' +
        'them, and seeding fixture drafts beside them would pair graphs with versions they did not ' +
        'produce. Import a bundle that carries drafts (format 4.0.0 or later), or start from an empty database.'
    );
    this.name = 'RegistryDraftsMissing';
  }
}

export interface OpenedRegistry {
  /** Whether this open wrote the fixture flows, or found the tenant's drafts. */
  seeded: boolean;
}

/**
 * Open the console's flows in a registry: use them, seed them, or refuse.
 *
 * Read once before anything is written, so the decision is about what the
 * registry held rather than what this call has begun to write.
 */
export async function openRegistry(
  registry: ArtifactRegistry,
  catalogue: Catalogue,
  tenantId = CONSOLE_TENANT
): Promise<OpenedRegistry> {
  const [drafts, flows] = await Promise.all([registry.drafts(tenantId), registry.flows(tenantId)]);
  if (drafts.length > 0) return { seeded: false };
  if (flows.length > 0) throw new RegistryDraftsMissing(tenantId, flows);

  await seedFlows(registry, catalogue, tenantId);
  return { seeded: true };
}

/**
 * Put the fixture flows through the real publish path.
 *
 * Not inserted directly: they are compiled and either accepted or refused,
 * exactly as a publish from the console would be. Accepted versions that the
 * fixture calls active are promoted to `production`; a refused one simply has
 * no active version, because a flow the compiler refuses cannot be running.
 */
async function seedFlows(
  registry: ArtifactRegistry,
  catalogue: Catalogue,
  tenantId: string
): Promise<void> {
  const at = '2026-08-01T09:00:00.000Z';
  try {
    // One read, so every flow is judged against the same catalogue.
    const sources = compileSourcesFrom(await catalogue.read(tenantId));

    for (const artifact of artifacts) {
      await registry.saveDraft(tenantId, artifact.id, artifact, artifact.updatedBy, artifact.updatedAt);

      const accepted = new Set<string>();
      // Oldest first, so publishedAt ordering matches the order of release.
      for (const version of [...artifact.versions].reverse()) {
        const source = toSource(artifact);
        const outcome = await registry.publish(
          {
            tenantId,
            flowName: artifact.id,
            version,
            source: {
              ...source,
              version,
              candidateKeys: artifact.priorCandidateKeys?.[version] ?? source.candidateKeys,
            },
            actor: artifact.updatedBy,
            occurredAt: at,
          },
          // The context the console judges this flow by, with this flow's own
          // served channels (G-071), over the stored catalogue.
          compileContextFor(artifact.id, sources)
        );
        if (outcome.status !== 'rejected') accepted.add(version);
      }

      if (artifact.status === 'active' && accepted.has(artifact.activeVersion)) {
        await registry.promote(tenantId, artifact.id, artifact.activeVersion, 'production', artifact.updatedBy, at);
      }
    }
  } catch (e) {
    throw new Error(
      `Seeding the flows for '${tenantId}' failed partway: ${(e as Error).message}. The registry now ` +
        'holds part of the seed, and the next start will use that part as found. Start from an empty database.'
    );
  }
}
