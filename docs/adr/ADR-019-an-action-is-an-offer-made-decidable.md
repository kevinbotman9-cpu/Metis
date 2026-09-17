# ADR-019: An action is an offer made decidable, and the decision names both

**Status:** Accepted
**Date:** 2026-09-16 (proposed)
**Decided:** 2026-09-16
**Deciders:** Product owner
**Accepted with two amendments**, both made here: clause 8's unreachable
fallback became a refusal, and clause 7 states plainly that there is no
migration for a tenant whose history matters.
**Decision needed by:** — decided. It had been 2026-09-23, after which the
interaction rollups of [ADR-014](ADR-014-the-data-spine.md) §10 would have
started keying contacts and last-outcome per action against an identity this
ADR had not settled.
**Constrains:** `packages/core/src/domain.ts`; the engine's ranking and record
(`packages/runtime/src/deterministic/engine.ts`); `packages/catalogue`;
`docs/metis-api.openapi.yaml` (`Offer`, `Creative`, `PolicyScope`,
`DecisionRecord`); the conformance corpora in `docs/conformance/`; the Kotlin
engine; `apps/console/mocks/fixtures/*`; the seeded ledger written by
`apps/console/mocks/seed-ledger.ts`; and every screen that shows a winning
action.
**Arises from:** [W-014](../BACKLOG.md), the `offer`/`action` split, which has
been PARTIAL in `docs/CAPABILITIES.md` since the vocabulary was made normative,
and the prediction the product owner asked for on 2026-09-16 before any code
moved.

## Context

`CLAUDE.md` has said this for as long as the vocabulary has been normative:

> **action** — an offer instance made decidable in a context. Today an offer
> carries the `key` used as the action; splitting them properly is a modelling
> change, not a rename

The conflation is load-bearing. `candidateKeys` on a compiled artifact are offer
keys; `scores` and `eliminations` are keyed by them; `winner` is one of them;
and `winnerOfferId` is the id of the offer whose key won — the same object named
twice, once by key and once by id.

**Why this is not a rename.** The decision's id is content-addressed:
`chainHash = hash(decision)` and `id = dec_${chainHash.slice(0, 16)}`
(`engine.ts`). The hashed object holds `candidateKeys`, the score and
elimination entries keyed by them, and `winner`. Changing what a candidate key
*is* changes every decision's identity, not merely its hash — 10,400 of them in
the seeded history, with every foreign key that points at one.

**What was measured before this was written** (2026-09-16, over all 10,400
seeded decisions):

- 4,688 decisions reached ranking, and every one of them produced a winner.
- 2,528 had two or more candidates at ranking; the rest had one.
- **No decision anywhere is decided by the tie-break.** The smallest gap between
  the winner's priority and the runner-up's is **0.00833** — about 4.5% of that
  winner's priority, and nine orders of magnitude clear of floating-point noise.
  The median gap is 0.0333.

So the rename cannot move a winner in today's corpus. Clause 8 is about what the
split makes newly possible, not about what history holds.

## Decision

### 1. One offer has many actions; today each has exactly one

An **offer** is the commercial object: what is sold, its financials, its
lifecycle. An **action** is that offer made decidable in a context: the thing a
flow may offer, a decision may choose, and a customer may be contacted with.

The relation is **one offer to many actions**, modelled that way from the first
day so the schema does not move again. The seeded catalogue declares exactly one
action per offer, generated from it, and nothing in the product requires a
second. A second action on one offer is what a retention-focused one, a
channel-specific framing or a regional price point becomes when somebody needs
one; none of them needs a migration.

**Rejected:** one-to-one with a note about growing later. The relation is what
the identity of every candidate, every cap and every rollup is keyed on. A
one-to-one that becomes one-to-many later moves every chain hash a second time,
and clause 7 is what that costs.

### 2. An action carries its decidability; it inherits its commerce

**An action carries** — its `key` (the candidate key, unique within a tenant),
its `offerId`, its name, its channels, its own `active` flag, and its creatives
(clause 5).

**An action inherits from its offer, and may not override:**
`expectedMargin` and every other field of `financials`. Margin is a property of
what is sold, not of how it is offered. Two actions instancing one offer that
disagree about margin is a reporting contradiction with no owner, and
`marginByKey` becomes a join through `offerId` rather than a lookup.

**An action inherits, and may override:** tags. A tag is how something is found
and grouped, and a retention variant that is tagged differently from its offer
is the ordinary case.

**Boosts apply where they are scoped, unchanged.** A boost is scoped by
`PolicyScope` (clause 4), so a boost on an offer applies to every action of that
offer and a boost on an action applies to one. Nothing about the boost model
changes; it gains a level.

### 3. The record holds both; neither is derived at read time

`decision.winner` becomes the **action key**. `decision.winnerOfferId` keeps its
name and its meaning — the id of the offer that action instances — and is
**stored, not derived**.

A decision record is evidence, and evidence does not depend on a catalogue that
has moved on: an action deleted, retired or repointed after the decision must
not change what the decision says was offered. `candidateKeys`, the `scores` map
and the `eliminations` denials all become action keys, for the same reason.

**Rejected:** deriving the offer from the action at read time. It makes every
historical report depend on today's catalogue, which is the failure ADR-004 and
the replay guard already spend effort preventing.

### 4. `PolicyScope` gains `action`, and an offer-level cap covers all its actions

`PolicyScope.level` becomes `tenant | objective | category | offer | action`,
resolved most specific first, by the domain's own `resolveAutonomy` walk with
one more rung.

**"Cap this offer" means: this offer, counting contacts across every action of
it.** A frequency cap exists to protect a customer from being contacted too
often about a thing. Two actions instancing one offer are one thing to the
customer, and a cap that counted them separately would let an offer contact
somebody twice as often by being split in two — a modelling change silently
loosening a customer protection.

**An action-level cap narrows within that**, never widens: the offer's cap still
applies, and the action's cap applies as well. Where both resolve, both are
enforced.

**This is the clause that binds slices 6 and 7.** ADR-014 §10's rollups count
contacts per channel per period; after this ADR they must be countable at both
levels, which means a delivery row must be attributable to the action *and* the
offer — which clause 3 guarantees by storing both.

### 5. Creatives hang off the action, and `couldRender` joins one hop

A **creative** is content for an action on a channel: `actionId` replaces
`offerId`, and the per-channel schema is unchanged.

An action is the thing that has a channel and a way of putting the offer, which
is what a creative is written for; an offer with one set of creatives across
three actions cannot say anything different about them, which is most of the
reason a second action exists.

`couldRender` becomes a single join — *does this action have an active creative
on the channel that won* — and stops resolving
`winnerOfferId ?? offerIdByKey.get(winner)` to get there.

**Creatives are not in the hashed catalogue snapshot** (it holds offers,
targeting and frequency policies, arbitration, boosts and connectors), so this
clause moves no hash by itself. Clause 2's key change does.

### 6. Experiment arms attach to actions

An arm is a variant of a thing that is offered, and the thing offered is the
action. An experiment scoped to an offer runs over every action of it; an arm
names an action.

`assignArm` keys on the customer reference and the experiment, not on the
offer or action, so **no assignment moves** and the per-arm figures in
`/performance` change only where a winner's key changes — which, by the
measurement above, is nowhere in the seeded corpus.

### 7. Identity moves, not only hashes, and the reseed is how it lands

Every decision id changes. Nothing migrates; the history is regenerated.

- **The seeded history is rewritten in the same commit.** `seedLedger` executes
  the corpus and writes decisions, deliveries and outcomes together
  (ADR-018 §2), so the three tables are consistent by construction: a delivery
  and an outcome carry the decision id that the same run produced. There is no
  window in which an old outcome points at a new decision, because no row
  survives the run.
- **Where no corpus was seeded there is nothing to regenerate** (added
  2026-09-17). A development console has started with an empty ledger since
  then (ADR-018 §3, amended), so its history is whatever someone made by using
  it. An identity change moves the ids of decisions made after it and leaves the
  ones before it as they were — and unlike the seeded corpus, those cannot be
  executed again to produce matching ids, because nothing generated them. The
  reset below still clears such a tenant, and what it clears is gone: a history
  made by hand is not regenerable, which is the smaller version of the limit
  this clause states for a real one.
- **A PostgreSQL tenant is reset, not patched**: `npm run seed:ledger -- --reset
  --tenant <id> --by <who>`, which refuses unless the ledger is synthetic and
  the tenant is named (ADR-018 §3). A tenant holding decisions made before this
  ADR keeps ids that no longer correspond to any action key; that is a
  demonstration database, and the reset is the supported answer.

**There is no migration for a tenant whose decision history matters, and this
ADR does not provide one.** Reset destroys the history. It is the answer for a
database of generated decisions and it is not an answer for a database of real
ones, where the records are evidence and the point of keeping them is that
nobody can rewrite them (ADR-004's append-only triggers exist to make that
true).

A real tenant would need one of two things, neither of which is built and
neither of which this ADR decides: decisions made before the split keep their
old ids and their old keys, with the catalogue holding the retired offer keys
alongside the action keys so an old record still resolves; or the history is
re-signed under a recorded migration, which means a chain of hashes with a
documented break in it and a check that the break is exactly where the migration
says. Both are real work.

**This is stated now because it costs nothing now.** No tenant holds a history
that matters — `METIS_DATA_CLASS=real` is refused everywhere while the subject
is unprotected (G-068), so every ledger in existence is synthetic and
regenerable. The first tenant whose history is evidence is the last moment this
is cheap, and by then the decision will be somebody's emergency. If a schema
change of this shape is needed after that point, it needs its own ADR and its
own slice, and "reset the tenant" is not available to it.
- **What proves nothing was orphaned**, asserted after the reseed: every
  `outcome_events.decision_id` and every `delivery_attempts.decision_id`
  resolves to a `decision_records` row; the three counts are 10,400, 10,400 and
  whatever clause 8's re-rolled model produces; and no decision id from the
  previous history survives in any of the three tables. The foreign keys enforce
  the first; the test states it anyway, because a constraint that is never
  exercised by a test is a constraint nobody has watched fail.

**The outcome model re-rolls, and its figures are not predictions.** Every draw
is keyed on the decision id — impression coverage, click, acceptance, rejection,
conversion, each lag and the realised value
(`apps/console/mocks/fixtures/synthetic-customers.ts`). New ids mean new draws,
so the seeded corpus will not produce 1,654 events across 1,228 decisions, and
the replacement cannot be predicted without running it. Every figure pinned on
those numbers — `seeded-ledger.test.ts`'s pinned block, two `CAPABILITIES.md`
rows, the outcome-loop end-to-end bound, the performance cascade's per-channel
sums — is re-pinned in the same commit, with the old and the new number both in
the message. A figure that moves silently here is the failure ADR-018 §6 was
written to prevent.

### 8. The tie-break is decided now, because the split is what makes ties reachable

Today no decision turns on the tie-break, and the closest two candidates come is
a gap of 0.00833. That is not luck: every candidate is a distinct offer with its
own propensity, margin and boosts, so equal priorities do not arise.

**The split creates the condition.** Two actions instancing one offer inherit
the same margin (clause 2), can carry the same boosts, and can score the same
propensity — three of the four terms of the ranking function identical by
construction. Ties stop being unreachable and become the ordinary case for the
exact pair the split introduces.

**So the rule changes: priority, then a stable order that a rename cannot
move.** `a.key.localeCompare(b.key)` is replaced by the candidate's position in
the artifact's `candidateKeys`, which is the flow author's declared order and is
already part of the hashed decision.

**There is no further fallback, and the absent case refuses.** Keys are unique
within an artifact, so position always separates two candidates: a comparison
that never runs is a branch nobody will watch fail, and keeping the key
comparison underneath would leave the thing this clause removes sitting in the
code, reachable only by the bug that would make it wrong. A scored candidate
that is not in `candidateKeys` is that bug — an artifact and a score map that
disagree about what was decidable — and the engine throws naming the artifact
and the key rather than ranking it first, which is what `indexOf` returning
`-1` would otherwise do silently.

**Why this belongs in this ADR rather than a later one:** a rename that can move
a winner is a defect whatever the corpus says today, and the corpus will stop
saying it the moment two actions of one offer are declared. Deciding it now
costs nothing measurable, because no decision's winner changes.

### 9. The control group: what must not move

The change is wrong if either of these moves, and both are asserted before the
corpora are regenerated:

- **`docs/conformance/canonical-corpus.json` is byte-identical.** It pins the
  canonicalisation algorithm over literal values (67 cases) and knows nothing
  about catalogues. A change here means the split reached the encoding, which it
  has no business touching.
- **`inputSnapshotHash` is unchanged on every decision-corpus case that exists
  before the reseed — 45 of them.** It hashes the request input, which names no
  offer and no action. A change here means the split reached the request
  contract.

`catalogueSnapshotHash` **does** move, on all 45 cases and every decision:
offers are in the hashed snapshot and their shape changes. That is expected and
is not a control.

*(Corrected 2026-09-17: this clause said 40 cases, the size of the corpus when
it was written. The corpus reached 44 with ADR-021 and 45 with ADR-021 §9. Cases
the reseed itself adds have no earlier hash to compare against, so the control
is over the 45 that exist before it.)*

## Consequences

- **Every decision in the seeded history gets a new id**, and every report, list
  and trace URL built from one changes with it. Nothing in the product stores a
  decision id outside the ledger.
- **Both engines' corpora are regenerated in the commit that makes the change**,
  and `decision-conformance.test.ts` must still exercise every reason code — the
  check that stops a code shipping unverified in a second engine.
- **The screens change in one place each**: a list of actions where there was a
  list of offers, and the creative editor hanging off the action. The Actions
  screen in `docs/METIS_CONSOLE_SPEC.md` stops being a view of offers.
- **`docs/CAPABILITIES.md`'s `offer` / `action` split row moves from PARTIAL**,
  and is the row this ADR is judged by.
- **The estimate in the directive (2–4 days) covers the mechanical change once
  this is accepted**, and not the modelling. That is what this document is for.
- **Nothing here makes a figure more real.** The corpus is still generated, the
  outcomes are still a model, and the labels still read synthetic (ADR-018 §8).

## Alternatives considered

**Rename the key and leave one object.** The cheapest thing that satisfies the
vocabulary and settles nothing: creatives still hang off the thing that is sold,
caps still cannot tell one action from its offer, and the next person who needs
two ways of offering one thing pays the blast radius again. Rejected because the
cost here is the hash move, and the hash move is identical either way.

**Defer until the rollups need it (slices 6 and 7).** Rejected on sequence: the
rollups key contacts and last-outcome per action, so deferring means keying them
on the conflated identity and re-keying after — the one thing the accepted
data-layer order was re-ordered to avoid.

**Keep the tie-break on the key and revisit if a tie appears.** Rejected in
clause 8. A tie appearing is a winner having already moved, discovered after the
fact in a system whose decisions are evidence.
