#!/usr/bin/env node
/**
 * Build the canonical-serialisation conformance corpus.
 *
 * Run: npm run corpus     (node --import tsx scripts/build-conformance-corpus.mjs)
 *
 * The corpus is the executable form of ADR-003. It is generated from the
 * TypeScript reference implementation and committed, so:
 *
 *   - the TS implementation is tested against it, which stops the corpus
 *     drifting from the reference;
 *   - any second implementation is tested against the same file, which is what
 *     makes "byte-identical across engines" checkable rather than aspirational.
 *
 * Cases are chosen for the rules a second implementation would plausibly get
 * wrong. Number formatting and lone surrogates are the whole point; the happy
 * path is already covered by every other test in the repository.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalise, hash } from '../packages/runtime/src/deterministic/canonical.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A case that must serialise. */
const ok = (name, value) => ({ name, value });
/** A case that must raise, naming the path at which it failed. */
const boom = (name, value) => ({ name, value, throws: true });

const CASES = [
  // --- Primitives ---------------------------------------------------------
  ok('null', null),
  ok('true', true),
  ok('false', false),
  ok('empty string', ''),
  ok('empty array', []),
  ok('empty object', {}),

  // --- Numbers: the rules most likely to be got wrong ----------------------
  ok('integer renders without a decimal point', 1),
  ok('a whole float is still an integer', 1.0),
  ok('negative zero collapses to zero', -0),
  ok('positive zero', 0),
  ok('simple decimal', 1.5),
  ok('negative decimal', -1.5),
  ok('one tenth', 0.1),
  ok('float error is preserved, not rounded away', 0.1 + 0.2),
  ok('repeating fraction takes 16 digits', 2 / 3),
  ok('21 digits stays positional', 1e20),
  ok('22 digits switches to exponent', 1e21),
  ok('negative, past the exponent threshold', -1e21),
  ok('1e-6 stays positional', 1e-6),
  ok('1e-7 takes a bare negative exponent', 1e-7),
  ok('smallest subnormal', 5e-324),
  ok('largest double', 1.7976931348623157e308),
  ok('exponent notation', 1.23e-10),
  // The literal loses precision, deliberately: that is the case. ADR-003 §
  // numbers requires shortest-round-trip `Number::toString`, and this asks what
  // an integer past 2^53 serialises to once the double has already rounded it.
  // Writing it any other way would be testing a different number.
  // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
  ok('integer beyond the exact range', 123456789012345678901234),
  ok('hundred', 100),

  // --- Numbers that must raise ---------------------------------------------
  boom('NaN', NaN),
  boom('positive infinity', Infinity),
  boom('negative infinity', -Infinity),
  boom('NaN nested in an array', [1, NaN]),
  boom('infinity nested two levels deep', { a: { b: Infinity } }),

  // --- Strings -------------------------------------------------------------
  ok('quote is escaped', 'a"b'),
  ok('backslash is escaped', 'back\\slash'),
  ok('solidus is not escaped', 'sla/sh'),
  ok('tab takes the short form', 'tab\there'),
  ok('newline takes the short form', 'nl\nhere'),
  ok('carriage return takes the short form', 'cr\rhere'),
  ok('backspace takes the short form', 'bs\bhere'),
  ok('form feed takes the short form', 'ff\fhere'),
  ok('nul takes a lowercase hex escape', '\u0000'),
  ok('unit separator takes a lowercase hex escape', '\u001f'),
  ok('space is literal', ' '),
  ok('delete is literal, being above u+001f', '\u007f'),
  ok('latin-1 is literal', 'é'),
  ok('cjk is literal', '中文'),
  ok('astral plane is literal', '\u{1F600}'),
  ok('lone high surrogate is escaped, not replaced', '\ud800'),
  ok('lone low surrogate is escaped', '\udfff'),
  ok('lone surrogate followed by text', '\ud800x'),
  ok('a well-formed pair is not escaped', '😀'),

  // --- Objects -------------------------------------------------------------
  ok('keys are sorted', { b: 1, a: 2, c: 3 }),
  ok('code-unit order puts uppercase before lowercase', { a: 1, A: 2, Z: 3, _: 4, 0: 5 }),
  ok('insertion order does not survive', { z: 1, y: 2, x: 3 }),
  ok('undefined members are omitted entirely', { a: 1, b: undefined, c: 3 }),
  ok('an object of only undefined members is empty', { a: undefined }),
  ok('the empty string is a valid key', { '': 1 }),
  ok('keys are escaped like values', { 'a"b': 1, 'c\\d': 2, 'e\tf': 3 }),
  ok('astral key sorts before u+fffd, by code unit', {
    '\u{1F600}': 1,
    '�': 2,
    z: 3,
  }),
  ok('nesting sorts at every depth', { b: { d: 1, c: 2 }, a: { f: 3, e: 4 } }),

  // --- Arrays --------------------------------------------------------------
  ok('array order is preserved', [3, 1, 2]),
  ok('heterogeneous array', [1, 'two', true, null, { a: 1 }, [2]]),
  ok('nested arrays', [[1, [2, [3]]]]),
  ok('null inside an array is kept, unlike undefined in an object', [null, 1]),

  // --- Non-values ----------------------------------------------------------
  boom('undefined at the top level', undefined),
  boom('a function', () => 1),
  boom('a symbol', Symbol('x')),
  boom('a bigint', 10n),

  // --- A shape the engine actually hashes ----------------------------------
  ok('a decision-shaped object', {
    tenantId: 'telco-uk',
    artifactId: 'art_bench',
    artifactVersion: '1.0.0',
    occurredAt: '2026-06-01T12:00:00.000Z',
    winner: null,
    candidateKeys: ['b', 'a'],
    scores: {
      upsell_5g: { propensity: 0.5, value: 1, boost: 1.25, context: 0.8, priority: 0.5 },
    },
    eliminations: [
      { nodeId: 'n_eligibility', eliminated: ['x'], survived: ['y'], reason: 'policy' },
    ],
    consentState: { marketing: true, profiling: false, thirdParty: false },
  }),
];

/**
 * Transport encoding.
 *
 * JSON cannot carry the values this corpus exists to test: it has no
 * `undefined`, no NaN, no negative zero, and its handling of lone surrogates
 * varies by parser. So each case value is encoded as an explicit tagged tree
 * that any language can decode without ambiguity:
 *
 *   numbers  as IEEE-754 bits in hex, which is exact and needs no parsing
 *   strings  as an array of UTF-16 code units, which carries lone surrogates
 *   objects  as ordered key/value pairs, so `undefined` members survive
 */
function encode(value) {
  if (value === null) return { t: 'null' };
  if (value === undefined) return { t: 'undefined' };

  const type = typeof value;
  if (type === 'boolean') return { t: 'bool', v: value };
  if (type === 'number') {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setFloat64(0, value);
    return { t: 'num', bits: buf.getBigUint64(0).toString(16).padStart(16, '0') };
  }
  if (type === 'string') return { t: 'str', units: [...codeUnits(value)] };
  if (type === 'function') return { t: 'unsupported', kind: 'function' };
  if (type === 'symbol') return { t: 'unsupported', kind: 'symbol' };
  if (type === 'bigint') return { t: 'unsupported', kind: 'bigint' };
  if (Array.isArray(value)) return { t: 'arr', items: value.map(encode) };
  if (type === 'object') {
    return {
      t: 'obj',
      members: Object.keys(value).map((k) => ({
        key: [...codeUnits(k)],
        value: encode(value[k]),
      })),
    };
  }
  throw new Error(`Corpus cannot encode ${type}`);
}

function* codeUnits(s) {
  for (let i = 0; i < s.length; i++) yield s.charCodeAt(i);
}

const cases = [];
for (const c of CASES) {
  if (c.throws) {
    let message = null;
    try {
      canonicalise(c.value);
    } catch (e) {
      message = e.message;
    }
    if (message === null) {
      throw new Error(`Case "${c.name}" was expected to raise and did not`);
    }
    cases.push({ name: c.name, value: encode(c.value), throws: true });
  } else {
    cases.push({
      name: c.name,
      value: encode(c.value),
      canonical: canonicalise(c.value),
      sha256: hash(c.value),
    });
  }
}

const corpus = {
  $comment:
    'GENERATED by scripts/build-conformance-corpus.mjs from the TypeScript ' +
    'reference implementation. Do not edit by hand; add a case to the script ' +
    'and regenerate. CI fails if this file and the script disagree.',
  spec: 'docs/adr/ADR-003-canonical-serialisation.md',
  algorithm: 'sha256',
  encoding: 'utf-8',
  digest: 'lowercase hex',
  cases,
};

const out = path.join(root, 'docs/conformance/canonical-corpus.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(corpus, null, 2) + '\n', 'utf8');

const throwing = cases.filter((c) => c.throws).length;
console.log(
  `Wrote ${path.relative(root, out).replace(/\\/g, '/')}: ${cases.length} cases ` +
    `(${cases.length - throwing} serialise, ${throwing} must raise).`
);
