/**
 * `node:crypto`, for Storybook only: SHA-256 and nothing else.
 *
 * The fixtures every realistic story renders from are the engine's output —
 * `mocks/fixtures/seed.ts` and `engine.ts` run `@metis/runtime`'s deterministic
 * engine over the catalogue — and the engine hashes with `createHash('sha256')`
 * from `node:crypto`. A browser has no `node:crypto`. From 2026-09-09 05:04,
 * when the catalogue fixture first imported the seed (`7af77ff`), Vite
 * externalised the import, `build-storybook` failed outright, and any story
 * using the fixtures threw in `storybook dev`. Nothing ran Storybook in CI, so
 * nothing went red. G-085.
 *
 * `.storybook/main.ts` resolves `node:crypto` to this file when, and only when,
 * Storybook bundles. The engine's own hashing — every decision id and chain
 * hash the platform publishes — still runs on Node's native implementation;
 * nothing here is on that path. `tests/unit/storybook-crypto.test.ts` holds
 * this implementation byte-identical to Node's, including through the engine's
 * `hash` and `seededUnitInterval`, so a story's numbers are the numbers the
 * console shows.
 *
 * FIPS 180-4, written out rather than depended on: fifty lines, no package to
 * trust, and a differential test against the real thing is stronger evidence
 * than a dependency's own test suite.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

function sha256(message: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  // Pad: a 1 bit, zeros, then the length in bits as a 64-bit big-endian integer,
  // to a whole number of 64-byte blocks.
  const length = message.length;
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);

  const w = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((word, i) => outView.setUint32(i * 4, word));
  return out;
}

/** A digest as bytes, with the one `Buffer` method the engine reads a digest through. */
class Digest extends Uint8Array {
  readUIntBE(offset: number, byteLength: number): number {
    let value = 0;
    for (let i = 0; i < byteLength; i++) value = value * 256 + this[offset + i];
    return value;
  }
}

class Sha256 {
  private chunks: Uint8Array[] = [];

  update(data: string | Uint8Array, encoding?: 'utf8'): this {
    if (typeof data === 'string' && encoding !== undefined && encoding !== 'utf8') {
      throw new Error(`Storybook's node:crypto encodes strings as utf8 only, not ${encoding}`);
    }
    this.chunks.push(typeof data === 'string' ? new TextEncoder().encode(data) : data);
    return this;
  }

  digest(): Digest;
  digest(encoding: 'hex'): string;
  digest(encoding?: 'hex'): Digest | string {
    const all = new Uint8Array(this.chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of this.chunks) {
      all.set(c, at);
      at += c.length;
    }
    const bytes = sha256(all);
    if (encoding === undefined) return new Digest(bytes);
    if (encoding !== 'hex') throw new Error(`Storybook's node:crypto digests as hex or bytes only, not ${encoding}`);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
}

export function createHash(algorithm: string): Sha256 {
  if (algorithm !== 'sha256') {
    throw new Error(`Storybook's node:crypto implements sha256 only, not ${algorithm}: see .storybook/node-crypto.ts`);
  }
  return new Sha256();
}

export default { createHash };
