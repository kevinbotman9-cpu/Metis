/**
 * Canonical serialisation and hashing.
 *
 * Every hash the platform publishes - decision IDs, input snapshots, chain
 * hashes - has to survive being recomputed on a different machine, in a
 * different process, months later. Plain JSON.stringify does not: it preserves
 * insertion order, so two structurally identical objects built by different
 * code paths serialise differently and therefore hash differently.
 *
 * canonicalise() removes that whole class of bug by sorting keys at every
 * depth and rejecting values that have no stable representation.
 */

import { createHash } from 'node:crypto';

/**
 * Produce a deterministic string for any JSON-shaped value.
 *
 * Object keys are sorted, so insertion order cannot affect the output. Arrays
 * keep their order, because order is meaningful in a candidate list or an
 * elimination cascade.
 */
export function canonicalise(value: unknown, path = '$'): string {
  if (value === null) return 'null';

  const t = typeof value;

  if (t === 'boolean') return value ? 'true' : 'false';

  if (t === 'number') {
    const n = value as number;
    // NaN and the infinities have no JSON form, and -0 serialises like 0 while
    // comparing differently. All three would make a hash unreproducible, so
    // fail loudly here rather than silently emitting null later.
    if (!Number.isFinite(n)) {
      throw new Error(`Cannot canonicalise non-finite number at ${path}: ${String(n)}`);
    }
    return Object.is(n, -0) ? '0' : String(n);
  }

  if (t === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((v, i) => canonicalise(v, `${path}[${i}]`)).join(',')}]`;
  }

  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      // undefined is absent from JSON, so treat it as absent here too rather
      // than letting it change the shape between runs.
      .filter((k) => obj[k] !== undefined)
      .sort();
    const body = keys
      .map((k) => `${JSON.stringify(k)}:${canonicalise(obj[k], `${path}.${k}`)}`)
      .join(',');
    return `{${body}}`;
  }

  throw new Error(`Cannot canonicalise ${t} at ${path}`);
}

/** sha256 of the canonical form, hex encoded. */
export function hash(value: unknown): string {
  return createHash('sha256').update(canonicalise(value), 'utf8').digest('hex');
}

/** Short, quotable prefix of a hash, for IDs a person has to read aloud. */
export function shortHash(value: unknown, length = 12): string {
  return hash(value).slice(0, length);
}

/**
 * Deterministic value in [0, 1) derived from a key.
 *
 * Stand-in for a scoring model: given the same customer, offer and
 * pinned model version it always returns the same number, which is exactly the
 * property a real pinned model must have. Never reach for an actual RNG in the
 * hot path - it would break replay.
 */
export function seededUnitInterval(...parts: (string | number)[]): number {
  const digest = createHash('sha256').update(parts.join(' '), 'utf8').digest();
  // 6 bytes is 48 bits, comfortably inside Number's exact integer range, so
  // the division loses nothing.
  return digest.readUIntBE(0, 6) / 2 ** 48;
}
