# ADR-017: A condition can read the candidate it is judging

**Status:** Accepted
**Date:** 2026-09-14 (proposed)
**Decided:** 2026-09-14
**Deciders:** Product owner
**Owner:** Product owner
**Decision needed by:** — decided
**Accepted as written:** the `offer` root bound per candidate, and a condition
value that may name a path instead of holding a literal.
**Constrains:** `PolicyCondition` in `packages/core/src/domain.ts` and
`docs/metis-api.openapi.yaml`; `SchemaRoots` and `conditionProblems` in
`packages/core/src/profile-schema.ts`; `policyPasses` in
`packages/runtime/src/deterministic/engine.ts` and in
`engines/kotlin/engine/src/main/kotlin/com/metis/engine/Engine.kt`; both JSON
decoders of the Kotlin engine and service; `docs/conformance/decision-corpus.json`;
the conditions field in the console's policy editor.
**Arises from:** [G-075](../gaps.md), and ADR-014 §2's sentence *"the schema has
no per-candidate scope. Until one exists it is declared `origin: request`"*.

## Context

### Every condition reads the request, never the candidate

`policyPasses(policy, request.input)` evaluates every condition against the
request (`engine.ts:120`, `Engine.kt:126`). It is called once per candidate, but
it is given nothing about that candidate, so a policy returns the same answer
for every offer in a decision. Scope decides *which* offers a policy covers;
nothing lets a condition ask *about* the offer it covers.

A rule that is about the offer — *a retention offer must reduce, not increase,
the customer's bill* — cannot be written. G-075 recorded the consequence when
telco-uk carried such a rule: `pol_afford_retention` read `offer.monthly_delta`,
one number for the whole request, so every retention candidate passed or failed
together, and in the seed that number was a coin flip presented in the trace as
a Consumer Duty affordability refusal. That rule went with the telco-uk
catalogue, and telco-us declares no suitability policies; the fixture's own
description of `monthly_delta` now says why. The defect is gone from the traces
and still in the language: the next affordability rule a tenant writes will hit
it the same way.

### What already exists to build on

- **The candidate is already hashed.** `catalogueSnapshotHash` is a hash of the
  whole catalogue snapshot the decision ran against, offers and their
  `financials` included (`engine.ts:257-263`). A value read from the candidate's
  own record adds nothing to what a decision depends on and nothing to replay.
- **Paths are already typed.** `resolveField` resolves a dotted path through a
  declared root to a typed field, and `conditionProblems` refuses unknown fields,
  operators a type does not admit and values of the wrong type — in the compiler
  (`compile.ts:970-991`) and on every policy write (`route.ts`, `policyProblems`).
- **Missing values already fail closed.** `compare` refuses a numeric comparison
  against a missing value in both engines.

## Decision

### 1. A third root, `offer`, bound to the candidate

`SchemaRoots` gains an optional `candidate: { alias: 'offer', entity: 'Offer' }`.
A path beginning `offer.` resolves against an `Offer` entity the schema
declares, and at decision time reads the candidate's record in the catalogue
snapshot — not the request. Optional, so a schema that declares no candidate
root is still valid and simply has no `offer.` paths; the compiler then refuses
an `offer.` condition as `UNKNOWN_FIELD`, as it would any undeclared path.

- **Read from the snapshot, not the input.** The engine evaluates
  `offer.<path>` against the candidate object it already holds. Nothing is added
  to `request.input`, so `inputSnapshotHash` is unchanged and replay needs
  nothing it does not already have.
- **Declared, not inferred.** The `Offer` entity lists the fields a condition may
  read — `financials.price.amount`, `financials.cost.amount`,
  `financials.expectedMargin.amount`, `financials.termMonths`, `boost`, `tags` —
  with their types, the same way `Customer` does. A field the entity does not
  declare is `UNKNOWN_FIELD`, whatever the offer object happens to carry.
  Display metadata, timestamps and `updatedBy` are not decision inputs and are
  not declared.
- **The alias is fixed, because the engines never see the schema.** An artifact
  pins its schema by id, version and hash; neither engine receives the schema
  itself, so neither can look the candidate alias up. Both recognise a path as a
  candidate path by the literal prefix `offer.`. `offer` is the catalogue's own
  word for the object (the Vocabulary section of `CLAUDE.md`), and
  `schemaProblems` refuses a candidate root with any other alias, and a profile
  or request root that uses `offer`. Before this change no condition, fixture,
  corpus case or test read a path beginning `offer.`, so fixing the prefix
  changes no existing decision.
- **Its fields declare `origin: 'catalogue'`.** A new `FieldOrigin`, because
  none of the existing ones is true of an offer's price: it is not profile,
  request, interaction, aggregation or a connector's. `schemaProblems` refuses a
  `catalogue` field outside the candidate root's entities, and any other origin
  inside them.

### 2. A condition's value may name a path

`PolicyCondition.value` is either a literal, as today, or `{ path: string }`.

```
{ field: 'offer.financials.price.amount', operator: 'lt',
  value: { path: 'customer.monthly_spend' } }
```

- **Resolved per candidate, then compared.** Both sides are read — `offer.`
  paths from the candidate, every other path from the input — and the existing
  `compare` runs on the two values. No operator changes meaning.
- **Type-checked on both sides.** `conditionProblems` resolves the value path
  like the field path and refuses: an unknown value path (`UNKNOWN_FIELD`, with
  the same suggestion); two types that do not match (`VALUE_TYPE` — `money`
  against `money`, `integer` or `decimal` against either, enum against the same
  enum); and a path value on `in`, `not_in`, `contains`, `exists` and
  `not_exists`, where a path has no meaning.
- **A missing side fails closed.** A path that resolves to no value fails the
  comparison, as a missing field already does. It is never treated as a pass.
- **Literals are unchanged.** A condition whose value is not an object with
  exactly one key, `path`, is a literal and is evaluated and hashed exactly as
  today, so every existing policy, artifact and corpus case keeps its hash.
  An object literal with a `path` key cannot be written as a literal; no
  operator compares objects, and the type check already refuses one.

### 3. What moves, and what does not

- **No existing hash moves.** No existing policy reads `offer.` or holds a path
  value, and both are evaluated only where they appear. The corpus's 37 cases
  must pass unchanged in both engines; any that does not is a bug in this change.
- **New corpus cases carry the new shapes**, generated from the TypeScript engine
  as every case is: one retention offer that lowers the bill and one that raises
  it, under one suitability policy in one decision, recording one
  `SUITABILITY_FAILED` and one survivor; a literal compared against an `offer.`
  field; a path value whose other side is missing.
- **The Kotlin engine reads the raw offer.** Its typed `Offer` omits `price`,
  deliberately (`Domain.kt`). Candidate paths are read from the offer's raw JSON
  map, which the decoder keeps beside the typed record, for the same reason the
  catalogue hash is computed from the raw tree: a trimmed model that forgot a
  field would change a decision for reasons that have nothing to do with
  decisioning.

### 4. The editor offers what the language allows

The conditions field lists `offer.` paths with the others, and a comparison
operator on a numeric or enum field offers a choice between a literal and
another field of a compatible type. The picker is fed by `listFieldPaths`, which
walks the new root, so the list and the compiler cannot disagree.

## Consequences

- **A condition is no longer only about the customer.** A reader of a policy
  must look at the root of each path to know whether it varies across
  candidates. The trace's denial already names the policy per candidate, so the
  record stays legible; the policy list is where this is new.
- **The `Offer` entity is a second place an offer is described.** The domain
  type and the schema entity can drift. The descriptor check that diffs the
  registry against the OpenAPI schema is the pattern; the same diff, from the
  schema's `Offer` entity to the domain `Offer`, is part of the first slice.
- **Field-to-field comparison is the only expression added.** There is still no
  arithmetic. *"The offer costs at least £5 less than the current bill"* is not
  expressible; *"the offer costs less than the current bill"* is. A rule that
  needs a margin is written against a declared value, and a declared per-candidate
  derived value is the next decision if one is needed — not this one.
- **G-075's done-when changes subject.** It named a policy that no longer
  exists. It closes on the corpus case in §3 and a policy authored from the
  screen, not on `pol_afford_retention`.

## Alternatives considered

**An `offer` root with literal values only.** Smaller, and it lets a condition
see the candidate. It cannot compare the candidate against the customer, so the
case G-075 exists for — does this offer lower *this* customer's bill — stays
unwritable, and the next affordability rule would be written as a request
number again.

**Declared per-candidate derived values on the schema**, like aggregations:
`candidate.monthly_delta = offer price − customer bill`, computed per candidate
before the conditions run. It keeps the policy language literal-only, which is
the reason aggregations exist. It needs an arithmetic language in the schema,
evaluated identically in two engines under ADR-003's float rules, and it puts
an affordability definition in the data model rather than in the policy a
compliance officer reads. Kept as the next step if margins turn out to be
needed.

**Supply per-candidate values on the request** — `offer_values: { [key]: {...} }`.
It needs no language change. It makes the caller the source of facts about the
platform's own catalogue, which ADR-014 §4 exists to stop, and it grows the
input snapshot by the size of the candidate set on every decision.
