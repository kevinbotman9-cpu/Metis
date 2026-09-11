# Phase B — Gap analysis against a complete platform

**Date:** 2026-09-06
**Input:** `docs/review/VERIFIED_STATE.md` (Phase A), not `CAPABILITIES.md`
directly — Phase A is the trusted baseline.
**Compared against:** Appendix 1 of the brief. Deliberately not against
`METIS_Vision_and_Build_Plan.md`; a plan agreeing with itself proves nothing.
**Fixes made:** none.

Ordered by what an evaluation surfaces first, not by build order. The two are
almost opposites here, and that is the most useful thing this document says.

---

## 0. The finding that reorders everything

**METIS decides well and cannot act.**

The engine is genuinely strong: deterministic, replayable, conformance-tested
across two languages, with a decision record a regulator could read. Phase A
confirmed seven of eight Foundation capabilities against checks that bite.

But an evaluation does not begin at the engine. It begins with "show me a
campaign", and the honest answer today is that METIS has no campaign, no
audience, no content beyond a per-channel creative record, no channel adapter,
no schedule, and nothing that consumes an outcome once recorded. `POST
/outcomes` stores; **nothing reads what it stores** — verified by grep, no
consumer outside the ledger and the exporter.

So the platform is roughly:

| Layer | State |
|---|---|
| Decide | Strong, and provably so |
| Configure what it decides from | Half — durable store exists, console does not use it |
| Act on a decision | **Absent** |
| Measure what happened | **Absent** — capture exists, consumption does not |
| Learn from it | Absent, and correctly out of scope for this gate |

The middle two are what turn a decision engine into a marketing platform, and
they are the two with nothing in them. That is not a criticism of sequencing —
`BACKLOG.md` puts them at Stages 14–16 deliberately, after the data layer — but
it is what a buyer sees in the first ten minutes.

---

## 1. What an evaluation surfaces first

### 1.1 "Show me a campaign end to end" — **ABSENT**

There is no campaign object, no journey, no schedule, no send. A demonstration
today can show: a catalogue, a decision flow, a decision being made, the trace
explaining it, a replay reproducing it, and a shadow comparison. It cannot show
a customer receiving anything.

**Blocked by:** nothing architectural. This is unwritten code (W-016 to W-019,
W-035 to W-037), and the decision path is already the hard half. The adapter
contract in W-017 is the first real design decision.

### 1.2 "Change something and show me the effect before it ships" — **PARTIAL, and weaker than it looks**

`ChangeSetSimulation` exists as a *type* with `populationSize`,
`projectedMarginDelta` and `biasRatio`, and `/approvals/[id]` renders it. But
`simulateDecisionFlow` is `x-metis-status: proposed` — nothing serves it
(`docs/metis-api.openapi.yaml:2646`). The simulation attached to a change set is
fixture data.

This is the gap most likely to be mistaken for a feature during a demo, because
the surface is convincing and the number behind it is not computed.

**What *is* real:** the flow-test gate (W-023). A version can carry cases, and
publish refuses if they fail. That is a genuine pre-publish check and it is
stronger than most of what vendors show under "simulation", but it answers a
different question — "does this flow still do what I said" rather than "what
would this change do to my population".

**Blocked by:** no profile store to sample a population from (W-008). The
simulation cannot be built honestly before there are profiles to simulate over.
This is a real architectural block, not unwritten code.

### 1.3 "Who can change what, and how is it approved?" — **PRESENT, and a genuine strength**

Change sets, approvals, agent-versus-person provenance, an append-only audit,
publish/promote as separate permissions refused server-side, an L0–L4 autonomy
ladder, and — verified in Phase A — append-only enforced by database trigger and
tested by attempting `UPDATE`.

Seven permissions are enforced at the route: `approve:changes`,
`edit:arbitration`, `edit:autonomy`, `edit:integrations`, `edit:offers`,
`promote:flows`, `publish:flows`.

**What a buyer would find missing:** RBAC is role-level, not artefact-level.
There is no ABAC, no approval quorum, no branching or merge of configuration,
and no evidence pack. Also: the autonomy ladder exists per scope but Phase C
must determine whether it reaches a form field.

### 1.4 "Prove a decision from six months ago" — **PRESENT, and the strongest thing here**

Replay re-executes against the recorded artifact and compares chain hashes.
Two independent engines agree on a shared corpus. The decision record names
every version that produced it. Phase A confirmed the verdict is guarded.

This is the differentiator and it is real. Worth saying plainly, because the
rest of this document is about what is missing.

### 1.5 "Take our data and leave" — **PRESENT, bounded**

Export, re-import, byte-identical re-export, and a replay on the imported
instance producing the same chain hash. Bounded to what is durably stored:
registry, ledger, catalogue. Approvals and the audit log are still in the
console's in-memory store, so they are outside the export.

---

## 2. Reference model, line by line

`PRESENT` = exists and Phase A found a check. `PARTIAL` = exists with a stated
limit. `ABSENT` = nothing.

### Data — 1 of 8

| Line | State | What exists / what blocks it |
|---|---|---|
| Profile store, versioned data model | **ABSENT** | No profile store. The engine takes `input` from the request. **Blocks:** simulation, S1's realistic variants, segments |
| Identity resolution | **ABSENT** | Single source of identity; `gaps.md` records the limit |
| Online feature service, freshness, lineage | **ABSENT** | W-009. **Blocks:** replay exactness — see Phase A finding A-3 |
| Offline store | **ABSENT** | — |
| Streaming and batch ingest | **ABSENT** | W-010 |
| Interaction history, fast recency queries | **ABSENT** | `contactHistory` arrives *on the request*, so frequency capping works but nothing stores history. **Blocks:** outcome-conditioned suppression, W-012 |
| Consent and preference store | **PARTIAL** | Consent is on the request and enforced in the engine (`CONSENT_WITHHELD` is a live reason code). No store, no preference centre |
| Retention and erasure | **ABSENT** | ADR-004 proposes crypto-shredding, **Proposed not Accepted**. **Blocks:** everything in this section — the brief and the ADR agree that retrofitting after four stores are populated is the most expensive item on the list |

### Decisioning — 5 of 8, the strongest section

| Line | State | What exists / what blocks it |
|---|---|---|
| Eligibility / relevance / suitability as distinct layers | **PRESENT** | `PolicyKind` at `core/src/domain.ts:174`, distinct reason codes, distinct audit lines |
| Frequency and suppression policy, caps | **PARTIAL** | Caps and rest-after-decline both enforced, in both engines, since 2026-09-11 — `FREQUENCY_CAP_BREACHED` and `COOLDOWN_ACTIVE` are live and name the rule. The decline arrives on the request; the platform records no rejection of its own, because the outcome funnel is monotone. Outcome-conditioned suppression driven by the platform's own interaction history is still absent (G-086) |
| Multi-level arbitration | **ABSENT** | One arbitration node. No within-group-then-across-group |
| Channel- and placement-specific ranking | **ABSENT** | One ranking function per tenant |
| Slate and bundle selection | **ABSENT** | Verified: no `slate`/`slots` anywhere in the engine. Returns a single action |
| Optimisation constraints | **PARTIAL** | A `constraint` node exists and applies suitability policies. Cardinality, mutual exclusion, diversity, budget, inventory and fairness are absent |
| Deterministic tie-breaking | **PRESENT** | Ties break by key; asserted in the shadow comparison and the corpus |
| Business boosts with immediate simulated impact | **PARTIAL** | Boosts exist and are editable; "immediate simulated impact" needs §1.2 |

### Intelligence — 0 of 8

| Line | State | What exists / what blocks it |
|---|---|---|
| Model gateway and registry | **ABSENT** | `score-model` and `score-adaptive` nodes exist and pin a model id and version into the artifact — but the propensity is `seededUnitInterval(customerId, key, modelKey)`, a deterministic stand-in (`engine.ts:484`). The *seam* is real; nothing sits behind it |
| ONNX / PMML import | **ABSENT** | — |
| Adaptive online learning | **ABSENT** | Outcomes are captured and **nothing consumes them** |
| Contextual bandits, exploration | **ABSENT** | — |
| Drift, calibration, auto-quarantine | **ABSENT** | — |
| Champion/challenger | **ABSENT** | Flow-version shadow mode is built and is a different thing; W-034 should reuse `packages/runtime/src/shadow` rather than write a second comparator |
| Model shadow scoring | **ABSENT** | As above |
| Feature attribution in the record | **ABSENT** | The record carries a score breakdown — propensity, value, boost, context, cost — which is *arithmetic* attribution, not feature attribution |

The honest summary: METIS has a place to put intelligence and no intelligence.
That is defensible for this gate and would be a hard conversation in an
evaluation, because "replaceable intelligence" is a §14 differentiator and there
is currently nothing to replace.

### Content — 1 of 8

| Line | State | What exists / what blocks it |
|---|---|---|
| Action and creative as distinct entities | **PARTIAL** | `Objective > Category > Offer > Creative`. The offer/action split is unmade — an offer carries the `key` used as the action. W-014 |
| Per-channel creative schema | **PRESENT** | `EmailContent`, `SmsContent`, `WebContent`, `PushContent`, `OutboundCallContent` — five typed shapes |
| Content library: review, approval, effective dating, expiry, usage | **ABSENT** | Creatives have a `status` and nothing else. Verified: no `effective_date`/`valid_from` on content |
| Personalisation tokens, grounding contract | **ABSENT** | — |
| Localisation | **ABSENT** | No i18n mechanism at all; ADR-005 Proposed |
| Cross-channel preview | **ABSENT** | — |
| Brand compliance checks | **ABSENT** | — |

### Delivery — 0 of 9

Everything absent. No inbound container, no placement/slot object, no agent
surface, no outbound adapter, no volume governance, no batch executor, no
event-triggered decisioning, no paid-media export, no quiet hours or throttling.

`placement` exists as a *field on a request*, not as a configurable object.

**Blocked by:** nothing architectural for the adapter itself. W-017's advice —
build one channel properly so the second can be a package — is the right shape.

### Campaign and journey — 0 of 5

Everything absent: segments, journeys, scheduling, A/B and multivariate testing,
holdouts and incrementality.

**Blocked by:** segments need a profile store (W-008); journeys need a channel
(W-017); experiments need outcome consumption.

### Simulation — 1 of 6

| Line | State | Note |
|---|---|---|
| Distribution test over a sampled population | **ABSENT** | Needs profiles |
| Version-versus-version diff by segment | **PARTIAL** | Shadow mode diffs two versions on *live* traffic by winner, ranking and reason — genuinely useful, and not the same as diffing over a sampled population before shipping |
| Under-served analysis | **ABSENT** | — |
| Bias and fairness gate before publish | **ABSENT** | `biasRatio` is a fixture field. Nothing computes or enforces it |
| Counterfactual replay over history | **PARTIAL** | `getCounterfactual` is declared `proposed`; replay of a single decision is real |
| Flow unit tests in CI | **PRESENT** | W-023, and publish refuses on failure |

### Governance — 5 of 7

| Line | State | Note |
|---|---|---|
| Change sets, approvals, segregation of duties | **PRESENT** | |
| Autonomy ladder | **PRESENT** | L0–L4 per scope, editable, enforced server-side |
| Immutable audit | **PRESENT** | Trigger-enforced, Phase A verified by attempting `UPDATE` |
| Environment promotion | **PRESENT** | Publish and promote separated, rollback audited |
| Branching and merge of configuration | **ABSENT** | Verified: no branch concept in the registry |
| Artefact-granular RBAC / ABAC | **ABSENT** | Seven role-level permissions; nothing per-artefact |
| Evidence packs | **ABSENT** | W-049 |

### Measurement — 0 of 6

Outcome capture exists (`recordOutcome`, `listOutcomes`, stored in the ledger,
exported in the bundle). **Nothing consumes it** — verified by grep across
`packages/*/src`. No reporting, attribution, ROI, channel or segment
performance, model performance, or cost-per-decision surface exists.

This is the second-most-likely thing to be mistaken for present, because the
capture half is genuinely built and the word "outcomes" appears in the API.

### Platform — 3 of 10

| Line | State | Note |
|---|---|---|
| Package system and SDK | **ABSENT** | `packageRanges` are resolved and pinned at compile time, so packages exist as a *versioning* concept with no installable artifact |
| Industry / regulatory packs | **ABSENT** | — |
| Theming, layout manifests, pluggable panels | **PARTIAL** | Token-based theming across four axes is real; layout manifests and panels are not |
| Persona workspaces | **ABSENT** | Roles filter navigation; that is not a workspace |
| SSO / SCIM | **ABSENT** | Verified: no SSO, SCIM or OAuth anywhere |
| Multi-region residency | **ABSENT** | Verified: no region concept |
| Observability, SLOs, quotas | **ABSENT** | Verified: no OpenTelemetry. There is a latency gate, which is a benchmark, not observability |
| Degradation ladder | **ABSENT** | — |
| DR and chaos | **ABSENT** | — |
| Export and re-import | **PRESENT** | Bounded, §1.5 |

---

## 3. Scored

| Section | Present | Partial | Absent | Of |
|---|---|---|---|---|
| Data | 0 | 2 | 6 | 8 |
| Decisioning | 3 | 3 | 2 | 8 |
| Intelligence | 0 | 0 | 8 | 8 |
| Content | 1 | 1 | 6 | 8 |
| Delivery | 0 | 0 | 9 | 9 |
| Campaign and journey | 0 | 0 | 5 | 5 |
| Simulation | 1 | 2 | 3 | 6 |
| Governance | 4 | 0 | 3 | 7 |
| Measurement | 0 | 0 | 6 | 6 |
| Platform | 1 | 1 | 8 | 10 |
| **Total** | **10** | **9** | **56** | **75** |

The shape matters more than the total. METIS is strong in exactly two of ten
sections — decisioning and governance — and those two are the hard ones to
retrofit. Everything absent in Delivery, Campaign and Measurement is *additive*:
it does not require unpicking what exists.

That is the good news in this document, and it is not a small point. A platform
with a weak engine and a rich campaign layer cannot be fixed. This is the other
way round.

---

## 4. What blocks what — the architectural dependencies

Gaps that are only unwritten code are cheap. Gaps that need a storage or
contract change are expensive and belong to Phase D. Sorted by that distinction.

### Expensive — needs a decision or a format change first

1. **Retention and erasure (ADR-004, Proposed).** Blocks the profile store, the
   feature service, interaction history and adaptive learning — every store that
   would hold subject data. The ADR's own argument is that deciding after those
   are populated means rewriting history, which is the one operation
   append-only exists to forbid. **This is the single highest-leverage open
   decision in the project.**

2. **Replay's input snapshot (Phase A finding A-3, S2).** When the feature
   service lands, replay must read a snapshot rather than the live store. Phase
   A found the guard that would detect a wrong-snapshot replay is untested.
   Whether the record format can already carry a full input snapshot is a Phase
   D question, and if it cannot, it is a breaking format change that is far
   cheaper now than after the ledger holds production decisions.

3. **The offer/action split (W-014).** Regenerates every chain hash, as the
   vendor-neutral rename did. Cheaper before the ledger is real.

4. **Screen-configurability (Phase C).** Not scored above because it is a
   property rather than a feature, but it gates whether any of the absent
   objects can be configured by the people who need to configure them.

### Cheap — unwritten code on foundations that already hold

Channel adapters, journeys, schedules, segments, reporting, attribution,
experiments, content library, model gateway. Each is substantial work; none
requires unpicking an existing decision. The contracts, the versioning, the
governance path and the audit already exist and would carry them.

---

## 5. What a buyer would find missing, in the order they would find it

1. No campaign, no send, no journey — nothing reaches a customer.
2. Simulation that looks present and is fixture data.
3. No reporting: outcomes go in, nothing comes out.
4. No models. The seam is there and empty.
5. No content lifecycle — no approval, effective dating or expiry on creatives.
6. No segments or audiences.
7. Nothing configurable from the screen beyond boosts, weights, autonomy and
   connectors — Phase C will quantify this.
8. No SSO, no observability, no residency story.

And, on the other side of the ledger, four things that would stand out in an
evaluation as unusually strong: byte-identical replay across two independent
engines; publish gated on compilation *and* on the flow's own tests; an
append-only audit enforced at the schema and tested by attempting to violate it;
and a working export with a round-trip conformance check.

---

## 6. Uncertainty

- **Whether `placement` should be an object or stays a request field** was not
  determined. It is currently a string on the request and a configurable
  placement/slot object is what §Delivery assumes. Phase C's matrix will force
  the question.
- **Whether the `constraint` node generalises** to Appendix 1's optimisation
  constraints, or is specific to suitability policies, was read from one call
  site and not traced fully.
- **The five channel content types** were counted from `domain.ts`; whether all
  five are rendered and exercised end-to-end was not checked here.
