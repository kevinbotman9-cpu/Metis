# METIS engine — Kotlin

A second implementation of the canonical serialisation contract in
[ADR-003](../../docs/adr/ADR-003-canonical-serialisation.md).

## What this is for

The platform's central claim is that a decision replays byte-identically. That
rests on a hash, which rests on a serialisation. While there was one
implementation, "the serialisation" meant one file of TypeScript, and the claim
was really about that file rather than about a specification.

This module exists to make the difference visible. It implements the same rules
in a different language and is held to byte-identical output by the corpus in
`docs/conformance/canonical-corpus.json`, which is generated from the
TypeScript reference. Nothing here defines anything — it can only agree or
disagree.

## Run it

```bash
./gradlew test
```

Reads the corpus from the repository root, so it must be run from this
directory. If the corpus is missing, run `npm run corpus` at the root first.

## What it deliberately does not do

**No JSON library.** A canonicaliser built on Jackson or kotlinx.serialization
would inherit that library's opinions about number formatting, key ordering and
surrogate handling — the three things ADR-003 exists to pin down. The
implementation depends on nothing beyond the JDK; Jackson appears only in the
test, to read the corpus.

**No `Double.toString`.** ECMAScript's `Number::toString` and Java's
`Double.toString` disagree, and not cosmetically: `1` vs `1.0`, `1e+21` vs
`1.0E21`, `1e-7` vs `1.0E-7`. On JDK 17 `Double.toString` is also not
shortest-round-trip, so `5e-324` comes back as `4.9E-324`. Substituting it
fails 25 of the 58 serialising cases — which is how we know the corpus is doing
its job.

## What is not ported

Only canonicalisation and hashing. The decision engine itself — policy
evaluation, arbitration, the trace — is still TypeScript only. That is the
right order: the serialisation is the part where two implementations can
silently disagree, and until it is proven portable, porting the engine on top
of it would be building on an unverified foundation.

Porting the engine is now a bounded piece of work with an objective finish
line: extend the corpus from values to whole decisions (artifact + catalogue +
request in, chain hash out) and make this module pass that too.
