# Phase D — What is missing, and the order it becomes buildable

**Date:** 2026-09-07
**Builds on:** Phase A (`VERIFIED_STATE.md`), Phase B (`GAPS_PLATFORM.md`),
Phase C (`CONFIGURABILITY.md`). Those established *what exists*; this is about
*what to do*, and it corrects them where a week of building has moved them.
**Fixes made:** one, and it is the subject of §2.

---

## 1. Phase B and C are stale in seven places

Recorded first, because a gap register that overstates the gap is as misleading
as one that understates it.

| Phase B / C said | Now |
|---|---|
| Slate and bundle selection — **ABSENT** | **BUILT** (W-052). `selectSlate` projects from the decision rather than re-deciding, so no chain hash moved |
| `placement` is a field on a request, not a configurable object | **Object.** `Placement` in the catalogue, `POST /placements/{tenant}/{key}/decisions` |
| Delivery — inbound container **ABSENT** | **BUILT.** A partner storefront drives four slots end to end |
| Observability — **ABSENT** | **PARTIAL.** `/integrations/traffic` records request/response for the development API. Production remains W-048 |
| Contact policy — caps enforced | Still true, and **the web flow was not enforcing them.** Four filter nodes, no constraint node, so consent and frequency were read and ignored. Fixed in `inbound-web-offers` 1.9.0 |
| Offer / creative — `New offer` is an inert button | **BUILT.** Create and edit both, permission-gated |
| Configurability — "five object types configurable, thirty not" | The count was right and **the framing was wrong.** See §2 |

---

## 2. The finding that reorders the configurability question

Phase C counted screens. The real number was zero, and it was zero for one
reason that no amount of screen-building would have fixed.

**Verified by driving the running API:**

```
PUT /api/arbitration/telco-uk   { value: 0.1, boost: 3.0 }   → 200
GET /api/arbitration/telco-uk   → weights persisted, formula updated to
                                   "Priority = P^1.00 × V^0.10 × B^3.00 × C^0.50",
                                   updatedBy: marcus.webb@telco.example
POST /placements/.../decisions  → acq_fibre_900@0.7935   (before)
POST /placements/.../decisions  → acq_fibre_900@0.7935   (after)
```

The console wrote to `store.*`. The engine read the fixture modules. Every
write landed somewhere nothing read. And `fixtures/engine.ts` carried a comment
asserting the opposite — *"a change to a policy or boost changes the decisions,
because the engine is reading the same catalogue the UI edits"* — which is how
this survived: the file that would have told you said it was fine.

So the requirement "configurable from the screen by a business user" was not
short by thirty screens. It was short by **one seam**, and the five screens
that existed were as cosmetic as the thirty that did not.

### Why the fix had to bring versioning with it

A `DecisionRecord` keeps `catalogueSnapshotHash` and never the catalogue. That
is safe while the catalogue is frozen — any copy is the right copy. The moment
it becomes editable, replay must answer *"the catalogue as it stood then"*, and
replaying against today's would either report a difference that is really
somebody's edit, or agree for the wrong reason.

`mocks/catalogue-state.ts` therefore does two things at once: builds the
snapshot from the store, and keeps every distinct one by hash. Replay looks up
the one the decision names, and **refuses with 409 rather than approximating**
when it is not held.

This is the shape every remaining feature should copy:

> **Making something configurable is not a screen. It is: the engine reads it,
> the decision record names the version of it that applied, and that version
> stays fetchable for as long as the decision does.**

Configurability and traceability are not two goals in tension. Done properly
they are one mechanism, and the second falls out of doing the first honestly.

---

## 3. The organising model

Everything a decisioning platform configures is one of six kinds. The missing
features are not a list; they are empty cells in this grid.

| Kind | Built | Missing |
|---|---|---|
| **Catalogue object** — what can be offered | objective, category, offer, creative, placement | action (split from offer), content asset, treatment |
| **Policy** — what may be offered | eligibility, relevance, suitability, frequency, consent | volume/budget caps, mutual exclusion, diversity, fairness |
| **Audience** — to whom | *nothing* | segment, computed trait, holdout group |
| **Flow** — how it is decided | the DAG, compiled, versioned, replayable | authoring from the screen, multi-level arbitration |
| **Model** — how it is scored | the *seam*: pinned id and version in the artifact | any actual model, registry, monitoring, adaptation |
| **Journey** — when and over what horizon | *nothing* | schedule, wait, trigger, campaign |

And two invariants cut across every cell:

- **Traceable** — if it influenced the decision, the record names its version,
  and that version is still fetchable.
- **Configurable** — it is CRUD-able from the console through a spec'd
  operation, and the engine reads what the console writes.

A feature is done when both hold. Before today, `arbitration` passed the first
and failed the second while appearing to pass both.

---

## 4. Against the market, in METIS's terms

Category leaders — Pega CDH on the decisioning side, Adobe and Braze on the
orchestration side — differ from METIS in three ways that matter and several
that do not.

**Where METIS is genuinely ahead:** byte-identical replay across two
independently written engines held to a shared corpus. No mainstream platform
offers this. It is the reason to buy METIS and it should not be traded away for
feature parity.

**Where the gap is real and structural:**

### 4.1 Intelligence — 0 of 8, and it is the loudest absence

The seam is honest: `score-model` nodes pin a model id and version into the
artifact, which is exactly what makes a scored decision replayable. Behind the
seam is `seededUnitInterval(...)` — a deterministic stand-in.

Competitors lead with adaptive models that learn from outcomes continuously.
METIS captures outcomes (`POST /outcomes`, stored in the ledger) and **nothing
reads them** — confirmed by grep across `packages/*/src`.

The tension to resolve deliberately: continuous online learning and
byte-identical replay are in direct conflict. A model that updates between two
identical requests makes them disagree. METIS's answer should be that
**learning produces versions** — a model trains offline, is published as a
pinned version through the same change-set and approval path as a flow, and
every decision names the version that scored it. That is slower to react than a
bandit and it is the only version of adaptation compatible with the platform's
central claim. It is also a better story for a regulated buyer than "the model
changed and we cannot tell you what it was".

### 4.2 Measurement — 0 of 6, and it is the cheapest to close

Outcome capture exists and is durable. Nothing consumes it. Every downstream
capability — experiments, adaptive models, ROI, under-served analysis — needs
one thing first: **an outcome-joined read model**. This is the highest
value-per-unit-effort item on the list, because it is unblocked, it is small,
and four other capabilities are waiting behind it.

### 4.3 Experimentation — absent, and it fits the architecture unusually well

Holdouts, A/B and incrementality are table stakes and METIS has none. But the
vocabulary already reserves *variant* for experiments, and the decisive detail
is that **an experiment assignment is an input to a decision, not a wrapper
around one**. Assign deterministically from `(customerId, experimentId)`,
record the assignment in the hashed half, and an experiment becomes replayable
for free — where most platforms cannot tell you six months later which arm a
customer was in.

### 4.4 Journeys and channels — absent, and correctly last

METIS decides well and cannot act. There is no adapter, schedule or send. This
is what an evaluation asks for first and it is what the architecture should
build last, because a journey is a sequence of decisions and the decision had
to be right first. W-017's advice — build one channel properly so the second is
a package — stands.

**Where the market has features METIS should decline to copy:** cross-channel
attribution modelling, look-alike expansion, and send-time optimisation are all
statistical claims that would be unfalsifiable inside a platform whose selling
point is that every number is traceable to its source. Adding them without a
trace would undermine the thing being sold.

---

## 5. The build order, and why it is this order

Three root blockers gate almost everything. Nothing else should be started
before they are placed.

```
  ┌─ profile store (W-008) ──┬── segments ── journeys ── campaigns
  │                          └── population simulation ── bias gate
  ├─ outcome read model ─────┬── measurement surfaces
  │                          ├── experiments / holdouts
  │                          └── model training loop
  └─ channel adapter (W-017) ─── outbound send ── scheduling
```

| # | Work | Why here |
|---|---|---|
| 1 | **Catalogue configurability spine** | DONE today. Everything below is cosmetic without it |
| 2 | **Outcome read model** | Unblocked, small, gates three capabilities |
| 3 | **Experiment assignment in the hashed record** | Small, and uniquely well-suited to this architecture (§4.3) |
| 4 | **Flow authoring from the canvas** | The largest remaining `FIXTURE` cell. A platform whose central object is only editable in source is not configurable, whatever the other screens do |
| 5 | **Profile store** | The biggest architectural commitment; ADR-004 warns retrofitting retention after four stores are populated is the most expensive item on the list. Decide retention *before*, not after |
| 6 | **Volume and budget constraints** | Resolve as an *input* before the deterministic core, like a connector — shared counters must not enter the hashed half |
| 7 | **Model registry behind the existing seam** | Versioned, approved, pinned (§4.1) |
| 8 | **Channel adapter, then journeys** | Last, deliberately |

### The trap in item 6, stated now

Volume caps ("this offer at most 10,000 times this month") need state shared
across decisions. Reading a live counter inside the engine would destroy
determinism: the same request would decide differently depending on when it
ran. The counter must be resolved *before* the deterministic core and enter as
a recorded input, exactly as connector fields do — then the decision stays
replayable because the count it saw is part of what was decided.

The same trap catches contextual bandits, real-time inventory and pacing.
`resolveInputs` is where they belong, and the boundary already exists and is
guarded by `no-egress.test.ts`.

---

## 6. What this document does not claim

It does not claim the platform is close. Phase B's scoring stands: Intelligence
0 of 8, Delivery 0 of 9, Campaign 0 of 5, Measurement 0 of 6. Today's fix
changed one thing — configuration now reaches the engine — and that unblocks
the rest rather than substituting for it.

It also does not claim the configurability work is finished. Flows, policies,
frequency caps, boosts and the taxonomy are still `FIXTURE` for *create* and
*edit*; what changed is that when the console does write, the engine now reads
it. The screens are still owed. They are now worth building.
