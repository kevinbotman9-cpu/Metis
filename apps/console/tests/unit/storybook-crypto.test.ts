import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash as nodeCreateHash } from 'node:crypto';
import { createHash as shimCreateHash } from '../../.storybook/node-crypto';
import { placements, categories, objectives } from '@/mocks/fixtures/catalogue';

/**
 * Storybook's `node:crypto` against the real one. G-085.
 *
 * Storybook resolves `node:crypto` to `.storybook/node-crypto.ts`, because the
 * fixtures run the engine and the engine hashes. A story whose hashes differed
 * from the console's would show different decision ids and different seeded
 * numbers — a story that looks right and is not the product. So the shim is
 * held to Node's output byte for byte: directly, over inputs chosen to land on
 * every padding boundary, and through the engine's own `hash` and
 * `seededUnitInterval`, loaded once against each implementation.
 */

const node = (s: string) => nodeCreateHash('sha256').update(s, 'utf8').digest('hex');
const shim = (s: string) => shimCreateHash('sha256').update(s, 'utf8').digest('hex');

describe('the Storybook sha256', () => {
  it('matches the published test vectors', () => {
    expect(shim('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(shim('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(shim('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
  });

  it('matches Node at every length across the padding boundaries', () => {
    // 55, 56 and 64 bytes are where the length field stops fitting in the
    // last block; every length to 300 covers each case several times over.
    for (let n = 0; n <= 300; n++) {
      const s = Array.from({ length: n }, (_, i) => String.fromCharCode(33 + ((i * 7 + n) % 90))).join('');
      expect(shim(s), `length ${n}`).toBe(node(s));
    }
  });

  it('matches Node on multi-byte text, which is encoded as UTF-8 first', () => {
    for (const s of ['é', 'Über · Café', '₤ 12.00 — offer', '🙂🙃', 'naïve façade 日本語 '.repeat(20)]) {
      expect(shim(s), s).toBe(node(s));
    }
  });

  it('matches Node on a megabyte, and across several updates', () => {
    const big = 'x'.repeat(1_000_000);
    expect(shim(big)).toBe(node(big));
    const parts = ['plc_homepage_hero', ' ', 'seed', ' ', '42'];
    const streamed = parts.reduce((h, p) => h.update(p, 'utf8'), shimCreateHash('sha256')).digest('hex');
    expect(streamed).toBe(node(parts.join('')));
  });

  it('reads a digest back as a number the way Buffer does', () => {
    for (const s of ['a', 'seed 1', 'triggered_outbound 2026-09-01']) {
      const want = nodeCreateHash('sha256').update(s, 'utf8').digest().readUIntBE(0, 6);
      expect(shimCreateHash('sha256').update(s, 'utf8').digest().readUIntBE(0, 6)).toBe(want);
    }
  });

  it('refuses an algorithm it does not implement, rather than returning a wrong hash', () => {
    expect(() => shimCreateHash('md5')).toThrow(/sha256 only/);
  });
});

describe("the engine's hashing, run on each implementation", () => {
  afterEach(() => {
    vi.doUnmock('node:crypto');
    vi.resetModules();
  });

  const load = async (withShim: boolean) => {
    vi.resetModules();
    if (withShim) vi.doMock('node:crypto', () => import('../../.storybook/node-crypto'));
    else vi.doUnmock('node:crypto');
    return import('@metis/runtime/deterministic/canonical');
  };

  it('gives the same hash and the same seeded numbers for the seeded catalogue', async () => {
    const real = await load(false);
    const inBrowser = await load(true);
    // The two loads must be distinct module instances, or this compares a
    // function with itself and cannot fail.
    expect(inBrowser.hash).not.toBe(real.hash);

    for (const record of [...placements, ...categories, ...objectives]) {
      expect(inBrowser.hash(record), record.id).toBe(real.hash(record));
    }
    for (const p of placements) {
      expect(inBrowser.seededUnitInterval(p.key, 'seed', 7)).toBe(real.seededUnitInterval(p.key, 'seed', 7));
    }
  });
});
