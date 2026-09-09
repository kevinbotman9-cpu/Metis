import { describe, it, expect } from 'vitest';
import { replay } from '@metis/runtime/deterministic/engine';
import { exportTenant, importTenant, verifyBundle, PortabilityError, FORMAT_VERSION } from '../src';
import {
  TENANT,
  FLOW,
  artifact,
  catalogue,
  request,
  emptyInstance,
  populatedInstance,
} from './fixtures';

/**
 * The conformance utility §9 asks for, and the evidence behind §14's claim of
 * *provable* exitability.
 *
 * The word that does the work is "provable". Every vendor says data can be
 * exported. What almost none of them can show is that the export, imported
 * somewhere else, decides the same way — so that is what this asserts, and it
 * asserts it on the number the platform already stakes everything on: the
 * chain hash.
 */

const AT = '2026-09-06T10:00:00.000Z';

describe('a tenant survives being exported and imported', () => {
  it('re-exports byte-identically after a round trip', async () => {
    const source = await populatedInstance();
    const first = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });

    const target = emptyInstance();
    await importTenant(first, {
      registryStore: target.registryStore,
      ledger: target.ledger,
      catalogue: target.catalogue,
      catalogueStore: target.catalogueStore,
    });

    const second = await exportTenant(target, { tenantId: TENANT, exportedAt: AT });

    // The strongest available statement: not "equivalent", not "the same
    // count", but the same bytes. Anything the import dropped, reordered or
    // re-derived shows up here.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(second.manifest.bundleHash).toBe(first.manifest.bundleHash);
  });

  it('keeps every version hash', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });

    const target = emptyInstance();
    await importTenant(bundle, {
      registryStore: target.registryStore,
      ledger: target.ledger,
      catalogue: target.catalogue,
      catalogueStore: target.catalogueStore,
    });

    const before = await source.registry.versions(TENANT, FLOW);
    const after = await target.registry.versions(TENANT, FLOW);

    expect(after.map((v) => v.version)).toEqual(before.map((v) => v.version));
    // An import that republished through the compiler would recompute these,
    // and a compiler one patch newer would produce different ones. The
    // customer's evidence that a decision came from 1.0.0 *is* this hash.
    expect(after.map((v) => v.artifact.artifactHash)).toEqual(
      before.map((v) => v.artifact.artifactHash)
    );
  });

  it('keeps the environment state, including what was shadowing', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });

    const target = emptyInstance();
    await importTenant(bundle, {
      registryStore: target.registryStore,
      ledger: target.ledger,
      catalogue: target.catalogue,
      catalogueStore: target.catalogueStore,
    });

    const production = (await target.registry.environments(TENANT, FLOW)).find(
      (e) => e.environment === 'production'
    );
    expect(production?.activeVersion).toBe('1.0.0');
    // A migration in progress is part of what a tenant owns. Dropping it would
    // silently abandon the comparison the customer was mid-way through.
    expect(production?.shadowVersion).toBe('1.1.0');
  });

  it('keeps the catalogue — what the engine decides from', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });

    const target = emptyInstance();
    await importTenant(bundle, {
      registryStore: target.registryStore,
      ledger: target.ledger,
      catalogue: target.catalogue,
      catalogueStore: target.catalogueStore,
    });

    const before = await source.catalogue.read(TENANT);
    const after = await target.catalogue.read(TENANT);

    // Exporting the decisions without the catalogue would carry the answers
    // and leave behind the thing that produced them — a replay on the new
    // instance would have nothing to rank.
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(after.offers.length).toBeGreaterThan(0);
    expect(after.arbitration).not.toBeNull();

    // The authoring history moves too: who changed a boost, and when, is part
    // of what a regulated tenant is taking with them.
    const events = await target.catalogue.events({ tenantId: TENANT });
    expect(events.length).toBe(bundle.catalogue_events.length);
    expect(events.length).toBeGreaterThan(0);
  });

  it('keeps every ledger record and its outcomes', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });

    const target = emptyInstance();
    await importTenant(bundle, {
      registryStore: target.registryStore,
      ledger: target.ledger,
      catalogue: target.catalogue,
      catalogueStore: target.catalogueStore,
    });

    const before = await source.ledger.query({ tenantId: TENANT });
    const after = await target.ledger.query({ tenantId: TENANT });
    expect(after.length).toBe(before.length);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));

    const outcomes = await target.ledger.outcomesFor(TENANT, before[0].decisionId);
    expect(outcomes.map((o) => o.type).sort()).toEqual(['acceptance', 'impression']);
  });

  it('replays a pre-export decision on the imported instance to the same chain hash', async () => {
    // This is the assertion the differentiator rests on. Everything above says
    // the bytes moved; this says the *behaviour* moved with them.
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });

    const target = emptyInstance();
    await importTenant(bundle, {
      registryStore: target.registryStore,
      ledger: target.ledger,
      catalogue: target.catalogue,
      catalogueStore: target.catalogueStore,
    });

    const [entry] = await target.ledger.query({ tenantId: TENANT });
    const original = (await source.ledger.query({ tenantId: TENANT }))[0];

    // A DecisionRecord holds the input *snapshot hash*, not the request, so
    // the caller supplies the input again — which is the point: replay proves
    // the recorded decision follows from inputs held outside it.
    const result = replay(artifact, catalogue, entry.record, request('cust_1').input);

    expect(result.identical, JSON.stringify(result.differences ?? [])).toBe(true);
    expect(entry.chainHash).toBe(original.chainHash);
  });
});

describe('a bundle that cannot be trusted is refused', () => {
  it('verifies a freshly exported bundle', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });
    expect(verifyBundle(bundle)).toEqual([]);
  });

  it('catches rows altered after export', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });

    bundle.decision_records[0].chainHash = 'f'.repeat(64);

    const problems = verifyBundle(bundle);
    expect(problems.map((p) => p.kind)).toContain('file-hash');
  });

  it('catches a manifest edited to match altered rows', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });

    // Someone who changes a row and then fixes the file hash to match still
    // has to get past the bundle hash, which covers the file list.
    bundle.decision_records[0].chainHash = 'f'.repeat(64);
    const file = bundle.manifest.files.find((f) => f.entity === 'decision_records')!;
    const { hash } = await import('@metis/runtime/deterministic/canonical');
    file.sha256 = hash(bundle.decision_records);

    const problems = verifyBundle(bundle);
    expect(problems.map((p) => p.kind)).toEqual(['bundle-hash']);
  });

  it('refuses a bundle from a future format version, rather than importing part of it', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });
    bundle.manifest.formatVersion = '2.0.0';

    const problems = verifyBundle(bundle);
    expect(problems.map((p) => p.kind)).toEqual(['format-version']);

    const target = emptyInstance();
    await expect(
      importTenant(bundle, {
      registryStore: target.registryStore,
      ledger: target.ledger,
      catalogue: target.catalogue,
      catalogueStore: target.catalogueStore,
    })
    ).rejects.toThrow(PortabilityError);

    // Nothing landed. A half-import is worse than a refusal because it looks
    // like success.
    expect(await target.registry.flows(TENANT)).toEqual([]);
    expect(await target.ledger.query({ tenantId: TENANT })).toEqual([]);
  });

  it('accepts a newer patch of the same major', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });
    const [major] = FORMAT_VERSION.split('.');
    bundle.manifest.formatVersion = `${major}.9.9`;
    expect(verifyBundle(bundle).map((p) => p.kind)).not.toContain('format-version');
  });

  it('refuses a target that already holds the tenant', async () => {
    const source = await populatedInstance();
    const bundle = await exportTenant(source, { tenantId: TENANT, exportedAt: AT });

    const target = await populatedInstance();
    await expect(
      importTenant(bundle, {
      registryStore: target.registryStore,
      ledger: target.ledger,
      catalogue: target.catalogue,
      catalogueStore: target.catalogueStore,
    })
    ).rejects.toThrow(/already exists in the target/);
  });
});
