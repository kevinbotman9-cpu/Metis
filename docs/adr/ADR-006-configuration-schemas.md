# ADR-006: Configuration schemas and metadata-driven rendering

**Status:** Proposed — needs product and design review before any code
**Date:** 2026-09-06
**Constrains:** every configuration surface in `apps/console`, the package
system (W-038), and the shape of every object type added from Stage 13 onward.
**Arises from:** `docs/review/CONFIGURABILITY.md`, finding C-3.

## Context

The requirement is that every aspect of METIS be configurable from the screen by
a business user, as Pega CDH is. Phase C audited that by driving the console:
**five object types are configurable; thirty are not.**

The five that work are hand-built React pages. `/arbitration` renders four named
sliders because `ArbitrationConfig.weights` has four fields. `/agentic` renders
five buttons because the ladder has five rungs. Adding a fifth weight means
editing a component. There is no schema, no descriptor and no renderer anywhere
in the console.

That is the *default* path — it is what you get by building screens one at a
time without deciding not to — and it has two consequences that compound.

**It scales linearly and the platform does not.** The backlog adds roughly a
dozen object types by Stage 18: creatives, content assets, placements, channel
configs, segments, journeys, campaigns, experiments, constraints, arbitration
levels, model bindings, feature definitions. Each gets a bespoke screen.

**It caps the package system before it is built.** W-038 promises a package can
ship a node type, a channel or a model provider. A package cannot ship a React
page into the console, and the console has no way to render a form for something
it was not compiled against. So a package could contribute a node type that
appears in the canvas as a box nobody can configure. The composability claim in
§14 quietly becomes "composable, as long as the core team has built the screen".

## Decision

**Every configurable object declares a configuration schema, and the console
renders from it.**

1. A **field descriptor** carries what a form needs and a type does not:
   editability (author-set versus server-derived), group and order, label and
   help text distinct from API descriptions, validation beyond type, and
   relationships — so a `categoryId` renders as a category picker rather than a
   text box.

2. Schemas live **beside the domain type they describe**, in the package that
   owns it, and are served through the API. A package ships its schema with its
   node type, and the object is configurable on arrival with no console change.

3. The console renders **create, edit, validate and diff** from the schema. Not
   approve, promote or simulate — those are workflows over an object, not
   renderings of it, and conflating them is how metadata-driven systems become
   unreadable.

4. **Bespoke surfaces remain legal where they earn it.** The flow canvas is a
   graph editor and will never be a generated form. The rule is that a *field*
   is generated; a *surface* may be hand-built where the interaction is genuinely
   bespoke. Getting this wrong in the other direction — generating everything —
   produces the unusable admin screens this decision is meant to avoid.

5. **Schemas separate business configuration from internal structure**, which
   today nothing does. `CompiledDecisionFlow` mixes authored `nodes` and `edges`
   with derived `costManifest`, `artifactHash` and `compiledAt`; `Offer` mixes
   commercial fields with provenance. A generated form over today's types would
   ask a marketer for a timestamp and a hash.

## Why not the alternatives

**Derive forms from the OpenAPI document.** Tempting, because the spec is
already the source of truth for contracts and is already generated from. It
carries types, enums, required fields and descriptions — the skeleton. It does
not carry editability, grouping, labels for humans, help text, cross-field
validation or relationships, and adding them to the spec would mean putting
presentation concerns into an API contract that two engines and external callers
also read. A derived-plus-annotated schema is the worst outcome: it drifts from
the spec and still cannot express what a form needs.

**Keep hand-building.** Honest, and fine for five objects. The cost is not that
the renderer gets harder later — it is that a dozen more surfaces get built the
old way, each becomes something a customer uses, and W-038 gets designed around
the limitation rather than against it.

**Adopt an existing schema-form library.** Worth evaluating during
implementation and not decided here. The decision that matters is that a schema
exists and is owned by the object; which renderer consumes it is an
implementation choice that can change.

## Consequences

**Accepted costs.**

- A second description of every object, beside its type. Kept in the same
  package precisely so the two move together, and a test should assert every
  configurable object has a schema — otherwise this decays into the same
  hand-built path with extra ceremony.
- The renderer must handle the field types the five working surfaces already
  need — number-with-range, enum-as-buttons, boolean toggle, string — before it
  can replace them. That is a small set, which is why doing this now is cheap.
- Generated forms are worse than good bespoke forms and better than absent ones.
  The five existing surfaces are good; replacing them should not make them
  worse, and if it does, §4's escape hatch applies.

**What this unblocks.** W-038's package system can deliver a genuinely new
configurable object. C-5's field-level permissions and autonomy gating have
somewhere to live — a descriptor is where "this field requires
`edit:arbitration`" or "this offer is L1, so this field is supervised" belongs.
Artefact-granular RBAC (W-043) becomes expressible.

**What it does not solve.** The two governance paths (finding C-4) are a
separate decision. Metadata-driven rendering makes it *easier* to route every
console write through change sets, because the write path is one code path
rather than five — but it does not decide whether they should be.

## Status, honestly

**Proposed.** `CLAUDE.md` requires product and design review before structural
console changes, and this is the most structural one available: it changes how
every configuration surface is built, including five that work today.

It is also the review's highest-value finding, in the specific sense that the
decision is cheap now and expensive after Stage 18. That is an argument for
deciding it soon, not for deciding it without design review.

Nothing is implemented. `CAPABILITIES.md` records configurability as it was
measured in Phase C.
