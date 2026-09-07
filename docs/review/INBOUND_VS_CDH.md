# Inbound decisioning — METIS against Pega CDH

**Date:** 2026-09-07
**Scope:** the inbound real-time path only — a website or app asking for an
offer and rendering it. Outbound, batch and journey orchestration are Phase B's
territory and are not re-scored here. Paid media is excluded at the requester's
instruction.
**Method:** every claim about METIS was checked against the tree — the engine,
the spec and the fixtures — rather than read from the capability map. Claims
about CDH are from its product structure, not from an installed instance.
**Prompted by:** the Verizon storefront demo (`docs/STOREFRONT_DEMO.md`), which
exercises this path end to end and surfaced most of what follows.

This does not contradict Phase B, which scored Delivery **0 of 9** and flagged
`placement` as a request field rather than a configurable object. It zooms into
that row.

---

## 1. What "inbound" means in CDH

Naming the parts first, because the gaps land unevenly across them and a
capability-by-capability list obscures which ones are load-bearing.

CDH's inbound is a closed loop of five moving parts:

1. **A container** — a named slot set on a page, with placements, slot counts
   and per-container policy. The client asks the container; it does not name a
   flow.
2. **A ranked slate in reply** — several treatments in priority order, each
   carrying an interaction id.
3. **A client SDK** that renders them and posts impressions and clicks back
   against that id.
4. **Adaptive models** created per treatment × channel × direction, learning
   continuously from those impressions and clicks.
5. **Interaction history**, which feeds contact policy and suppression on the
   *next* request, held by the platform rather than by the caller.

Engagement policy, arbitration and the design-time tooling sit around that loop.
The loop is the product; the policy model is the part everyone copies.

---

## 2. Where METIS is at parity or ahead

**The policy model is a rename, not a gap.** Eligibility / relevance /
suitability is the same three-tier structure, with `relevance` standing in for
*applicability* deliberately — `CLAUDE.md` records the choice. Arbitration with
multiplicative business boosts maps onto P·C·V·L closely enough that the
difference does not survive a slide.

Four things are stronger than the CDH equivalent, and they are what an inbound
demo should lead with:

| | Evidence |
|---|---|
| **Byte-identical replay across two independent engines**, held to one conformance corpus | `determinism.test.ts`, `decision-conformance.test.ts`, `engines/kotlin`. CDH explains a decision; it does not reproduce it hash-for-hash in a second implementation |
| **Append-only audit enforced by database trigger**, verified by attempting to violate it | Phase A broke it and watched the check bite |
| **Publish gated on compilation *and* the flow's own tests** | W-023 |
| **A p99 latency gate in CI at S1 scale** | `bench/harness`, `s1.test.ts` |

Add to that a closed set of reason codes whose coverage is corpus-enforced
across both engines. "Why was I not shown that offer" has a better answer here
than in most deployments of the thing being compared against.

---

## 3. Findings

Severity per §6 of the review brief.

### I-1 — One action, not a ranked slate · S2

The engine returns a single winner. Every real page has several slots, and a
container answers with a list.

The data is already there: `decision.scores` carries every ranked candidate with
its priority, and the record names a `runnerUp`. What is missing is a contract
that returns them and a rule for composing the slate — cardinality, mutual
exclusion, diversity.

**Why S2 rather than S3.** This is a now-or-never shape. The container response
is the contract every client integrates against; adding "and sometimes it is a
list" after partners have built on the single-action shape is a breaking change
to the most widely consumed surface in the platform. `CAPABILITIES.md` marks
slate selection OUT OF SCOPE and W-028 puts it at Stage 18, behind multi-level
ranking. For inbound, the *contract* half has to land with the container at
Stage 14 even if the optimisation half stays at 18.

**Observed:** the storefront demo works around it by asking two different flows
for two slots on one page. That is honest and, for genuinely different
questions, correct — but it is not a container, and it does not scale to a page
with six slots.

### I-2 — The trace names an adaptive model that does not exist · S4

`score-adaptive` is a node type in the closed set, and
[`engine.ts:479`](../../packages/runtime/src/deterministic/engine.ts:479)
computes it identically to `score-model`: a seeded deterministic function of
customer, offer key and model version.

That is recorded honestly at the capability level — §7 says the model gateway is
out of scope and "nothing here claims to learn". The problem is one level down.
The fixture flow pins `adm_accept_v4@4.2.0`, and the trace reads *"Scored 3
candidate(s) with adm_accept_v4@4.2.0"*. In a room that knows what ADM stands
for, that sentence asserts an adaptive model ran. Nobody wrote a false claim;
the naming makes one anyway, in the one artefact the project asks people to
trust literally.

**Remedy:** have the trace state what kind of scorer ran, and rename the fixture
model so it stops borrowing another vendor's initialism for a capability that is
not built. Neither is free — the model id is an input to the seeded propensity,
so renaming it moves every chain hash in `service-cases.json` and regenerates
that corpus, exactly as the vendor-neutral rename did. Annotating the trace is
the smaller of the two and does most of the work. **Or** implement
`score-adaptive`, but that is W-032, not a fix.

### I-3 — Contact policy and consent trust the caller · S3

[`engine.ts:415`](../../packages/runtime/src/deterministic/engine.ts:415) reads
`request.contactHistory.withinPeriod`, and consent is read from
`request.consent`. Both are enforced properly once supplied — caps bind to a
scope, the breached cap is named in the denial, `CONSENT_WITHHELD` has its own
reason code and a service exemption.

But the counts come from the website. A caller cannot be trusted to report how
often it has already shown an offer, and across channels it does not know: the
web page has no idea what the email sent yesterday. In CDH these are evaluated
against interaction history the platform holds.

This is the finding that fails a compliance review rather than a feature review,
and it is the weakest answer in the set to a question that will be asked.

**Blocks:** W-012, and it is why W-011 is the real linchpin of the inbound loop.

### I-4 — No capability row covers frequency capping or consent · S5

`CAPABILITIES.md` has no row for either, in any state. Both are built, both are
enforced by the engine, both are visible in the console and in the demo, and
both carry the material limit in I-3.

Same species as Phase A's A-9. An unregistered capability is not a false claim,
but the capability map is meant to be the single answer, and a reader looking
for "do you do frequency capping" finds silence.

### I-5 — No container or placement object · S3

`placement` is a string on the request. The engine uses it for the seeded
propensity and writes it to the record; nothing else reads it. There is no slot
count, no per-placement policy, no per-placement candidate scope, and no way to
express "this slot takes three, excluding whatever the hero already took".

Phase B left open whether `placement` should become an object. The inbound path
answers it: **it has to.** A container is the artefact a client integrates
against, and it is the natural home for the slate rules in I-1.

### I-6 — No SDK, and no impression capture on render · S3

W-016. The storefront calls the decision API directly and records nothing when a
slot paints. `POST /outcomes/{tenantId}/{decisionId}` accepts impression, click,
acceptance, rejection and conversion — the shape is right and the decision id is
a serviceable interaction id — but nothing captures the impression automatically,
so the record depends on every integrator remembering to post it.

This matters twice over: it is the difference between a demo and an integration,
and impressions are exactly the training data I-2 would need.

### I-7 — Anonymous to known is not modelled · S3

No profile store (W-008), and identity resolution is explicitly out of scope in
W-010 with a note to register it as a known limit. The visitor who browses
anonymously and then signs in — the most ordinary journey on a telco website —
has no representation. Today each request carries whatever the caller knows, and
the two sessions are unrelated.

### I-8 — No event-triggered decisioning · S5

No stream ingestion (W-010), so nothing can decide in response to behaviour;
every decision is pulled by a caller. Deliberate and staged, recorded here
because it is a standard line on an inbound comparison and will be asked about.

### I-9 — Design-time is thinner than the runtime · S5

The canvas is read-only (W-024), ad-hoc simulation is a proposed operation that
nothing serves, and there is no analogue of the offer-distribution and
opportunity-finding tools an inbound buyer will have seen. The runtime is
credible; the authoring experience around it is where the distance is largest,
and Phase C already quantified that.

---

## 4. What to say in the room

Three questions will come, and the honest answers are short.

- **"Can you fill a whole page?"** No — one decision returns one offer. The
  storefront asks two flows for two slots, which is real and also a workaround.
  The container and slate are I-1.
- **"Does it learn from what people click?"** No. Outcome capture is built and
  the scoring seam is empty. Say it plainly; it is checkable in five minutes,
  and the trace naming `adm_accept_v4` makes it worse to be caught on.
- **"Where do the frequency counts come from?"** The caller. This one has no
  good spin — it is I-3, and the fix is the interaction history store.

Against those, the replay demonstration is the strongest thing in the platform
and does not depend on any of the above.

---

## 5. Sequencing

The dependency chain for a working inbound loop is tighter than the backlog's
current ordering implies, and **W-011 is the linchpin** — it unblocks contact
policy and the training data at once.

```
W-016 container  →  W-052 slate contract  →  impression capture (W-018)
                                                      ↓
                                          W-011 interaction history
                                                      ↓
                                          W-012 contact policy from history
                                                      ↓
                                          W-032 adaptive learning
```

Two changes to the backlog follow, and are made in the same commit as this
document:

1. **W-052** — the container object and the ranked-slate contract, at Stage 14,
   carrying the contract half of W-028 forward. W-028 keeps the optimisation
   half at Stage 18.
2. **W-011 moves ahead of W-012 explicitly**, which it already did implicitly,
   with the inbound dependency stated so the ordering survives a re-plan.

---

## 6. What this evaluation does not cover

- **Paid media**, excluded at the requester's instruction.
- **Web chat and conversational channels**, not examined.
- **CDH's actual behaviour in a running instance.** The comparison is against
  its product structure. Where a detail of its API shape mattered, the finding
  is written so it stands on the METIS side alone.
- **Outbound**, batch, journeys and segments — Phase B, unchanged.
- **Whether any of this should be built.** These are gaps, not commitments. The
  severities say what it costs to wait, not what to do.
