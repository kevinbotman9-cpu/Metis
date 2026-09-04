import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalise, hash } from '../src/deterministic/canonical';

/**
 * The reference implementation, tested against the corpus it generated.
 *
 * Circular only in appearance. The corpus is committed, so this test compares
 * today's implementation against the recorded output of the day the corpus was
 * built. A change to canonicalise() that alters any hash fails here, and that
 * is the point: those hashes are decision ids and chain hashes that already
 * exist in stored traces. Changing them is a breaking change to the platform's
 * central claim, and it should take a deliberate regeneration to do it.
 *
 * The same file drives engines/kotlin. If both pass, both agree.
 */

const CORPUS = path.resolve(__dirname, '../../../docs/conformance/canonical-corpus.json');

type Encoded =
  | { t: 'null' }
  | { t: 'undefined' }
  | { t: 'bool'; v: boolean }
  | { t: 'num'; bits: string }
  | { t: 'str'; units: number[] }
  | { t: 'arr'; items: Encoded[] }
  | { t: 'obj'; members: { key: number[]; value: Encoded }[] }
  | { t: 'unsupported'; kind: string };

interface Case {
  name: string;
  value: Encoded;
  canonical?: string;
  sha256?: string;
  throws?: boolean;
}

const corpus: { cases: Case[]; algorithm: string; encoding: string } = JSON.parse(
  fs.readFileSync(CORPUS, 'utf8')
);

function fromUnits(units: number[]): string {
  // Not String.fromCharCode(...units): a long key would blow the argument
  // limit, and the corpus is allowed to grow.
  let out = '';
  for (const u of units) out += String.fromCharCode(u);
  return out;
}

function decode(e: Encoded): unknown {
  switch (e.t) {
    case 'null':
      return null;
    case 'undefined':
      return undefined;
    case 'bool':
      return e.v;
    case 'num': {
      const buf = new DataView(new ArrayBuffer(8));
      buf.setBigUint64(0, BigInt('0x' + e.bits));
      return buf.getFloat64(0);
    }
    case 'str':
      return fromUnits(e.units);
    case 'arr':
      return e.items.map(decode);
    case 'obj': {
      const out: Record<string, unknown> = {};
      for (const m of e.members) out[fromUnits(m.key)] = decode(m.value);
      return out;
    }
    case 'unsupported':
      // The values JSON cannot carry, rebuilt so the "must raise" cases are
      // testing the real thing rather than a stand-in.
      if (e.kind === 'function') return () => 1;
      if (e.kind === 'symbol') return Symbol('x');
      if (e.kind === 'bigint') return 10n;
      throw new Error(`Unknown unsupported kind: ${e.kind}`);
  }
}

describe('canonical serialisation conformance (ADR-003)', () => {
  it('the corpus is present and covers both outcomes', () => {
    expect(corpus.algorithm).toBe('sha256');
    expect(corpus.cases.length).toBeGreaterThan(50);
    expect(corpus.cases.some((c) => c.throws)).toBe(true);
    expect(corpus.cases.some((c) => !c.throws)).toBe(true);
  });

  for (const c of corpus.cases) {
    if (c.throws) {
      it(`raises: ${c.name}`, () => {
        expect(() => canonicalise(decode(c.value))).toThrow();
      });
    } else {
      it(`serialises: ${c.name}`, () => {
        const value = decode(c.value);
        expect(canonicalise(value)).toBe(c.canonical);
        expect(hash(value)).toBe(c.sha256);
      });
    }
  }

  it('a decoded object keeps undefined members as undefined, not null', () => {
    // If the transport encoding lost this distinction, the "undefined members
    // are omitted" cases would be testing nothing.
    const c = corpus.cases.find((x) => x.name === 'undefined members are omitted entirely')!;
    const decoded = decode(c.value) as Record<string, unknown>;
    expect('b' in decoded).toBe(true);
    expect(decoded.b).toBeUndefined();
    expect(canonicalise(decoded)).toBe('{"a":1,"c":3}');
  });
});
