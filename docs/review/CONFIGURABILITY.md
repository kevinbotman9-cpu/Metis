# Phase C — The configurability audit

**Date:** 2026-09-06
**Requirement under test:** every aspect of METIS must be configurable from the
screen by a business user, as Pega CDH is.
**Method:** the console was run and driven. Every cell marked `CONSOLE` below
was reached by clicking the control and observing the result; every cell marked
otherwise was reached by clicking the control and observing that **nothing
happened**. Source was consulted only to confirm a negative after the attempt.
**Fixes made:** none.

---

## 0. The headline

**Five object types are configurable from the console. Thirty are not.**

That is a harsher number than "the canvas is read-only" suggests, and the reason
is a specific and repeated pattern rather than absent screens: **the console
presents create and edit affordances that do nothing.**

`New offer`, `New boost`, `New scope rule`, `Edit`, `Add creative` and
`Request change` are all rendered as enabled primary buttons. All six were
clicked. None opens a dialog, reveals a form, navigates, or changes any input
count. Confirmed in source afterwards: each is a `<Button>` with no `onClick`.

This matters more than a missing screen would. A missing screen is an honest
absence. A button that looks like the way to create an offer, and is not,
is the single most likely thing to be mistaken for working in a demonstration —
and unlike the fixture-backed simulation that Phase B flagged, this one is on
the primary object of the whole catalogue.

**One correction I had to make to my own finding.** I initially recorded
`Change level` on `/agentic` as inert too, because clicking it opened no dialog.
It is not inert: it toggles inline L0–L4 buttons rather than opening anything,
and `permissions-and-writes.spec.ts:94` proves it persists and audits. My probe
was looking for the wrong shape. The distinction is recorded because it is the
difference between "the console cannot do this" and "I looked for the wrong
widget", and only one of those is a finding.

---

## 1. The matrix

`CONSOLE` = attempted and worked · `API-ONLY` = the operation exists in the spec
and no console control reaches it · `FIXTURE` = only by editing
`apps/console/mocks/fixtures/*` · `CODE` = only by editing source · `N/A` = the
object does not exist at all.

Where an object does not exist, every cell is `N/A` and the row is listed once
in §1.2 rather than repeated across twelve columns.

### 1.1 Objects that exist

| Object | Create | Edit | Validate | Version | Diff | Approve | Simulate | Publish | Promote | Roll back | Delete/retire | Permission-scoped |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Decision flow | FIXTURE | FIXTURE | CONSOLE | API-ONLY | FIXTURE | N/A | CONSOLE | API-ONLY | **CONSOLE** | **CONSOLE** | FIXTURE | **CONSOLE** |
| Node within a flow | FIXTURE | FIXTURE | CONSOLE | — | — | — | — | — | — | — | FIXTURE | — |
| Node layout / position | FIXTURE | FIXTURE | N/A | — | — | — | — | — | — | — | — | — |
| Taxonomy: objective, category | FIXTURE | FIXTURE | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FIXTURE | N/A |
| Offer | **CONSOLE** | **CONSOLE** | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FIXTURE | **CONSOLE** |
| Creative | **CONSOLE** | **CONSOLE** | **CONSOLE** | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FIXTURE | **CONSOLE** |
| Eligibility policy | FIXTURE | FIXTURE | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FIXTURE | N/A |
| Relevance policy | FIXTURE | FIXTURE | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FIXTURE | N/A |
| Suitability policy | FIXTURE | FIXTURE | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FIXTURE | N/A |
| Frequency cap | FIXTURE | FIXTURE | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FIXTURE | N/A |
| Ranking function (weights) | N/A | **CONSOLE** | N/A | N/A | N/A | N/A | N/A | **CONSOLE** | N/A | N/A | N/A | **CONSOLE** |
| Boost | FIXTURE | FIXTURE | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FIXTURE | CONSOLE (gate) |
| Data source / connector | FIXTURE | **CONSOLE** (activate/deactivate only) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FIXTURE | **CONSOLE** |
| Autonomy tier per scope | FIXTURE | **CONSOLE** | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | FIXTURE | **CONSOLE** |
| Change set | API-ONLY | N/A | N/A | N/A | CONSOLE (view) | **CONSOLE** | FIXTURE | N/A | N/A | N/A | N/A | **CONSOLE** |
| Theme / density | N/A | **CONSOLE** | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

### 1.2 Objects that do not exist at all — every cell `N/A`

Treatment (distinct from creative) · Content asset · Consent type · Arbitration
level · Constraint · Segment · Journey · Campaign / schedule · Experiment /
holdout · Channel config · Placement / slot · Model binding · Feature
definition · Profile schema · Tenant settings · Role and permission · Approval
quorum · Retention policy · Layout / workspace · Package install.

Twenty of the thirty-six rows in Appendix 2. Phase B scored these as ABSENT
capabilities; here they are also, necessarily, absent configuration surfaces.

### 1.3 What is genuinely configurable from the screen

Five things, and it is worth naming them exactly because they are the entire
answer to the requirement today:

0. **Offer and creative authoring** — added 2026-09-07, after this audit was
   written: create and edit an offer, add and edit its creatives, activate and
   pause it. The list below was the whole answer on the day it was made.
1. **Arbitration weights** — four sliders, `Publish weights`, `Reset`. Persists
   and audits.
2. **Autonomy tier per scope** — `Change level` reveals L0–L4 inline.
3. **Connector activate/deactivate** — not create, not edit, just the toggle.
4. **Change set approve/reject** — with a reason.
5. **Flow promote / roll back / start shadowing** — three environments.

Plus theme and density, which are user preferences rather than platform
configuration.

Everything a marketer would call their job — the offer, its content, its
policies, its caps, its audience — is a fixture edit and a redeploy.

---

## 2. The three questions Appendix 2 asks

### Which of these could a package introduce as a *new* type, and would it be configurable on arrival?

**None, and no.** There is no package system (Phase B, Platform: ABSENT).
`packageRanges` are resolved and pinned at compile time, so "package" exists as
a versioning concept with no installable artifact.

If W-038 shipped tomorrow, a package could contribute a node type to the
compiler and the engine, and the console would render it in the canvas as an
unknown box with no way to configure it — because every configuration surface in
§1.1 is a bespoke React page keyed to a specific entity. A package cannot ship a
screen, and the console has no mechanism to render one from a description.

This is the finding the brief predicted, and it is confirmed.

### Which cells require a developer today, and is that deliberate or accidental?

Almost all of them, and it is **accidental in a specific and recoverable way**.

Deliberate: the canvas being read-only is recorded in `CAPABILITIES.md` and
`BACKLOG.md` as W-024, with a stated reason (a layout algorithm needs design
review). Flow authoring being absent is an acknowledged stage.

Accidental: the six inert buttons. Someone laid out the surface a business user
would need, and the wiring was never done. Nothing records them as unbuilt —
`EXPERIENCE_LAYER_STATUS.md` marks `/offers` and `/offers/[id]` as **BUILT**,
which they are as *read* surfaces, and the row does not distinguish reading from
writing. A reader of that document would reasonably conclude an offer is
editable.

Also accidental, and more serious: **targeting policies and frequency caps have
no write operation in the spec at all.** Not API-only — absent. The three-tier
qualification model is the centre of the decisioning claim, and there is no path
to changing a policy other than editing a fixture. `listTargetingPolicies` and
`listFrequencyPolicies` are the only operations that touch them.

### Where a cell is `CONSOLE`, does the change flow through `/approvals` and the audit log identically to an API or agent change?

**The audit, yes. The approval path, no — and the two disagree in a way that
matters.**

Every console write lands in the append-only audit log via `recordAudit`, and
Phase A verified the trigger rejects `UPDATE`. That half is sound.

But the five working console writes take **two different governance paths**:

- *Arbitration weights, autonomy level, connector toggle* — applied
  immediately, audited, and never seen by `/approvals`.
- *Change sets* — the approval path, which applies a diff on approval.

So a business user changing the ranking weights from the screen bypasses the
change-set workflow entirely, while an agent proposing the same change goes
through it. The brief warns about exactly this: *"there are two governance
regimes and only one is audited properly."* Both are audited here — but only one
is *approved*, and the one that skips approval is the one a human uses.

Whether that is wrong depends on intent. A permission gate (`edit:arbitration`)
may be considered sufficient authority for a direct change. But it is not what
the autonomy ladder implies, and it means the answer to "can a change reach
production without review?" is yes, for the three most impactful configuration
values in the system.

---

## 3. §4.2 — Which path is the console on?

### The determination: **hand-built, entirely, and about six objects deep.**

Every configuration surface is a bespoke page. `/arbitration` hand-renders four
named sliders — `Propensity weight`, `Value weight`, `Boost weight`, `Context
weight` — because `ArbitrationConfig.weights` has exactly those four fields.
`/agentic` hand-renders five autonomy buttons because the ladder has five rungs.
There is no schema, no field descriptor, no renderer. Adding a fifth weight to
the ranking function means editing a React component.

There is no generated form anywhere in `apps/console`.

### Does the OpenAPI spec carry enough to render a form?

**Partly, and not enough.** It has types, enums, required fields, formats and
descriptions — the skeleton of a form. What it lacks is everything that makes a
form usable by a business user: which fields are editable versus
server-computed, ordering and grouping, labels distinct from field names, help
text distinct from API descriptions, validation beyond type, and the
relationships that make a field a picker rather than a free-text id.

`Offer` in the spec carries `id`, `createdAt`, `updatedAt`, `updatedBy` and
`categoryId` alongside `name`, `price` and `boost`. A form generated naively
from that schema would ask a marketer to type a category id and a timestamp.

So the spec is a necessary input and not a sufficient one. A schema layer is
needed — which is the substance of the ADR below.

### Do the artifact schemas separate business config from internal structure?

**No.** `CompiledDecisionFlow` mixes what an author sets (`nodes`, `edges`,
`candidateKeys`) with what the compiler derives (`costManifest`,
`artifactHash`, `compiledAt`, `packageVersions`). `Offer` mixes commercial
fields with provenance. Nothing marks the boundary, so a generated form would
expose internals unless the boundary is added.

This is the cheapest part of the fix and the one most likely to be skipped.

### Does the autonomy ladder reach the UI?

**No.** It reaches the *route*: `canEdit` gates whether `/agentic` shows editing
controls, and the seven permissions are enforced server-side with a 403 — which
Phase A confirmed and the E2E covers.

But it is role-level and page-level. There is no field-level gate, and no path
by which an autonomy tier on a scope ("this offer is L1, supervised") could
disable an individual control. The ladder governs what *agents* may do
autonomously; it does not currently govern what a *person* may edit.

---

## 4. Cost: now versus after Stage 18

The brief asks for an estimate. This is a judgement, and it is stated as one.

**Now.** Six objects have hand-built surfaces, of which five actually write.
Converting means: defining a field-descriptor schema, writing one renderer that
covers the field types those five need (number-with-range, enum-as-buttons,
boolean toggle, string), and re-expressing five surfaces against it. The
descriptors are small; the renderer is the real work. Crucially, **the five
working surfaces are simple** — sliders, buttons and a toggle — so the renderer
does not have to be sophisticated to replace them.

**After Stage 18.** The backlog adds, by my count from `BACKLOG.md`: treatments
and content (W-014, W-015), placements and channel config (W-016, W-017),
segments, journeys, campaigns, experiments (W-035 to W-037), constraints and
arbitration levels (W-026 to W-028), model bindings and feature definitions
(W-029, W-009). That is a dozen more object types, each of which will get a
hand-built screen if nothing changes, because that is the default path — it is
what you get by building screens one at a time without deciding not to.

The conversion cost then is roughly three times the surfaces, against a codebase
where the pattern is established twelve times over and every conversion risks a
regression in something a customer is using. And by then W-038's package system
will have shipped or been designed around the limitation.

**The asymmetry is the point.** The renderer costs about the same whenever it is
built. What changes is how much has to be rewritten to use it, and whether
packages can configure anything at all.

---

## 5. Findings

### C-1 — Six create/edit affordances are inert · S1 · **PARTLY CLOSED 2026-09-07**

`New offer` (`offers/page.tsx:226`), `New boost` (`arbitration/page.tsx:289`),
`New scope rule` (`agentic/page.tsx:243`), and `Edit`, `Add creative`,
`Request change` (`offers/[id]/page.tsx:145,148,190`). All rendered enabled, all
clicked, none does anything. Confirmed handler-less in source.

S1 because `EXPERIENCE_LAYER_STATUS.md` marks these routes BUILT without
distinguishing read from write, so the documentation asserts a capability the
screen does not have — the brief's definition of a false claim.

Cheapest honest remedy is not to wire them: it is to remove or disable them and
record the gap, until §3's decision is made. A disabled button with a tooltip is
an honest absence; an enabled one is a false promise.

**Both halves are now done.** `New offer`, `Edit` and `Add creative` are wired,
with the creative's own edit and an activation control beside it — offers and
creatives are authored from the console, and the matrix rows above move from
API-ONLY and FIXTURE to CONSOLE. The other three took the advice in the
paragraph above: `New boost` and `New scope rule` have no write operation in the
spec to call, and `Request change` needs a diff builder, so all three are
disabled and say why.

What this does **not** change is C-3. Every one of these surfaces is a bespoke
React form keyed to a specific entity, so the console is further down the
hand-built path than it was this morning, not less far. That was the trade: the
demo needed a working authoring path, and the metadata-driven question is still
open and still gets more expensive with each form.

### C-2 — Targeting policies and frequency caps have no write path anywhere · S1

Not API-only — absent. The spec exposes `listTargetingPolicies` and
`listFrequencyPolicies` and nothing else. The three-tier qualification model and
the contact rules, which Phase B scored as the strongest part of the platform,
can only be changed by editing `apps/console/mocks/fixtures/catalogue.ts`.

S1 because "versioned catalogue/policy AST" is a Foundation MVP capability
marked BUILT, and while the AST is versioned when it reaches the registry, there
is no path by which a user changes one.

### C-3 — The console is on the hand-built path, and packages cannot configure anything · S2

Detailed in §3. Now-or-never in the brief's sense: the cost does not rise
because the renderer gets harder, but because a dozen more surfaces get built
the old way and W-038's package system is designed around the limitation.

Draft ADR below.

### C-4 — Two governance paths, and the one a human uses skips approval · S2

Detailed in §2.3. Arbitration weights — the most impactful configuration in the
system — are changed directly, audited, and never approved. An agent proposing
the same change goes through `/approvals`.

S2 rather than S1 because it may be intentional: `edit:arbitration` is a
permission and permissions are a governance mechanism. But it should be a
decision on the record rather than a consequence of which surface was built
first, and it becomes much harder to change once more direct-write surfaces
exist.

### C-5 — No field-level permission or autonomy gate · S3

§3. Blocks the autonomy ladder from meaning anything on a screen, and blocks
artefact-granular RBAC (W-043).

### C-6 — Schemas do not separate business config from internals · S3

§3. Blocks metadata-driven rendering specifically: a generated form over today's
schemas would ask a marketer for a `categoryId` and an `artifactHash`. Cheap to
fix now, and a prerequisite for C-3.

---

## 6. Draft ADR

Written to `docs/adr/ADR-006-configuration-schemas.md` (proposed, not accepted).
Summary of its argument:

Every configurable object declares a **configuration schema** — a typed list of
field descriptors carrying editability, grouping, label, help, validation and
relationship — held beside the domain type and served through the API. The
console renders create, edit, validate and diff surfaces from that schema rather
than from bespoke components.

It is deliberately *not* proposed that the schema be derived from the OpenAPI
document. §3 sets out why that is insufficient, and a derived-plus-annotated
schema is the worst of both: it drifts from the spec and still cannot express
what a form needs.

The ADR is marked Proposed. It is a structural decision about the console and
`CLAUDE.md` requires product and design review before that kind of change.

---

## 7. Uncertainty

- **Whether the six inert buttons were intended as placeholders.** No comment or
  TODO marks them. I have recorded the observable fact and not the intent.
- **Whether `Request change` was meant to create a change set from the console.**
  `createChangeSet` exists in the spec and is never called by the console; the
  button's label suggests it was the intended caller. Recorded as an inference,
  not a finding.
- **The renderer cost estimate in §4** is a judgement from reading the five
  working surfaces, not from a spike. It should be treated as an order of
  magnitude.
- **Whether direct-write-without-approval is intentional** (C-4). I could find
  no ADR or comment either way.
