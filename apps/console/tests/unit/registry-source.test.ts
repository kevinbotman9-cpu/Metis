import { describe, it, expect } from 'vitest';
import { ArtifactRegistry, InMemoryRegistryStore } from '@metis/registry';
import { InMemoryCatalogueStore } from '@metis/catalogue';
import { openCatalogue, CONSOLE_TENANT } from '@/mocks/catalogue-source';
import { openRegistry, RegistryDraftsMissing } from '@/mocks/registry-source';
import { artifacts } from '@/mocks/fixtures/artifacts';
import { compileContextFor, toSource } from '@/mocks/fixtures/compiled';

/**
 * What happens to the fixture flows when the console opens a registry.
 *
 * The rule in `mocks/registry-source.ts`, against memory so it runs everywhere.
 * That a published flow survives a restart needs a database and is proved in
 * `console-durable.test.ts`.
 */

const AT = '2026-09-14T09:00:00.000Z';
const FLOW = 'next-best-action';

const seededCatalogue = async () => (await openCatalogue(new InMemoryCatalogueStore())).catalogue;

describe('opening the console flows in a registry', () => {
  it('gives an empty registry every fixture flow as a draft, and puts what compiles into production', async () => {
    const registry = new ArtifactRegistry(new InMemoryRegistryStore());
    const opened = await openRegistry(registry, await seededCatalogue());

    expect(opened.seeded).toBe(true);
    expect((await registry.drafts(CONSOLE_TENANT)).map((d) => d.flowName)).toEqual(
      artifacts.map((a) => a.id).sort()
    );
    const env = await registry.environment(CONSOLE_TENANT, FLOW, 'production');
    expect(env?.activeVersion).toBe(artifacts.find((a) => a.id === FLOW)!.activeVersion);
  });

  it('uses a registry holding the tenant’s drafts as found, publishing nothing', async () => {
    const registry = new ArtifactRegistry(new InMemoryRegistryStore());
    const drawn = { ...artifacts[0], id: 'drawn-by-a-person', name: 'Drawn by a person' };
    await registry.saveDraft(CONSOLE_TENANT, drawn.id, drawn, 'sarah', AT);

    const opened = await openRegistry(registry, await seededCatalogue());

    expect(opened.seeded).toBe(false);
    expect((await registry.drafts(CONSOLE_TENANT)).map((d) => d.flowName)).toEqual(['drawn-by-a-person']);
    expect(await registry.flows(CONSOLE_TENANT)).toEqual([]);
  });

  it('refuses a registry holding published flows and no drafts, and writes nothing', async () => {
    // What a registry filled before drafts were registry state looks like: the
    // console could run these flows and could not show or edit any of them.
    const registry = new ArtifactRegistry(new InMemoryRegistryStore());
    const flow = artifacts.find((a) => a.id === FLOW)!;
    const published = await registry.publish(
      { tenantId: CONSOLE_TENANT, flowName: FLOW, version: flow.activeVersion, source: toSource(flow), actor: 'sarah', occurredAt: AT },
      compileContextFor(FLOW)
    );
    expect(published.status).toBe('published');

    const refusal = await openRegistry(registry, await seededCatalogue()).catch((e: unknown) => e);

    expect(refusal).toBeInstanceOf(RegistryDraftsMissing);
    expect((refusal as Error).message).toContain(FLOW);
    expect(await registry.drafts(CONSOLE_TENANT)).toEqual([]);
  });

  it('judges the seed against the catalogue as stored, not the fixtures', async () => {
    // The seed compiled against the fixture catalogue until 2026-09-14, so a
    // catalogue a person had edited was not the one the flows were judged by.
    // Here the stored catalogue no longer has an offer the flow names: against
    // the fixtures it compiles and goes live, against the store it is refused.
    const catalogue = await seededCatalogue();
    const flow = artifacts.find((a) => a.id === FLOW)!;
    const named = (await catalogue.read(CONSOLE_TENANT)).offers.find((o) => flow.candidateKeys.includes(o.key))!;
    await catalogue.putOffer(CONSOLE_TENANT, { ...named, key: `${named.key}_renamed` }, 'sarah', AT);

    const registry = new ArtifactRegistry(new InMemoryRegistryStore());
    await openRegistry(registry, catalogue);

    const env = await registry.environment(CONSOLE_TENANT, FLOW, 'production');
    expect(env?.activeVersion ?? null, 'a flow naming an offer the store does not hold went live').toBeNull();
    const refused = (await registry.events({ tenantId: CONSOLE_TENANT, flowName: FLOW })).filter(
      (e) => e.type === 'PublishRejected'
    );
    expect(refused.length).toBeGreaterThan(0);
    expect(refused[0].diagnostics?.map((d) => d.code)).toContain('UNKNOWN_OFFER');
  });
});
