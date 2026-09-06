# METIS — Build backlog, Stage 7 onward

**For:** Claude Code, as the implementation agent.
**Derived from:** `docs/CAPABILITIES.md` (2026-09-06) read against
`METIS_Vision_and_Build_Plan.md`. Where those two disagree, CAPABILITIES.md
wins, because it is evidence-based.
**Supersedes:** `PHASES_SUMMARY.md` entirely. See W-000.

**Adopted into the repo:** 2026-09-06. Every premise below was checked against
the tree before adoption; two did not survive, and both are corrected in place
rather than silently:

- **W-000's premise was already stale.** `docs/PHASES_SUMMARY.md` does not
  exist — it was deleted on 2026-09-05 in `7330292` along with the rest of the
  Phase 0 tree. The item is rewritten below to keep the half that is still
  real, which is the CI check, and that half is the valuable one.
- **Two of the six commands did not exist.** `npm run test:e2e` and
  `npm run typecheck` were only reachable from `apps/console`, so an agent
  following §0 verbatim would fail on its first command. Root scripts were
  added that mirror what CI runs.

Everything else was verified true: the gate is p95 with p99 measured but not
gated, `packages/portability` does not exist, `/decision-flows/[id]` is absent
from the axe sweep, `tsc --build` is broken, there is no bundle-size check and
no i18n mechanism, and the offer/action split is unmade.

---

## 0. Rules for this backlog

These are constraints on every PR in this file. They are the existing project
rules restated so an agent picking up a single work item does not have to
re-derive them.

1. **BUILT means a test fails when it breaks.** A work item is not done because
   the code exists or because it works when you try it. Each item below has a
   *Done when* block naming the check. If you write the code and not the named
   check, the item is PARTIAL and must be recorded as PARTIAL in
   `docs/CAPABILITIES.md`.
2. **Verify the check bites.** After writing a guard, break the thing it guards
   and confirm the check goes red. Record that you did. Several existing entries
   in CAPABILITIES.md say "verified to bite" — keep that habit, it is the
   difference between a test suite and a decoration.
3. **OpenAPI first.** No endpoint exists until it is in
   `docs/metis-api.openapi.yaml`. `packages/client` is generated from it; the
   console compiles against the generated client so drift is a compile error.
   Add the path, regenerate, then implement.
4. **No LLM in the decision path.** Ever. If a feature seems to need one it
   belongs in the authoring plane or an async enrichment path with a cached,
   versioned result. W-004 makes this a test rather than a promise.
5. **Two engines stay in step.** Anything that changes decision semantics or
   canonical serialisation must land in the conformance corpora and pass in both
   the TypeScript runtime and `engines/kotlin`. If a change makes the Kotlin
   engine infeasible, that is an ADR, not a shrug.
6. **Architecture decisions go in `docs/adr/`.** ADR-003 is normative for
   serialisation. New ADRs are numbered in sequence; items below that need one
   say so.
7. **Update `docs/CAPABILITIES.md` in the same PR.** The point of that file is
   that it is the single claim. A PR that ships a capability and leaves the
   capability map stale reintroduces exactly the drift it was written to end.
8. **Determinism is not negotiable for anything in the execution plane.** Same
   inputs, same artifact version, byte-identical output and trace. Model
   scoring, feature reads and interaction-history queries all have to be
   snapshot-able for replay. Design for that first, not after.

**Commands** (from `docs/GETTING_STARTED.md`; add to it if you add a suite):

```bash
npm test                 # unit + integration (402 tests)
npm run test:e2e         # Playwright, from the root (added 2026-09-06)
npm run bench            # latency gate
npm run typecheck        # root config then the console's (added 2026-09-06)
npm run lint
node scripts/validate-spec.mjs          # 34 paths, 41 operations, 46 schemas
npm run generate && git diff --exit-code packages/client/src/generated.ts
npm run corpus  && git diff --exit-code docs/conformance/
cd engines/kotlin && ./gradlew test      # the second engine, same corpora
```

The last three are not optional for anything touching the spec or decision
semantics: they are how spec drift, client drift and corpus drift are caught,
and each has caught a real one.

---

## 1. Item index

Gate 1 finishes the Foundation MVP. Gates 2–3 are the platform. Stages are
sequential; items within a stage can be parallel unless *Depends* says
otherwise.

| ID | Stage | Item | Gate |
|---|---|---|---|
| W-000 | 0 | CI check: only the capability map claims BUILT | 1 |
| W-001 | 0 | Fix the holes in the checks themselves | 1 |
| W-002 | 7 | Export / re-import | 1 |
| W-003 | 8 | S1 benchmark and the p99 gate | 1 |
| W-004 | 8 | No-network-egress assertion in the decision path | 1 |
| W-005 | 9 | Catalogue, policies and taxonomy into PostgreSQL | 2 |
| W-006 | 9 | Retention and erasure design | 2 |
| W-007 | 9 | Configurable approved default for a missing score | 2 |
| W-008 | 10 | Customer profile store and data model | 2 |
| W-009 | 10 | Online feature service | 2 |
| W-010 | 10 | Ingestion: batch and stream | 2 |
| W-011 | 11 | Interaction history store | 2 |
| W-012 | 11 | Contact policy, suppression, frequency caps | 2 |
| W-013 | 12 | Consent and preference store | 2 |
| W-014 | 13 | Treatment as a first-class entity | 2 |
| W-015 | 13 | Content library with approval and effective dating | 2 |
| W-016 | 14 | Inbound real-time container | 2 |
| W-017 | 14 | Outbound channel adapter, one channel | 2 |
| W-018 | 14 | Delivery and response telemetry | 2 |
| W-019 | 15 | Batch / offline executor | 2 |
| W-020 | 16 | Distribution and version-diff simulation | 2 |
| W-021 | 16 | Bias gate as a pre-publish blocker | 2 |
| W-022 | 16 | Simulation evidence attached to change sets | 2 |
| W-023 | 16 | Flow unit tests with deterministic fixtures | 2 |
| W-024 | 17 | Writable canvas | 2 |
| W-025 | 17 | Natural-language authoring that compiles to a diff | 2 |
| W-026 | 18 | Eligibility / applicability / suitability layers | 2 |
| W-027 | 18 | Multi-level and channel-specific ranking | 2 |
| W-028 | 18 | Slate selection and optimisation constraints | 2 |
| W-029 | 19 | Model gateway and registry | 2 |
| W-030 | 19 | ONNX and PMML import | 2 |
| W-031 | 19 | Feature attribution in the decision record | 2 |
| W-032 | 20 | Adaptive learning from captured outcomes | 3 |
| W-033 | 20 | Drift, calibration, auto-quarantine | 3 |
| W-034 | 20 | Champion/challenger and model shadow scoring | 3 |
| W-035 | 21 | Segments and audience builder | 3 |
| W-036 | 21 | Journey orchestration | 3 |
| W-037 | 21 | Experiments, holdouts, incrementality | 3 |
| W-038 | 22 | Package system and manifests | 3 |
| W-039 | 22 | Authoring SDK and generated package docs | 3 |
| W-040 | 22 | Industry and regulatory packs with change reports | 3 |
| W-041 | 23 | Theming, layout manifests, pluggable panels | 3 |
| W-042 | 23 | i18n mechanism | 3 |
| W-043 | 24 | Identity and access: SSO, SCIM, ABAC | 3 |
| W-044 | 24 | Artefact signing and SBOM | 3 |
| W-045 | 24 | Degradation ladder | 3 |
| W-046 | 24 | Per-decision cost accounting | 3 |
| W-047 | 24 | Multi-region residency | 3 |
| W-048 | 24 | OpenTelemetry, SLOs, quotas | 3 |
| W-049 | 25 | Evidence packs: AI Act, NIST AI RMF, SR 11-7 | 3 |
| W-050 | 25 | DR: backup, tested restore, chaos | 3 |

---

## Stage 0 — Hygiene, before anything else

### W-000 — Stop any document but the capability map claiming BUILT
Gate 1 · Depends: none

**The original half of this item is already done.** `docs/PHASES_SUMMARY.md`,
579 lines marking Phases 0–4 complete, was deleted on 2026-09-05 in `7330292`.
Four documents still name it, and all four are correct to: two record that it
was deleted, and two are direction-setting documents that supersede it.

The half that remains is the one worth having. `docs/CAPABILITIES.md` exists
because three documents made the same status claim and all three had drifted —
README called the ledger, idempotency and shadow mode unbuilt three stages after
they were built. Nothing stops that happening again.

**Build:** A script over the docs tree, run in CI, that fails when a document
other than `docs/CAPABILITIES.md` asserts a capability is built. Point the two
stale references at the capability map while there.

**Done when:**
- CI fails if any doc but the capability map claims BUILT status.
- Verified to bite: add a "Decision ledger — Built" row to `README.md` and
  confirm the check goes red.

### W-001 — Fix the holes in the checks themselves
Gate 1 · Depends: none

CAPABILITIES.md lists these under "Known holes". They are the highest
return-per-hour work in the repo because each one is a check that appears to run
and does not.

**Build:**
- Make `tsc --build` work, or replace it. `bench/*` must be typechecked.
- Add a route bundle-size check; it is in the definition of done and is checked
  by nothing.
- Add `/decision-flows/[id]` to the axe sweep, which currently scans only the
  list page.
- Reconcile API paths across the four components that must agree: the OpenAPI
  spec, the generated `packages/client`, the console's hand-written client URLs
  and the Kotlin service router. The console's hand-written URLs should go —
  generate them.

**Done when:**
- `npm run typecheck` covers `bench/*` and fails on a deliberate type error there.
- A bundle-size check fails when a route exceeds its budget.
- The axe sweep covers the detail route.
- A single check fails if any of the four components names a path the others do
  not. Verify it bites by renaming one path in the Kotlin router.

---

## Stage 7 — Export / re-import (already committed)

### W-002 — Export / re-import
Gate 1 · Depends: none · Spec §9, §14

The headline differentiator and the least evidenced. Provable exitability means
a customer can take everything out and stand it up elsewhere, and that this is
tested rather than asserted.

**Build:** `packages/portability` — full-tenant export of catalogue, policies,
flows and all versions, decision ledger, audit log, approvals and change sets,
in a documented, versioned, self-describing format. Re-import into an empty
instance.

**Done when:**
- A round-trip conformance utility exports a populated tenant, imports it into a
  clean instance, and asserts: every version hash identical, every ledger record
  identical, and a replay of a pre-export decision on the post-import instance
  produces a byte-identical result and record.
- Export format is versioned and has its own schema; an export from an older
  format version either imports or fails loudly, never partially.
- A test asserts export completeness by diffing the export manifest against the
  set of persisted entity types, so a new entity type added later fails this
  test until it is included. This is the guard that stops export rotting.

---

## Stage 8 — Performance proof (already committed)

### W-003 — S1 benchmark and the p99 gate
Gate 1 · Depends: W-008, W-011 for realistic profile and history · Spec §10

The harness scales candidate sets, not profiles. The S1 claim is 1M profiles,
100 actions, 1k and 2k decisions per second.

**Build:** Dataset generator producing 1M profiles with realistic skew and 24
months of interaction history, reproducible from a seed. Harness variants: warm,
cold, 1% / 5% / 20% feature-store miss, degraded provider.

**Done when:**
- The gate is `p99 < 50 ms`, not p95. CAPABILITIES.md notes the PDF states the
  promise as p99 and that it already passes; make the gate say so.
- Every published result carries workload, data distribution, code version,
  cache state and confidence intervals. Enforce this in the report generator so
  a number cannot be emitted without its context.
- Throughput stays measured and ungated, with the reason recorded in the report
  rather than in tribal memory.

### W-004 — No-network-egress assertion in the decision path
Gate 1 · Depends: none · Spec §13

"No LLM dependency" is met in fact and guarded by nothing. This is a cheap test
and a strong artifact in a technical evaluation.

**Done when:** A test executes a representative decision with outbound network
blocked at the process level and asserts success; and separately asserts that
the decision path makes zero outbound connections other than to configured
storage. Verify it bites by adding a `fetch` to a node implementation.

---

## Stage 9 — Storage completion and the erasure decision

### W-005 — Catalogue, policies and taxonomy into PostgreSQL
Gate 2 · Depends: none · Spec §8

Currently an in-memory store with process lifetime. This is a correctness
problem, not tidiness: a restart loses authored state.

**Done when:** The existing registry pattern is reused — one behaviour suite run
against memory and a real PostgreSQL, so the rules are known to be
storage-independent. Append-only where the entity is versioned.

### W-006 — Retention and erasure design
Gate 2 · Depends: W-005 · Spec §8, §11 · **Needs an ADR**

Append-only storage plus a right to erasure is a genuine conflict and the answer
is a design decision, most likely crypto-shredding of per-subject keys so the
ledger stays append-only while the plaintext becomes unrecoverable. Decide it
now. Retrofitting erasure across ledger, interaction history, records and
training sets after they are populated is the single most expensive thing on
this list.

**Done when:**
- An ADR records the mechanism and its consequences for replay: a replay of an
  erased subject's decision must fail explicitly and legibly, never silently
  return something wrong.
- A test erases a subject and asserts the subject is unrecoverable from every
  store, and that the append-only triggers are still intact.
- Retention policy is configurable per tenant and enforced by a job with its own
  test.

### W-007 — Configurable approved default for a missing score
Gate 2 · Depends: none · Spec §6

The engine uses a neutral 1.0 under exponentiation, which is correct arithmetic
but not the configurable approved default the spec asks for.

**Done when:** The default is part of the versioned flow, appears in the
decision record, and a test asserts that changing it changes the outcome and the
recorded reason. Both engines agree.

---

## Stage 10 — The data layer

### W-008 — Customer profile store and data model
Gate 2 · Depends: W-005 · Spec §8

**Build:** Versioned, tenant-scoped profile schema with generated migrations.
The schema is later pack-supplied (W-040); build the versioning now so packs
have something to plug into.

**Done when:** Profile schema versions are immutable and bound to a hash, like
flow versions. A decision records which profile schema version it read against.

### W-009 — Online feature service
Gate 2 · Depends: W-008 · Spec §8

**Build:** Declared feature definitions with TTL. Every feature read into a
decision carries `{value, source_system, computed_at, version}`.

**Done when:**
- Replay is exact: the decision record contains the input snapshot, and replay
  reads the snapshot, never the live store. Test this by mutating the live store
  between decision and replay and asserting the replay is unchanged. This is the
  test that keeps the determinism claim true once real data exists.
- A miss is explicit in the record, not an implicit default.
- Freshness is recorded per field.

### W-010 — Ingestion: batch and stream
Gate 2 · Depends: W-008, W-009 · Spec §8

**Build:** File and warehouse batch load; a stream consumer. Declarative,
replayable pipelines with lineage.

**Done when:** A pipeline run is replayable and produces identical store state.
Lineage from a feature value back to its ingest run is queryable and tested.

**Not in this stage:** identity resolution and profile stitching. Record it in
`docs/gaps.md` as a known limit — single source of identity for now.

---

## Stage 11 — Interaction history

### W-011 — Interaction history store
Gate 2 · Depends: W-008 · Spec §8

Append-only, per-customer, with fast recency queries: last N impressions, last
outcome per action, contact counts per channel per window. Everything in W-012
is blocked on this being fast, and it is designed for billions of rows.

**Done when:**
- Recency queries have their own latency gate, inside the decision budget.
- The store is exercised at S1 scale in the harness (W-003), not at fixture scale.
- Reads into a decision are snapshotted like features, so replay stays exact.
- Erasure (W-006) propagates here and a test asserts it.

### W-012 — Contact policy, suppression, frequency caps
Gate 2 · Depends: W-011 · Spec §6

**Build:** Outcome-conditioned suppression — "suppress action X for 30 days
after 3 impressions with no response". Caps per channel, per period, per issue,
with priority-based override.

**Done when:** Rules are part of the versioned flow. Each suppression emits a
stable reason code, added to the closed set in `deterministic/types.ts`, and the
conformance corpus is extended so `decision-conformance.test.ts` still asserts
every code is exercised. Both engines agree.

---

## Stage 12 — Consent

### W-013 — Consent and preference store
Gate 2 · Depends: W-008 · Spec §6, §11

**Done when:** Missing or withdrawn consent blocks the decision — fail closed,
tested. Consent state and the checks applied appear in the decision record.
A test asserts that an unreachable consent store is an error, never a permissive
fallback, matching the existing rule for unreachable databases.

---

## Stage 13 — Treatments and content

### W-014 — Treatment as a first-class entity
Gate 2 · Depends: W-005 · Spec §3

Today an offer carries the `key` used as the action; the `offer`/`action` split
is PARTIAL and is a modelling change. Do that split here, and add treatment as a
distinct entity below action, with a per-channel schema.

**Done when:** The taxonomy in `CLAUDE.md` is updated, the split is reflected in
the OpenAPI spec, and the conformance corpora are regenerated. Expect every
chain hash to change, as with the vendor-neutral rename — plan for it rather
than being surprised by it.

### W-015 — Content library with approval and effective dating
Gate 2 · Depends: W-014 · Spec §3

**Build:** Asset store with versions, review and approval, `valid_from` /
`valid_to`, expiry, usage tracking. Effective dating is cross-cutting — apply it
to actions, treatments and flows, not just assets.

**Done when:** An expired treatment cannot be selected, and the exclusion has
its own reason code in the record. Approval reuses `/approvals` rather than
growing a second workflow.

---

## Stage 14 — Channels. Without this there is no marketing product.

### W-016 — Inbound real-time container
Gate 2 · Depends: W-014 · Spec §12 adjacent, new §

**Build:** Named placements with slot counts and per-placement policy. An
embeddable SDK in `apps/embed`. Impression capture on render.

**Done when:** Contract-tested like every other operation — in the spec, served,
asserted by `e2e/contract.spec.ts`. Placement config is a versioned artifact.
Impressions land in interaction history and a test asserts the round trip from
render to suppression eligibility.

### W-017 — Outbound channel adapter, one channel
Gate 2 · Depends: W-014 · Spec new §

Build exactly one — email — properly, with the adapter contract designed so the
second is a package (W-038). Resist building five shallow ones.

**Done when:** The adapter contract is typed and documented. Quiet hours,
throttling and retry are configured, versioned and tested. A send failure is
recorded, never swallowed.

### W-018 — Delivery and response telemetry
Gate 2 · Depends: W-016, W-017, W-011 · Spec new §

Impression, click, conversion, bounce, unsubscribe, complaint — all back into
interaction history, joined to the decision that caused them.

**Done when:** Every telemetry event carries the `decision_id` and a test
asserts the join. `POST /outcomes` exists already and stores; this is what makes
it a loop. Unsubscribe writes through to consent (W-013), tested.

---

## Stage 15 — Batch

### W-019 — Batch / offline executor
Gate 2 · Depends: W-011, W-017 · Spec §6

Same compiled artifact, different executor. Millions of decisions, no latency
constraint, volume governance.

**Done when:** A test asserts that batch and request-time execution of the same
artifact over the same snapshot produce identical decisions and records. That
equivalence test is the whole point; without it this is a second engine to keep
in step by hand.

---

## Stage 16 — Simulation. This is what makes the approvals you already built mean something.

### W-020 — Distribution and version-diff simulation
Gate 2 · Depends: W-008, W-011 · Spec §11

**Build:** Run a candidate version over a sampled population and report what
would be offered to whom. Diff two versions on the same population: winners,
losers, unchanged, by segment. Add under-served analysis — customers with no
eligible action.

**Done when:** `/simulations` is served rather than proposed, and the page stops
saying nothing serves it. Simulation over a 1M sample completes inside a stated
budget, gated.

### W-021 — Bias gate as a pre-publish blocker
Gate 2 · Depends: W-020 · Spec §11

**Done when:** Protected-attribute parity is checked before publish; a failing
check refuses the publish server-side with a 403, like `publish:flows`, and the
refusal is recorded in the audit log. An audit that only shows successes cannot
answer whether anyone tried.

### W-022 — Simulation evidence attached to change sets
Gate 2 · Depends: W-020, W-021 · Spec §11

Change sets and approvals exist. Today a reviewer approves a diff with no stated
consequence.

**Done when:** A change set carries diff, simulated impact, bias result and cost
delta, and — for agent-proposed changes — the agent's reasoning. The autonomy
ladder consults them: an L3/L4 auto-approval is refused if simulation or bias
evidence is absent or stale relative to the diff. Test the staleness case.

### W-023 — Flow unit tests with deterministic fixtures
Gate 2 · Depends: none · Spec §11

**Done when:** A flow author can attach test cases to a flow version; they run
in CI; a publish is refused if they fail. This is what makes "business users
change things" safe enough to sell.

---

## Stage 17 — Authoring. The canvas is read-only, so today nobody can build anything in the product.

### W-024 — Writable canvas
Gate 2 · Depends: W-023 · Spec §12 adjacent

Node positions are authored in fixtures. Make layout a persisted part of the
flow artifact, with drag, connect, undo/redo and keyboard-first operation.

**Done when:** A flow authored entirely in the console compiles, publishes and
executes. E2E test covers author → compile → publish → execute → replay through
the UI, extending the existing 6-test integration path. Round-trip fidelity:
canvas → artifact → canvas is lossless, tested.

### W-025 — Natural-language authoring that compiles to a diff
Gate 2 · Depends: W-024, W-022 · Spec §14

"Stop offering the 15% discount to anyone who complained in the last 30 days"
produces a diff to a policy, shown in plain language and in the rule form,
simulated, then approved. Authoring plane only.

**Done when:** The output is always a change set, never a live change. A test
asserts no path exists from this feature to a published version without passing
through `/approvals`. W-004 already guards the runtime; this guards the shape.

---

## Stage 18 — Decision richness

### W-026 — Eligibility / applicability / suitability layers
Gate 2 · Depends: W-005 · Spec §6

Three layers, distinct reason codes, distinct audit lines. Suitability matters
for Consumer Duty style regimes and is the one most often collapsed into
eligibility.

**Done when:** Codes added to the closed set, corpus extended, both engines agree.

### W-027 — Multi-level and channel-specific ranking
Gate 2 · Depends: W-026 · Spec §6

Arbitrate within group, then across groups, with per-level ranking functions.
Same candidate set, different function per channel or placement.

**Done when:** Ranking functions stay typed and versioned with a closed
operation set and no `eval`, per `utility.ts`. Each level's contribution is
visible in the record.

### W-028 — Slate selection and optimisation constraints
Gate 2 · Depends: W-027 · Spec §6

The engine returns a single action. Real placements have N slots. Add
cardinality, mutual exclusion, diversity, budget, inventory and fairness.

**Done when:** Slate selection is deterministic under ties, tested to 100 runs
like the single-action path. The record explains slate composition, not just the
winner. Latency gate holds at S1 with slates.

---

## Stage 19 — Intelligence, part one

### W-029 — Model gateway and registry
Gate 2 · Depends: W-009 · Spec §7

Adapter interface `score(features) -> {score, confidence, attributions}`.
Registry with lineage and version pinning.

**Done when:** Model version is pinned into the artifact at compile time and
recorded in the decision. Replay reads the snapshotted score, not a live model —
the same rule as features. A provider that is unreachable is an error or a
declared degradation (W-045), never a silent zero.

### W-030 — ONNX and PMML import
Gate 2 · Depends: W-029 · Spec §7

Matters more than it sounds. Enterprises have models already and will not
rebuild them.

**Done when:** An imported model scores in the decision path inside the latency
budget, and a test asserts identical scores across the TypeScript and Kotlin
engines for a corpus of inputs. If that is infeasible for a format, record the
limit rather than quietly running one engine.

### W-031 — Feature attribution in the decision record
Gate 2 · Depends: W-029 · Spec §7

**Done when:** Top drivers per scored candidate appear in the record and in the
regulator and analyst renderings, not only in a report.

---

## Stage 20 — Intelligence, part two

### W-032 — Adaptive learning from captured outcomes
Gate 3 · Depends: W-018, W-029 · Spec §7

Outcome capture is built and nothing consumes it. Online learning per action,
treatment and channel, with binning, importance and cold-start handling.

**Done when:** Determinism survives. The rule is that a model *version* is
frozen and pinned; learning produces a new version. A test asserts that replay
of an old decision uses the old model version and is byte-identical after the
model has learned. Without this test, adaptive learning silently breaks the
central claim.

### W-033 — Drift, calibration, auto-quarantine
Gate 3 · Depends: W-032 · Spec §7

**Done when:** A degraded model is quarantined automatically and the fallback
path is recorded in affected decisions. Quarantine is an audited event.

### W-034 — Champion/challenger and model shadow scoring
Gate 3 · Depends: W-032 · Spec §7

Distinct from flow-version shadow mode, which is built — reuse the comparison
machinery in `packages/runtime/src/shadow` rather than writing a second one.

**Done when:** Traffic split is deterministic per subject, significance testing
is implemented, and auto-promote is subject to the autonomy ladder.

---

## Stage 21 — Campaign layer

### W-035 — Segments and audience builder
Gate 3 · Depends: W-008, W-011

**Done when:** A segment is a versioned artifact, compiles like a flow, and its
population is reproducible from a snapshot.

### W-036 — Journey orchestration
Gate 3 · Depends: W-017, W-035

Waits, branches, triggers, exits, re-entry rules.

**Done when:** Journey state is persisted and replayable; a journey run can be
reconstructed decision by decision. Same canvas metaphor as flows (W-024).

### W-037 — Experiments, holdouts, incrementality
Gate 3 · Depends: W-018, W-035

**Done when:** Assignment is deterministic per subject and recorded in the
decision. A holdout is honoured by suppression and appears as its own reason
code. Incrementality is computed from the ledger, not from a separate pipeline.

---

## Stage 22 — Composability

### W-038 — Package system and manifests
Gate 3 · Depends: W-017, W-029 · Spec §14

Build this *after* there are real capabilities to package. Kinds: node, channel,
model-provider, connector, industry-pack, regulatory-pack, ui-panel, theme,
agent.

**Done when:** Manifest schema, dependency resolution with version conflict
detection, signing, install/upgrade/rollback with zero downtime. A second
channel — not email — ships purely as a package with no core changes, and a test
asserts the core has no reference to it.

### W-039 — Authoring SDK and generated package docs
Gate 3 · Depends: W-038

**Done when:** The gate is behavioural: an external developer, given only the
docs, ships a working node package in under a day. Approximate it in CI with a
scaffold-and-build test that uses only published artifacts and no repo-internal
imports.

### W-040 — Industry and regulatory packs with change reports
Gate 3 · Depends: W-038, W-020

**Done when:** Installing a pack upgrade produces a change report naming which
flows and which decisions would now behave differently, computed by running
W-020's version diff. That report is the product; the pack content is the
delivery mechanism.

---

## Stage 23 — Experience layer

### W-041 — Theming, layout manifests, pluggable panels
Gate 3 · Depends: W-038

Semantic tokens; light/dark × density × accessibility as orthogonal axes.
Layouts declared as versioned manifests. Panels declare slot, data contract and
permissions. Composition only — no arbitrary code into the runtime.

**Done when:** A tenant re-skins the console with a theme package and zero code,
tested. Axe passes on every route in every accessibility mode, extending the
sweep fixed in W-001. Consult the `frontend-design` skill for visual execution.

### W-042 — i18n mechanism
Gate 3 · Depends: none

There is no mechanism and every string is inline in JSX. It gets worse every
sprint; do it before Stage 23 grows the surface.

**Done when:** A lint rule fails on a new inline user-facing string.

---

## Stage 24 — Enterprise readiness

### W-043 — SSO, SCIM, ABAC
Gate 3 · Spec §11 · Depends: none
Extend the existing permission model to per-issue and per-group scoping. Keep
refusals server-side with a 403, as `publish:flows` and `promote:flows` already
are.

### W-044 — Artefact signing and SBOM
Gate 3 · Spec §11 · Depends: W-038
Versions are already bound to an artifact hash; add signature verification on
publish and on package install.

### W-045 — Degradation ladder
Gate 3 · Spec §10 · Depends: W-009, W-029
Full decision → cached decision → default action → static fallback. Never a
timeout to the channel. **Done when:** each rung is chaos-tested, the rung used
is recorded in the decision, and a test asserts no path returns a timeout.

### W-046 — Per-decision cost accounting
Gate 3 · Spec §10 · Depends: W-029
Compute, model serving, egress, authoring-plane inference amortised. **Done
when:** the number is emitted per decision and aggregated, so the cost
transparency claim is measured rather than modelled.

### W-047 — Multi-region residency
Gate 3 · Depends: W-006
Tenant-pinned data; local compute, feature store and ledger. **Done when:** a
test asserts a tenant's data cannot be read from outside its region.

### W-048 — OpenTelemetry, SLOs, quotas
Gate 3 · Spec §9
Traces, metrics, logs. Rate limits and per-tenant quotas. **Done when:** a trace
spans console → API → engine → storage and carries the `decision_id`.

---

## Stage 25 — Assurance

### W-049 — Evidence packs
Gate 3 · Spec §11 · Depends: W-021, W-031, W-033
NIST AI RMF and EU AI Act evidence packs; SR 11-7 model documentation generated
from the model registry. **Done when:** generated from live system state, not
maintained by hand, and regenerating produces a diff when the system changes.

### W-050 — DR: backup, tested restore, chaos
Gate 3 · Depends: W-047
RTO and RPO targets, a restore that is actually run on a schedule, chaos suite
covering storage loss and provider failure. **Done when:** a restore drill is a
CI-invocable job that asserts a post-restore replay is byte-identical.

---

## 2. Sequencing rationale

If you only read one thing: **build in stage order, and do not start Stage 14
before Stage 11 exists.**

- Stages 0, 7, 8 close the Foundation MVP gate. Two of eight capabilities' worth
  of work remain and both are exit criteria, so finish them before opening new
  fronts.
- Stages 9–12 are the data layer. Everything downstream is blocked on it and it
  is the worst thing to retrofit. Erasure (W-006) is decided here because
  deciding it later means rewriting every store.
- Stages 13–15 make it a product that can deliver something. Today there is a
  decision API and no way to act on a decision.
- Stage 16 unlocks the approvals workflow that is already built, and makes the
  autonomy ladder mean something rather than being a setting.
- Stage 17 removes the cap at "demo": a read-only canvas means the product
  cannot be used to build anything.
- Stages 18–20 are the intelligence. Deliberately after delivery and simulation,
  because a smarter score with no channel and no measurement is worth nothing.
- Stages 22–23 are the composability and experience moat, built once there are
  real capabilities to package.
- Stages 24–25 are what a regulated buyer requires. Start Stage 25 earlier than
  feels comfortable; the SOC 2 observation window is calendar time you cannot
  compress.

## 3. Definition of done, per item

Reuse the existing project definition. Every item ships with:

1. OpenAPI path before UI, and `packages/client` regenerated.
2. A named check that fails when the capability breaks, verified to bite.
3. Both engines in agreement if it touches decision semantics.
4. A contribution to the decision record if it affects a decision.
5. Latency coverage if it touches the hot path.
6. An audit event for every state change.
7. A tenant isolation test.
8. Accessibility check if it has UI.
9. A rollback path.
10. `docs/CAPABILITIES.md` updated in the same PR, with the evidence column
    naming the check.
