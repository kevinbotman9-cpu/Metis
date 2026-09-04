import { it, expect } from 'vitest';
import { InMemoryRegistryStore } from '../src/memory-store';
import { describeRegistry } from './suite';

/**
 * The in-memory store against the shared behaviour suite, plus the one
 * guarantee only it can make: a caller cannot edit registry state through an
 * object it was handed.
 *
 * PostgreSQL gets that for free — a row is a copy — so it is asserted here
 * rather than in the shared suite.
 */
describeRegistry('registry over memory', {
  async create() {
    return new InMemoryRegistryStore();
  },
  extra(getRegistry) {
    it('cannot be edited through a returned artifact', async () => {
      // "Immutable" that depends on nobody trying is not immutable.
      const registry = getRegistry();
      const out = await registry.publish(
        {
          tenantId: 'telco-uk',
          strategyName: 'frozen-check',
          version: '1.0.0',
          source: {
            id: 'frozen-check',
            version: '1.0.0',
            tenantId: 'telco-uk',
            nodes: [
              { id: 'n1', type: 'source', label: 'Source', estimatedMs: 1 },
              { id: 'n2', type: 'arbitrate', label: 'Arbitrate', estimatedMs: 1 },
            ],
            edges: [{ from: 'n1', to: 'n2' }],
            candidateKeys: ['offer_a'],
            packageRanges: { '@metis/nodes-core': '^2.0.0' },
          } as never,
          actor: 'test',
          occurredAt: '2026-06-01T12:00:00.000Z',
        },
        (await import('./suite')).context()
      );
      if (out.status !== 'published') throw new Error('expected publish');

      expect(() => {
        (out.artifact as { version: string }).version = 'tampered';
      }).toThrow();

      const stored = await registry.version('telco-uk', 'frozen-check', '1.0.0');
      expect(stored?.artifact.version).toBe('1.0.0');
    });
  },
});
