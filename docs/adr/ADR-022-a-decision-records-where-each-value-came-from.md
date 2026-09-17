# ADR-022: A decision records where each value came from, not which connector could have supplied it

**Status:** Proposed
**Date:** 2026-09-17 (proposed)
**Owner:** Product owner
**Decision needed by:** the commit that starts ADR-019's reseed (slice 5 of the
data-layer order in `docs/DIRECTIVE.md`). This changes the hashed decision in
both engines. Landing it with that reseed costs one regeneration; landing it
after costs a second, moving every decision id again.
**Constrains:** `packages/runtime/src/integration/resolve.ts`; the source node
and decision record in `packages/runtime/src/deterministic/engine.ts` and
`engines/kotlin/engine` (`Engine.kt`, `Domain.kt`, `Canon.kt`);
`packages/core/src/domain.ts` (`SourceBinding`, `SourceCall`);
`docs/metis-api.openapi.yaml` (`DecisionRecord`); the decision and service
corpora in `docs/conformance/`; `planes/execution/src/decide.ts` and `server.ts`;
the seed in `apps/console/mocks/fixtures/engine.ts` and
`apps/console/mocks/fixtures/decisions.ts`; the trace reader
(`app/decisions/[id]/page.tsx`, `components/trace-evidence.tsx`); and the
storefront panel.
**Arises from:** [G-152](../gaps.md), registered 2026-09-17.

## Context

**A decision names a connector as the source of a value the caller sent.** The
engine's source node records a binding for every field that a connector on the
node provides and that is present in the input
(`engine.ts`, `case 'source'`: *"if (readPath(request.input, binding.field) ===
undefined) continue"*). It never learns who put the value there. Resolution
does know. `resolveInputs` skips a connector's value when the request already
carries the field (*"The request wins"*) and returns bindings only for what it
wrote. The engine ignores those bindings. The Kotlin engine does the same, and
`sourceBindings` is in the canonical form both engines hash.

The same fault appears in the measured calls. `SourceCall.fields` is documented
as *"Fields this call put into the input"*, but it is `Object.keys(values)`:
every field the connector answered, including those the request then overrode.

**Measured on 2026-09-17**, on branch `feat/loop-by-hand` (#115), by a probe
executing each population in-process and discarded afterwards. A binding is
*false* when the value the engine used did not come from the connector named.

| Population | Decisions | Bindings | False | Share |
|---|---|---|---|---|
| Storefront: 3 presets × 5 placements (4 web, the weekly email), through the console's placement route | 15 | 165 | **105** | 64% |
| Service conformance cases (`service-cases.json`), re-executed; all 60 matched their pinned chain hash | 60 | 660 | **660** | 100% |
| Decision corpus (`decision-corpus.json`) | 44 | 2 | **2** | 100% |
| Seeded corpus, by the seed's own construction | 10,400 | 114,400 | **0** | 0% |

What each row means:

- **The storefront is where it is worst in practice.** Every preset sends 7 of
  the 11 fields the flow's five connectors provide: both serviceability fields,
  the open order, both affinities and both partner availabilities. All 7 are
  attributed to a connector on every decision. The 4 that really came from a
  connector are the two consents, tenure and data usage.
- **The conformance corpora are wholly false, and pin it.** Their requests carry
  every field, and nothing resolves. The two decision-corpus cases that carry a
  binding are the ones that fix the behaviour in both engines: *"connector
  provenance is recorded, not fetched"* and *"a connector supplies a value
  nested under the profile root"*. The JVM service never resolves (G-008), so
  every binding it has ever recorded is attribution by presence.
- **The seed is true, but only because it resolves the other way round.**
  `buildRequest` puts `customer.address.fios_serviceable` and `fiveg_coverage`
  in the base request on all 10,400 decisions. `inputFor` then writes the
  connector payload *over* them, so the connector wins where the live path
  would let the request win. `connectorPayload`'s own comment says the two
  fields are *"deliberately not in the base input above"*, and they are in it.
  Measured: 12,005 of the 20,800 overridden values differ from the base value,
  on 8,622 decisions. Re-executed with the live path's precedence, those 8,622
  change chain hash, 7,121 change what was eliminated, and **2,321 change
  winner**. The seeded attribution is true of an input that resolution would
  not have produced from the seed's own request.

**The record cannot answer the question after the fact.** It holds a hash of
the input, never its values (ADR-004). It keeps no copy of the request as it
was before resolution. `sourceCalls` is measured, unhashed, and rebuilt *from
the bindings* for seeded decisions (`sourceCallsFor` in
`mocks/fixtures/decisions.ts`), so it repeats the error rather than checking it.

## Decision

### 1. The request's value wins, and the record says it did

Precedence does not change: a field the request carries is not overwritten by
a connector. That is what `resolveInputs` does today, and a caller that already
holds a value should not be overruled by a slower, staler copy. **What changes
is that the record states the precedence that was applied**, instead of naming
the connector that lost.

Precedence set per binding is not decided here: a connector whose answer the
caller may not override, or whose field the request is refused for carrying.
It is the natural next question, and the consent registry is the case that will
ask it. `conn_consent_registry` provides `customer.marketing_consent`, and under
this rule a caller could send its own. No policy reads that field today
(checked: it appears only in the schema, the connector and the seed). The first
policy that does needs that decision before it ships.

### 2. Three origins, and the "either" case is not a fourth

Each entry names a field that a connector on the flow's source node provides,
where the field is present in the input, and says where the value came from:

| `origin` | When | `connectorId` names |
|---|---|---|
| `connector` | Resolution wrote the connector's answer, fresh or from its cache | the connector that answered |
| `default` | The connector did not answer, its `onFailure` is `default`, and resolution wrote the binding's declared `defaultValue` | the connector that failed |
| `request` | The caller sent the value | the connector that also provides the field |

- **A value that could have come from either is recorded as `request`,** naming
  the connector it was preferred over. Exactly one value was used, and which
  one is known at the moment it is chosen. A record that said "either" would be
  choosing not to write down a fact it had.
- **`default` is its own origin, not a kind of `connector`.** A default is the
  platform's assumption standing in for the source. `conn_consent_registry`
  defaults both consents to `false`. Recorded as `connector`, a registry outage
  reads as the registry saying the customer withdrew consent.
- **A field no connector on the flow provides is still not listed.** It can
  only have come from the request, and listing it adds nothing the flow does not
  already say.

The property is renamed from `sourceBindings` to `fieldOrigins`, with entries
`{ field, nodeId, connectorId, origin }`. **The rename is the point.** Every
current reader treats `connectorId` as "supplied by", which is this defect.
Seventeen files outside the conformance corpora name the property today
(counted 2026-09-17: both engines, the domain types, the spec, the generated
client, the trace page, the evidence pane, the storefront, the seed and their
tests). A rename turns each reader among them into a compile or test failure. Adding `origin` beside the old name would leave each
one compiling and wrong.

### 3. Resolution tells the engine; the engine does not guess

`resolveInputs` returns what it wrote with its origin (`connector` or
`default`), and the request carries that to the engine as `request.resolved`.
The engine:

- **validates it.** Each entry's connector is active, on a source node of this
  artifact, and provides that field, and the field is present in the input.
  Anything else throws, naming the artifact and the field, as
  `recordedContacts` does for a malformed `contactsRead`.
- **derives `request`** for every other present field that a connector on a
  source node provides.
- **cannot be told by a caller.** Both request builders take named fields, so a
  caller's `resolved` is dropped at the boundary. This is ADR-021 §5's rule for
  `contactsRead`, for the same reason: otherwise a caller could claim a system
  vouched for its value.

A service that does not resolve passes nothing, and every present field is
`request`. That is true of the JVM service today, so it needs only the record
change, not a resolver.

### 4. The origin is hashed, and replay reads it from the record

`fieldOrigins` stays in the hashed decision.

- **It cannot be derived later** (see Context).
- **It is part of what a decision attests.** "Refused because
  `conn_serviceability` said the address cannot take fiber" and "refused because
  the caller said so" are different findings for whoever audits the refusal. A
  provenance line that could change without changing the hash is not evidence.

Replay passes the recorded `connector` and `default` entries back as `resolved`,
as it passes `contactsRead` (ADR-021 §5), and never re-resolves.

### 5. A measured call says what it contributed

`SourceCall.fields` lists only the fields whose value was used. A new
`overridden` lists the fields it answered that the request overrode. Both stay
unhashed. The seed stops rebuilding calls from bindings as if every binding
were a call that contributed.

### 6. The seed stops carrying values it discards

The two serviceability fields come out of `buildRequest`'s base input, which is
what `connectorPayload`'s comment already says. The payload writes both fields
anyway, and canonicalisation sorts keys, so the merged input is canonically
identical to today's on all 10,400 decisions:

- `inputSnapshotHash` does not move;
- no winner moves;
- every seeded entry is `connector`.

Applying the live precedence would also be defensible, and it moves 2,321
winners (Context). The seeded story is that serviceability arrives from a named
system, so the connector should be the one supplying it.

The request-origin case is then exercised by the storefront, the service cases
and the corpus cases below, not by the seed.

### 7. It lands with ADR-019's reseed, under the same controls

It goes in the commit that regenerates both engines' corpora and the seeded
ledger for ADR-019 (and ADR-020 clauses 1–5).

**Must not move:**
- `canonical-corpus.json`, byte for byte;
- `inputSnapshotHash` on every decision-corpus case and every seeded decision,
  because where a value came from is not part of the input. The seed's change
  in §6 is chosen so that this holds.

**Must be added to the decision corpus, in both engines:**
- one case per origin;
- the request-over-connector case with a failed connector beside it;
- a `resolved` entry naming a field its connector does not provide, refused.

**Must agree:** the TypeScript and JVM services on all 60 service cases, all of
whose entries become `request`.

## Consequences

- **The storefront trace stops saying `conn_serviceability` decided where the
  preset did.** On the fiber scenario, the panel's "Where the inputs came from"
  names the preset for the address and `conn_serviceability` as available and
  not used. That makes the demo's headline refusal less impressive, and true.
  `STOREFRONT_DEMO.md` already stopped claiming the connector (#115).
- **What regeneration costs, given it lands with ADR-019:**
  - **Decision ids and chain hashes: nothing extra.** ADR-019 already moves every
    decision id and every chain hash.
  - **What this ADR adds to the reseed:**
    - the record change in both engines, with canonical form, validation and
      replay;
    - `resolveInputs` returning origins, and `decide.ts` and the console route
      passing them on;
    - five decision-corpus cases, generated by the builder;
    - the renamed property in the OpenAPI schema, the generated client, the
      seventeen reading files, the trace page, the evidence pane and the
      storefront panel;
    - `SourceCall.fields` and `overridden`;
    - the two-field seed change.

    Estimated at one to two days on top of ADR-019's two to four, most of it in
    the readers and the Kotlin parity, not the engine.
  - **Pinned figures: none beyond ADR-019's.** §6 is chosen so that no seeded
    winner, elimination or funnel count moves for this reason. The figures
    ADR-019 already re-pins are the only ones.
- **Landing it alone, before ADR-019**, would move every decision id once for
  this and again for ADR-019. It would also re-pin each outcome figure twice,
  because the outcome model's draws are keyed on the decision id (ADR-019 §7).
- **A history made by hand is not regenerable** (ADR-019 §7, amended
  2026-09-17). A console that has recorded storefront decisions keeps their old
  records, with the old attribution, until it is reset.
- **The first thing that will be wrong:** any screen or export that reads
  `connectorId` as "supplied by" and was not in the seventeen files. The rename
  surfaces the ones in this repository. It cannot reach a consumer outside it,
  and none exists yet.

## Alternatives considered

**Take the bindings out of the hash.** Provenance would move beside `sourceCalls`
in the unhashed envelope, and correcting it would move no decision id. Rejected:

- attribution is what the trace offers as evidence for a refusal, and outside
  the hash it can be rewritten without trace;
- landing with ADR-019 means ids move anyway, so the saving is nothing.

**Record only true connector bindings, and let absence mean "from the request".**
Smaller: no `origin`, no `default`. Rejected:

- absence cannot tell a request-supplied value from a missing one, and the record
  holds no values to check;
- it drops the fact that a connector was available and not used;
- a registry outage would still read as the registry answering, unless `default`
  were dropped too.

**Record "either" for a value both could have supplied.** Rejected in §2: the
choice is made, and known, when resolution runs.

**Let the connector win, as the seed does.** One precedence everywhere, and
the one the seeded attribution already describes. Rejected as a default:

- it overrules a caller holding a fresher value;
- it contradicts `resolveInputs` as built and tested;
- where a connector *should* win, that is a per-binding decision, deferred in §1.

**Infer origin in the engine by comparing the input to what connectors
provide.** Not possible. The engine sees the merged input and no connector
answers, and replay must not call connectors.

**Keep the name `sourceBindings` and add `origin`.** Cheaper by the rename.
Rejected in §2: every existing reader would keep compiling and keep misreading.
