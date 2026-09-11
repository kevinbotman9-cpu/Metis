# METIS — Journey Spines

This file is the work queue. Work is pulled from here, in order, or from what the
product owner has picked.

**It had not been used that way.** It was written on 2026-09-08 and never edited
again. Sixteen commits landed over the two days that followed and not one of them
was pulled from this file. What follows is the queue rebuilt against what those
commits actually left behind, and against the four evaluation documents in
`docs/evaluation/`.

---

## How this file is used

- **One spine is open at a time.** Spine 1 is open.
- **A capability is built to the depth this spine needs.** Not deeper. Depth
  arrives when a later spine demands it.
- **When a spine needs something absent, that becomes a slice inside this spine.**
  It does not become a new spine or a deferred ticket.
- **A spine closes when one `@screen-only` test walks its whole journey**, and
  every step in its table below names a file and a check.

### The closure rule changed, and why

The original rule was: *"a spine is closed when its `@screen-only` e2e test passes
and every route it touches passes conformance."*

The second clause makes every spine in this file permanently unclosable, for a
reason that has nothing to do with any spine. `node scripts/conformance.mjs`
reports 24 failures, and 19 of them are one rule — `[layout-manifests]` — firing
once per route whose page is not yet a layout manifest (W-041,
`docs/UX_CONTRACT.md` §2; the format exists since ADR-015, and the count falls
only as routes are converted). Spine 1 touches eight of those routes. Under
the original rule, closing Spine 1 requires building the whole of Spine 6's
layout work first, which inverts the ordering this file sets and hides the real
reason a spine is stuck.

So conformance is now a **standing gate on every session** — Session Discipline in
`CLAUDE.md` already says do not end a session with a higher failure count — and
not a closure condition on a spine. The layout-manifest debt is a named slice in
Spine 6 and is counted there, once, instead of nineteen times across this file.

### Status words

The four states are the ones Rule 7 defines: `BUILT` (a named check fails if it
breaks), `ENGINE-ONLY` (works, no screen), `SCAFFOLD` (renders, does nothing),
`ABSENT`. Every row names the file and the check, or it does not go in.
`docs/CAPABILITIES.md` remains the single capability claim; the rows here are a
route map to it, not a second one.

---

## Spine 1 — The marketer publishes an offer

*Persona: Marketer. **Open.** This is the product's spine of spines.*

A logged-in marketer, starting from an empty tenant, can:

| # | Step | State | Where it is, or what stands in its place |
|---|---|---|---|
| 1 | Create an objective and a category in the taxonomy | ABSENT | `getTaxonomy` is read-only (`docs/metis-api.openapi.yaml:2144`); `PENDING` in `packages/ui-metadata/src/registry/index.ts` records both as *"no authoring surface at all; the taxonomy is fixture-authored"* |
| 2 | Create an offer with properties, from the screen | BUILT | `packages/ui-metadata/src/registry/offer.ts`, rendered generically; `apps/console/tests/e2e/form-descriptors.spec.ts` |
| 3 | Add a creative for a channel | BUILT, without the channel package | `packages/ui-metadata/src/registry/creative.ts`; `apps/console/tests/e2e/creatives.spec.ts`. The per-channel fields are in the descriptor, not supplied by a channel package — no package system exists (W-038) |
| 4 | Write an eligibility rule and see it validate | BUILT, hand-written | `apps/console/components/policy-form-dialog.tsx` writes via `createTargetingPolicy` and surfaces field errors; `apps/console/tests/e2e/policy-authoring.spec.ts`. It is a hand-built form, which Rule 8 forbids — `PENDING` admits it |
| 5 | Set effective dates | ABSENT | The offer descriptor excludes `validity` deliberately: effective dating is the Schedule screen, W-015, which is not built |
| 6 | Run a distribution simulation over a sample audience | ABSENT | `apps/console/app/simulations/page.tsx` lists simulations attached to change sets and carries a *Not built yet* card for the ad-hoc case. `simulateDecisionFlow` is in the spec and unserved. W-020 |
| 7 | Raise a change set; a second user approves it | Half BUILT | Approving works: `apps/console/app/approvals/[id]/page.tsx`, `apps/console/tests/e2e/permissions-and-writes.spec.ts`. Raising one from a screen is disabled with its reason (`apps/console/app/offers/[id]/page.tsx:181`) — it needs a diff builder |
| 8 | Publish. See it live | BUILT | `apps/console/components/registry-panel.tsx`; `apps/console/tests/e2e/registry.spec.ts` |
| 9 | Open the trace and see their rule named | BUILT | `apps/console/app/decisions/[id]/page.tsx` renders the elimination cascade naming the policy that removed each candidate; `apps/console/tests/e2e/decisions.spec.ts` |
| 10 | Roll it back | BUILT | `rollbackVersion` from `registry-panel.tsx:60`; `apps/console/tests/e2e/registry.spec.ts` |

**Six of ten steps stand up. The four that do not are steps 1, 5, 6 and half of
7 — and step 1 is the first thing the marketer does.**

**What is stale in the original text.** It said the spine *"forces into existence,
correctly"* eleven capabilities, of which the offer catalogue, creative entity,
rule authoring, publish, trace rendering and rollback now exist — but they were
built from the feature backlog, one at a time, and the spine was never walked. So
they exist as six working screens with four gaps between them, which is the exact
failure mode the spine format was written to prevent. The coherence review found
the consequence: **there is no marketer account.** The nearest sign-in,
`sarah.chen@telco.example`, is labelled *Decision Architect*
(`docs/evaluation/COHERENCE_REVIEW.md`, question 5). The persona this spine is
named for cannot log in.

**Closes when:** one `@screen-only` test walks all ten steps, signed in as a
marketer, with zero API setup.

**Slices, in order:**

1. **Taxonomy authoring** — objective and category, declared. Detailed at the end
   of this file.
2. **A marketer account and role.** `sarah.chen` is a Decision Architect; the
   spine needs a sign-in whose permissions are the marketer's, or step 7 proves
   nothing about a second approver.
3. **Effective dating** (step 5) — W-015, as a `validity` descriptor field or the
   Schedule screen, whichever is smaller.
4. **Raise a change set from a screen** (step 7) — the diff builder.
5. **Ad-hoc distribution simulation** (step 6) — W-020, the largest of the four
   and the only one that needs the execution plane.
6. **The walk itself** — the ten-step `@screen-only` test that closes the spine.

---

## Spine 2 — The decision architect shapes arbitration

*Persona: Decision Architect. **Partly there — and further along than any other
spine.***

| Step | State | Where it is |
|---|---|---|
| Open a flow on the canvas, add and connect nodes | BUILT | `apps/console/app/decision-flows/[id]/page.tsx`, a live palette with drag-to-connect and Save graph; `apps/console/tests/e2e/flow-authoring.spec.ts` |
| Adjust a business boost | Half BUILT | Weights are editable and saveable on `apps/console/app/arbitration/page.tsx`; *creating* a boost is disabled with its reason at line 296 — boosts are catalogue fixtures |
| Edit the ranking function as a named versioned artefact | ABSENT | There is no ranking-function entity anywhere in the codebase. The formula is rendered into the trace as text (`Priority = P^1.0 × V^1.0 × B^1.0 × C^0.5`) and is not an object anyone can version |
| See simulated impact before saving | ABSENT | Same absence as Spine 1 step 6. W-020 |
| Diff their version against the live one on a population | ABSENT | W-054. The population half is W-020 again |
| Publish behind an approval | BUILT | `registry-panel.tsx` plus `apps/console/app/approvals/[id]/page.tsx` |

**What is stale.** The original wrote this spine as though the canvas were the
hard part. The canvas is done. What is left is one shared absence — **simulation
over a population** — which blocks the last three rows here and step 6 of Spine 1.
That is the single largest thing standing between this file and two closed spines,
and it is one work item, W-020.

**Closes when:** an architect changes ranking behaviour and proves the change on a
population, clicking only.

---

## Spine 3 — The compliance officer proves a decision

*Persona: Compliance Officer. **Partly there. The strongest thing in the
product, with two holes.***

| Step | State | Where it is |
|---|---|---|
| Search decisions by customer, or outcome | BUILT | `apps/console/app/decisions/page.tsx` over 10,400 rows; `apps/console/tests/e2e/decisions.spec.ts` |
| Search by **rule** | ABSENT | `searchDecisions` takes `action`, `channel`, `customerId`, `dateFrom`, `dateTo`, `outcome`. There is no rule parameter, so the question *"show me every decision my new rule touched"* cannot be asked |
| Open one; read the trace in the regulator rendering | BUILT | `apps/console/app/decisions/[id]/page.tsx` — seven nodes, per-candidate scores, per-node timings, consent state, connector provenance, chain hash |
| Replay it and see byte-identical confirmation | BUILT | Replay shows stored and replayed hashes side by side; `apps/console/tests/e2e/ledger.spec.ts` |
| Run a bias check on a segment | ABSENT | A bias ratio exists only inside a change-set simulation (`apps/console/app/approvals/[id]/page.tsx:236`). There is no on-demand check on a segment. W-021 |
| Export evidence | BUILT for JSON, stated for PDF | `apps/console/tests/e2e/evidence-export.spec.ts` reaches a real exported file. Export PDF is disabled and names its reason and its work item, W-053 |

**What is stale.** The coherence review recorded this journey stopping dead at two
enabled buttons with no handler. That was fixed on 2026-09-09 (`b79a1fa`), and the
evidence step now has a test that opens the file. The spine's own closure
condition — *"'Prove it' works from the screen for a decision made 30 days ago"* —
is met for a decision the officer can already find. **What is not met is finding
it by the thing they were asked about**, which is nearly always a rule or a
policy, not a customer id.

**Closes when:** an officer, given a rule name, reaches evidence on disk without
being told a decision id. That is one slice: the rule filter.

---

## Spine 4 — The data scientist ships a model

*Persona: Data Scientist. **ABSENT end to end, and now designed.***

There is no `/models` route, no `Model` schema in the spec, no feature store, and
no data-scientist account. `PENDING` records `Model` as *"Gate 2. No schema, no
screen."* Propensity is `0.05 + seededUnitInterval(...) × 0.9` and the trace says
so in the sentence the scientist would read.

**What changed since this was written:** `docs/adr/ADR-009-the-model-plane.md` was
accepted on 2026-09-09 and its phase one is built — scoring is extracted into
`resolveScores` in `packages/runtime/src/scoring/index.ts`, behind a resolver, with
every corpus hash byte-identical. **The seam a model plugs into now exists.** The
spine's steps are unchanged; what changed is that the first one is no longer a
research question.

Read ADR-009 before opening this spine; it names what to build first and what to
defer, and this file should not repeat it.

---

## Spine 5 — The CSR sees the next best action

*Persona: CSR. **ABSENT as written — but its delivery half was built for a
different reason.***

There is no agent-assist surface and no host application. What exists is
`apps/console/public/storefront/index.html`, a static page built as phase one of
ADR-008 that requests a decision, renders the offer, and reports an impression and
a click back into the interaction log
(`apps/console/tests/e2e/outcome-loop.spec.ts`).

**That is three of this spine's four clauses, for the wrong persona.** The
storefront is a customer-facing demo, not an agent-assist panel: no ranked slate,
no per-action reason line, no host container (W-016, W-052). But *"captures the
outcome, and writes to the interaction log in time for the next decision"* is now
demonstrated code rather than a plan, and the sub-two-second budget has a
benchmark behind it.

**Rewritten closure:** a CSR opens a ranked slate inside a host container, reads a
one-line reason per action, records what the customer said, and the next decision
for that customer sees it. The delivery and outcome edges are done; the container
and the slate are not.

---

## Spine 6 — The admin makes the product theirs

*Persona: Administrator. **Partly there, and it is the largest number in the
evaluation.***

| Step | State | Where it is |
|---|---|---|
| Add a custom field to an entity, no code change | BUILT for two entities of fourteen | `packages/ui-metadata/src/registry/`, diffed against the spec by `packages/ui-metadata/tests/descriptors.test.ts`. Offer and Creative have descriptors; the other twelve are listed in `PENDING` with a reason each |
| Reorder panels and save a versioned layout | ABSENT | Manifests exist as repository files (`packages/ui-metadata/src/layouts/`, ADR-015) and nothing serves or stores one, so no administrator can reorder anything; ADR-015 §8 defers that to overlays. W-041 |
| Install a theme package and rebrand | ABSENT | Token sets are files; `apps/console/app/settings/page.tsx` toggles light/dark and density only |
| Install a node package and use the node on the canvas | ABSENT | No package system anywhere in the tree. W-038 |
| Scope a role to one objective | ABSENT | Roles are displayed, not scoped (`settings/page.tsx:48`). W-043 |

**Why this is the largest number.** `docs/CAPABILITIES.md` counts **311 of 314
capability rows as "Configurable without code? = NO"**. The three that answer YES
are the descriptor registry and the two entities that use it. The original text
said this spine *"is the differentiator and it must not be last in practice"* —
that instruction was followed exactly once, for the form-descriptor slice, and it
worked: the mechanism exists and is checked. It was then not followed again.

**Do not open this spine whole.** Take slices from it into whichever spine needs
them, as the original said. The two that other spines need first: a descriptor
for `Objective` and `Category` (Spine 1, slice 1) and layout manifests (which
nothing else needs, but which is 19 of the 24 standing conformance failures).

---

## Spine 7 — The operator runs it

*Persona: Operator. **ABSENT. No account, and no screen of any kind.***

Nothing exists for throughput, latency distribution, error budget, degradation
state, queue depth, cost per thousand, or an incident view. The closest thing is a
benchmark that runs offline in CI, and `apps/console/app/integrations/traffic/page.tsx`,
which records inbound calls to the console's own API and is a development aid
rather than an operator surface. W-045, W-046, W-048.

Rollback — the one clause of this spine that is built — is on the flow screen
(`registry-panel.tsx`), reached by an architect, not an operator.

Unchanged and correctly placed. This spine has no dependencies on the four above
it and can be resequenced whenever the product owner wants an operator.

---

## Spine 8 — Retired. This should not be a spine.

*Was: "The executive sees value."*

**Delete it as a spine and keep one sentence of it as a rule.**

Three reasons, in order of weight.

1. **It has no journey.** Every other spine is a person doing a task with a start
   and an end. This one is a person reading a screen. There is no step that can
   fail, so there is nothing an `@screen-only` test can assert beyond "the page
   rendered", which is what `apps/console/tests/e2e/seeded-tenant.spec.ts` already
   asserts for every route.

2. **Its only real requirement is already a standing rule.** *"Every number on
   this screen clicks through to its trace or its source query"* is in the
   Definition of Done in `CLAUDE.md` — *"every displayed number links to its
   source trace or explains why it cannot"* — for every screen, not one. Holding
   it in two places means one of them goes stale, which is the failure Rule 7
   exists to stop.

3. **Every number it would show is produced by a spine above it.** Value comes
   from Spine 5's outcomes, cost from Spine 7's accounting, adoption from having
   personas who can log in. Built before those, an executive dashboard shows an
   executive four confident figures about nothing — and `/performance` spent its
   whole life until 2026-09-09 opening on a metric block reading `WITH AN
   OUTCOME: 0`, which is exactly that failure at one-quarter scale. That block is
   gone: the screen is a Cascade since 2026-09-10 and the figure is the `Seen`
   stage of the loop.

**What survives:** the executive summary is a slice of Spine 7, built after the
operator has numbers worth summarising. The click-through rule stays where it is,
in `CLAUDE.md`.

---

## Ordering

Spines 1–3 in strict order, unchanged: 1 is open, 2 and 3 each need one slice.

4–7 resequence on the product owner's call. Spine 6 is not opened whole; its
slices are pulled into whichever spine needs them, as the original said and as was
done once, successfully, for the form-descriptor slice.

Spine 8 is retired.

**One work item blocks three spines.** W-020, distribution and version-diff
simulation, is step 6 of Spine 1, three of six rows in Spine 2, and the honest
version of the bias check in Spine 3. Nothing else in this file is load-bearing in
more than one place. If the product owner wants to unblock the most journeys with
one decision, that is the item.

---

## Next: Spine 1, slice 1 — taxonomy authoring

**The marketer's first click is the one thing they cannot do.** Steps 2, 3, 4, 8,
9 and 10 of Spine 1 all work; a marketer walking the spine in order stops at step
1 and never reaches any of them. The offer form asks for an objective and a
category, and both come from a fixture.

**The slice:** an administrator or marketer creates an objective, then a category
under it, from a screen, and the offer form offers what they created.

Sized against the ten artefacts in `CLAUDE.md`, this starts at artefact 1 and not
before it. The `Objective` and `Category` schemas exist
(`docs/metis-api.openapi.yaml:78` and `:99`) and are read-only —
`getTaxonomy` at `:2144` is the only operation that touches them. So the slice is:

1. `createObjective`, `createCategory`, and their updates, added to the spec and
   the client regenerated. **Not hand-written** — Rule 3.
2. Store writes, wherever the taxonomy is read from today.
3. **Descriptors, not forms.** `Objective` and `Category` move out of `PENDING` in
   `packages/ui-metadata/src/registry/index.ts` and into `REGISTRY`, rendered by
   the generic renderer. `packages/ui-metadata/tests/descriptors.test.ts` already
   fails on an entity that is in neither list, so the check exists before the code
   does.
4. A route the marketer reaches from nav. There is no `/taxonomy` route today.
5. The `@screen-only` test: create an objective, create a category, open **New
   offer**, and select both from the form without a reload.

**Why this one first, and not one of the other three gaps in Spine 1.** Effective
dating and the diff builder are steps 5 and 7 — a marketer blocked at step 1 never
reaches them. Ad-hoc simulation is W-020, the largest item in this file and the
one that needs the execution plane; it is the right thing to do second, with a
whole session, not the thing to open a spine with.

And it moves the number that the evaluation called the extensibility debt: two of
fourteen entities have a descriptor today. This makes it four, using the mechanism
that already exists rather than building a fifth hand-written form — which is, in
this file's own words, *the single most expensive mistake available in this
codebase*.

**No W-number covers this.** W-005 is the taxonomy into PostgreSQL, which is
storage, not authoring. The slice needs one registered before it opens.
