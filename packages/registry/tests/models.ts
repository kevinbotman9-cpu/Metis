import { it, expect } from 'vitest';
import type { ArtifactRegistry } from '../src/registry';
import type { ModelDeclaration } from '../src/models';

/**
 * Model versions, against every store. ADR-009 §4, step two.
 *
 * Called from inside `describeRegistry`, so the in-memory and PostgreSQL stores
 * answer the same assertions — the claim being that durable storage changes
 * nothing about what a publish means.
 */

const T = 'telco-us';
const AT = '2026-06-01T12:00:00.000Z';
const LATER = '2026-06-02T12:00:00.000Z';

export const declaration = (over: Partial<ModelDeclaration> = {}): ModelDeclaration => ({
  id: 'propensity_accept',
  version: '4.2.0',
  name: 'Accept propensity',
  description: 'How likely a customer is to accept an offer.',
  kind: 'propensity',
  features: [
    { path: 'customer.tenureMonths', type: 'integer' },
    { path: 'customer.segment', type: 'enum' },
  ],
  declaredP95Ms: 6,
  owner: 'data-science@telco.example',
  weightsHash: 'a'.repeat(64),
  trainedThrough: '2026-08-31',
  ...over,
});

export function modelVersionTests(getRegistry: () => ArtifactRegistry): void {
  it('publishes a model version with what it reads, what it costs and who answers for it', async () => {
    const registry = getRegistry();
    const out = await registry.publishModel(T, declaration(), 'sarah@telco.example', AT);

    expect(out.status).toBe('published');
    expect(await registry.modelVersion(T, 'propensity_accept', '4.2.0')).toEqual({
      ...declaration(),
      tenantId: T,
      publishedAt: AT,
      publishedBy: 'sarah@telco.example',
    });
  });

  it('refuses a declaration with problems, names every one, and stores nothing', async () => {
    const registry = getRegistry();
    const out = await registry.publishModel(
      T,
      declaration({
        version: '4.2',
        declaredP95Ms: 0,
        weightsHash: 'not-a-hash',
        features: [
          { path: 'customer.tenureMonths', type: 'integer' },
          { path: 'customer.tenureMonths', type: 'integer' },
        ],
      }),
      'sarah@telco.example',
      AT
    );

    expect(out.status).toBe('rejected');
    if (out.status !== 'rejected') return;
    expect(out.reason).toBe('invalid');
    expect(out.problems.map((p) => p.field).sort()).toEqual(
      ['declaredP95Ms', 'features.1.path', 'version', 'weightsHash'].sort()
    );
    expect(await registry.models(T)).toEqual([]);
  });

  it('treats republishing identical content as a no-op, whoever republishes it and whenever', async () => {
    const registry = getRegistry();
    await registry.publishModel(T, declaration(), 'sarah@telco.example', AT);
    const again = await registry.publishModel(T, declaration(), 'marcus.webb@telco.example', LATER);

    expect(again.status).toBe('unchanged');
    const stored = await registry.modelVersion(T, 'propensity_accept', '4.2.0');
    // The first publish is the fact. A retry is not a second one.
    expect(stored?.publishedBy).toBe('sarah@telco.example');
    expect(stored?.publishedAt).toBe(AT);
    expect(await registry.models(T)).toHaveLength(1);
  });

  it('refuses different content under a published version, and keeps the original', async () => {
    const registry = getRegistry();
    await registry.publishModel(T, declaration(), 'sarah@telco.example', AT);
    const out = await registry.publishModel(T, declaration({ declaredP95Ms: 2 }), 'sarah@telco.example', LATER);

    expect(out.status).toBe('rejected');
    if (out.status !== 'rejected' || out.reason !== 'immutable') throw new Error(`expected an immutable refusal, got ${JSON.stringify(out)}`);
    expect(out.existingHash).not.toBe(out.attemptedHash);
    expect(out.problems[0].message).toContain('new version');
    expect((await registry.modelVersion(T, 'propensity_accept', '4.2.0'))?.declaredP95Ms).toBe(6);
  });

  it('lists every version of every model, by model and newest version first', async () => {
    const registry = getRegistry();
    await registry.publishModel(T, declaration({ version: '4.2.0' }), 'sarah', AT);
    await registry.publishModel(T, declaration({ version: '4.10.0' }), 'sarah', AT);
    await registry.publishModel(T, declaration({ id: 'churn_risk', name: 'Churn risk', version: '1.0.0' }), 'sarah', AT);

    // 4.10.0 above 4.2.0: by version, not by string, or the newest scorer reads as the oldest.
    expect((await registry.models(T)).map((m) => `${m.id}@${m.version}`)).toEqual([
      'churn_risk@1.0.0',
      'propensity_accept@4.10.0',
      'propensity_accept@4.2.0',
    ]);
  });

  it('keeps one tenant’s models out of another’s', async () => {
    const registry = getRegistry();
    await registry.publishModel(T, declaration(), 'sarah', AT);
    await registry.publishModel('bank-uk', declaration({ declaredP95Ms: 30 }), 'ana', AT);

    expect(await registry.models(T)).toHaveLength(1);
    expect((await registry.modelVersion('bank-uk', 'propensity_accept', '4.2.0'))?.declaredP95Ms).toBe(30);
    expect(await registry.modelVersion('nobody', 'propensity_accept', '4.2.0')).toBeNull();
  });

  it('stores only what a version declares, not whatever else a caller sent', async () => {
    const registry = getRegistry();
    await registry.publishModel(
      T,
      { ...declaration(), tenantId: 'someone-else', publishedBy: 'forged', surprise: true } as never,
      'sarah@telco.example',
      AT
    );
    const stored = await registry.modelVersion(T, 'propensity_accept', '4.2.0');
    expect(stored?.tenantId).toBe(T);
    expect(stored?.publishedBy).toBe('sarah@telco.example');
    expect(stored).not.toHaveProperty('surprise');
  });
}
