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
| W-000 | 0 | CI check: only the capability map claims BUILT — **done** | 1 |
| W-001 | 0 | Fix the holes in the checks themselves — **done** | 1 |
| W-002 | 7 | Export / re-import — **done** | 1 |
| W-003 | 8 | S1 benchmark and the p99 gate — **done, bounded** | 1 |
| W-004 | 8 | No-network-egress assertion in the decision path — **done** | 1 |
| W-005 | 9 | Catalogue, policies and taxonomy into PostgreSQL — **half done** | 2 |
| W-006 | 9 | Retention and erasure design — **ADR awaiting decision** | 2 |
| W-007 | 9 | Configurable approved default for a missing score — **done** | 2 |
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
| W-023 | 16 | Flow unit tests with deterministic fixtures — **done** | 2 |
| W-024 | 17 | Writable canvas | 2 |
| W-025 | 17 | Natural-language authoring that compiles to a diff | 2 |
| W-026 | 18 | Eligibility / relevance / suitability layers | 2 |
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
| W-042 | 23 | i18n mechanism — **ADR awaiting decision** | 3 |
| W-043 | 24 | Identity and access: SSO, SCIM, ABAC | 3 |
| W-044 | 24 | Artefact signing and SBOM | 3 |
| W-045 | 24 | Degradation ladder | 3 |
| W-046 | 24 | Per-decision cost accounting | 3 |
| W-047 | 24 | Multi-region residency | 3 |
| W-048 | 24 | OpenTelemetry, SLOs, quotas | 3 |
| W-049 | 25 | Evidence packs: AI Act, NIST AI RMF, SR 11-7 | 3 |
| W-050 | 25 | DR: backup, tested restore, chaos | 3 |
| W-051 | 9 | Secret provider and connector authentication — **ADR awaiting decision** | 2 |
| W-052 | 14 | Container object and the ranked-slate contract — **done** | 2 |

---

## Stage 0 — Hygiene, before anything else

### W-000 — Stop any document but the capability map claiming BUILT — **DONE 2026-09-06**
Gate 1 · Depends: none

**Closed.** `tests/docs-status.test.ts` fails when any markdown outside the
three declared status documents carries a table row asserting something is
built. Verified to bite with a "Decision ledger | Built" row in README. The two
remaining references to the deleted `PHASES_SUMMARY.md` now point at the
capability map.

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

### W-001 — Fix the holes in the checks themselves — **DONE 2026-09-06**
Gate 1 · Depends: none

**Closed**, all four, each verified by breaking what it guards:

- `tsconfig.typecheck.json` replaces `tsc --build`, covering every package, its
  tests, bench and scripts. The root cause was `moduleResolution: "node"`,
  which cannot resolve subpath exports; `packages/runtime` and
  `packages/compiler` now declare real `exports` maps. It found three real
  errors on its first run.
- `npm run test:bundle` measures what a browser downloads from the standalone
  build, against `bundle-budgets.json`. It shipped once measuring 0 kB on every
  route — `content-length` is absent on chunked responses — which is why it now
  fails a zero measurement rather than passing it.
- `/decision-flows/[id]` and `/decisions/[id]` joined the axe sweep.
- `tests/api-paths.test.ts` reconciles the spec, the console's client and the
  Kotlin service's declared routes.

One part deliberately not done: the console's hand-written client URLs are
checked against the spec but not generated from it. That is a 33-call-site
refactor and belongs in its own change.


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

### W-002 — Export / re-import — **DONE 2026-09-06**
Gate 1 · Depends: none · Spec §9, §14

**Closed.** `packages/portability`, 21 tests. All three "done when" bullets are
met, each verified by breaking what it guards:

- Round trip: export a populated tenant, import into an empty instance,
  re-export byte-identically. Version hashes, ledger records and environment
  state — including a shadow mid-migration — all survive, and a pre-export
  decision replayed on the imported instance produces the same chain hash.
  Verified: an import that drops `shadowVersion` fails both the byte-identical
  assertion and the explicit one.
- Format versioned, with refusal rather than partial import. A bundle from a
  newer major is refused and nothing lands; a newer patch of the same major is
  accepted. Row tampering fails the file hash, and a manifest edited to match
  still fails the bundle hash.
- Completeness guarded against the migrations rather than a maintained list.
  Verified: adding a table fails the suite until somebody records what the
  export does with it.

`npm run export -- --tenant <id> --out <dir>` writes one readable JSON file per
entity plus a manifest; `--verify <dir>` checks a bundle and exits non-zero.

**Bounded, and the bound is the interesting part.** It exports what is durably
stored: the registry and the ledger. The catalogue, policies, approvals and
audit log still live in the console's in-memory store, so there is nothing
durable to export — that is W-005, not a gap in the exporter. `GET /export`
and `POST /import` were deliberately not added for the same reason: an HTTP
export today would serve the dev fixtures, which would be a worse claim than
no endpoint.


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

### W-003 — S1 benchmark and the p99 gate — **DONE 2026-09-06**, with a stated bound
Gate 1 · Depends: W-008, W-011 for realistic profile and history · Spec §10

**Closed as far as it can honestly go, and the dependency was the reason to
split it rather than wait.** W-008 and W-011 are Gate 2; blocking Gate 1 on
them would have held the whole gate for variants that measure storage this
engine does not yet have.

Done:

- The gate is **p99 < 50 ms**, the promise the specification states. Verified
  by setting a budget the engine cannot meet.
- S1 runs at full scale — 1,000,000 seeded profiles, 100 active actions, cold
  and warm — via `npm run bench:s1`. Measured p99 6.8 ms cold, 3.6 ms warm.
- Every result carries workload, data distribution, infrastructure, code
  version, model latency, cache state and a confidence interval on the mean,
  computed from the full sample rather than from the percentiles. The fields
  are mandatory on the type and asserted individually; verified by dropping one.
- Throughput stays measured and ungated, with the reason in the artifact rather
  than in tribal memory.

Not done, and named in `bench/results/S1.json` rather than left to silence:
feature-store miss rates need a feature service (W-009); a degraded provider
needs the gateway inside the measured path (W-010); and sustained 1k/2k per
second is a service-level claim that a single-threaded harness cannot make.


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

### W-004 — No-network-egress assertion in the decision path — **DONE 2026-09-06**
Gate 1 · Depends: none · Spec §13

**Closed.** `packages/runtime/tests/no-egress.test.ts` blocks fetch, http,
https, net, `Socket.prototype.connect`, and dns at the process level, then
decides and replays successfully with zero attempts recorded. A fourth
assertion checks the blocker still intercepts, so the other three cannot pass
by measuring nothing.

Verified to bite: a `fetch` planted at the top of `execute` fails three of the
four tests.

The boundary is stated in the file rather than implied: the deterministic core
reaches nothing, while integration resolution deliberately sits outside it —
connectors are read before the core runs and their output is hashed into the
input snapshot, which is what lets a decision be reproducible and still read
live data.


"No LLM dependency" is met in fact and guarded by nothing. This is a cheap test
and a strong artifact in a technical evaluation.

**Done when:** A test executes a representative decision with outbound network
blocked at the process level and asserts success; and separately asserts that
the decision path makes zero outbound connections other than to configured
storage. Verify it bites by adding a `fetch` to a node implementation.

---

## Stage 9 — Storage completion and the erasure decision

### W-005 — Catalogue, policies and taxonomy into PostgreSQL — **HALF DONE 2026-09-06**
Gate 2 · Depends: none · Spec §8

**Done:** `packages/catalogue` — 40 tests, one behaviour suite over memory and a
real PostgreSQL, foreign keys, a unique offer key per tenant, RESTRICT rather
than CASCADE on creatives, and an append-only edit log by trigger. The export
carries all nine tables and the round trip asserts the catalogue survives.

**Not done:** the console still writes to its in-memory store, so authored state
is still lost on restart there.

**And it is not a swap.** The console deep-clones the fixtures while the engine
reads the fixture modules directly, so today a ranking-weight change persists,
is audited, and changes no decision — registered in `gaps.md`. Repointing means
deciding what the engine reads, and since a decision records the hash of the
catalogue it saw, that hash cannot become a moving target mid-flight. The
likely shape is a snapshot per decision, cached by hash. That is a decision to
make, not a refactor to perform.


Currently an in-memory store with process lifetime. This is a correctness
problem, not tidiness: a restart loses authored state.

**Done when:** The existing registry pattern is reused — one behaviour suite run
against memory and a real PostgreSQL, so the rules are known to be
storage-independent. Append-only where the entity is versioned.

### W-006 — Retention and erasure design — **ADR WRITTEN 2026-09-06, awaiting a decision**
Gate 2 · Depends: W-005 · Spec §8, §11 · **Needs an ADR**

[ADR-004](adr/ADR-004-retention-and-erasure.md) proposes crypto-shredding with
a per-subject key: rows stay, chain hashes stay valid, the append-only triggers
are never bypassed, and destroying the key makes the plaintext unrecoverable.
It states the consequence that matters most — a replay of an erased subject
fails *explicitly*, naming the erasure, rather than returning a decision
computed from nulls or an indistinguishable "could not reproduce".

It is marked **Proposed, not Accepted**, deliberately. It commits the platform
to infrastructure it cannot run without and has legal consequences; that is a
product and legal call rather than an engineering one, and it should be taken
before W-008 begins rather than after four stores hold production data.

The implementation bullets in this item — the erasure test, the retention job —
remain open and are blocked on that decision, not on code.


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

### W-051 — Secret provider and connector authentication — **ADR WRITTEN 2026-09-07, awaiting a decision**
Gate 2 · Depends: none · Spec §8, §11 · **Needs an ADR** — written

[ADR-007](adr/ADR-007-secrets-and-connector-authentication.md) proposes that
configuration holds a credential *reference* and never a value, resolved at
fetch time through a `SecretProvider` interface. The argument is the same shape
as ADR-004's: the audit log is append-only and the export leaves the platform,
so a secret written into a connector row is permanent in one and copied by the
other, and neither is undoable after the fact.

Integration resolution runs on the decision path as of 2026-09-07 and sends no
credentials, because there is nowhere to put one. That is the whole of the gap:
connectors work against internal and unauthenticated endpoints and fail against
a real bureau, a CRM or a consent registry.

**Blocks:** any authenticated inbound integration, and W-017 — an outbound email
adapter needs a credential before it can send anything.

**Done when:**
- The ADR is Accepted or replaced.
- `Connector.auth` is in the spec, the client is regenerated, and no schema in
  the spec can carry a credential value.
- A test provisions a secret, drives a connector that uses it, and asserts the
  value appears in no audit entry, no export bundle and no decision record.
- A missing credential fails resolution explicitly and does **not** fall through
  to `onFailure`, with its own test.

### W-007 — Configurable approved default for a missing score — **DONE 2026-09-06**
Gate 2 · Depends: none · Spec §6

**Closed.** A flow declares `missingScoreDefault` — propensity, context, and
the approver with a date. It is carried through the compiler into the artifact,
so the default a decision used is pinned by the artifact hash rather than read
from wherever the catalogue happens to be at replay time.

Every decision records `arbitration.missingScore`: which candidates fell back,
and what default stood in — present even when nothing was missing, so "no
default configured" stays distinguishable from "written by an older engine".

Both engines agree, via two new corpus cases: one where the default is applied
and one where it is declared but unneeded. Verified to bite: an engine ignoring
the declared default fails two unit tests and the decision corpus.


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

**The caps are enforced today and their counts come from the caller.** The
engine reads `request.contactHistory.withinPeriod`, so a website reports how
often it has already shown an offer, and across channels it cannot know. This
item is what makes the platform hold that state instead. It is the reason W-011
is the linchpin of the inbound loop rather than one store among several —
`docs/review/INBOUND_VS_CDH.md` finding I-3.

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

`placement` is a string on the request today, read by the seeded propensity and
written to the record, and by nothing else. Phase B left open whether it should
become an object; `docs/review/INBOUND_VS_CDH.md` (I-5) answers it — the
container is what a client integrates against, so it has to be a configurable
artefact rather than a field. W-052 carries the response contract.

**Done when:** Contract-tested like every other operation — in the spec, served,
asserted by `e2e/contract.spec.ts`. Placement config is a versioned artifact.
Impressions land in interaction history and a test asserts the round trip from
render to suppression eligibility.

### W-052 — Container object and the ranked-slate contract — **DONE 2026-09-07**
Gate 2 · Depends: W-016 · Spec: `listPlacements`, `decidePlacement`

**Done:** `Placement` is a configured object with a slot count and the flow that
answers it; `POST /placements/{tenantId}/{key}/decisions` returns the ranked
slate. `selectSlate` composes from the decision rather than re-deciding — every
candidate that reached ranking is already in the record with its priority — so
no chain hash moved, the Kotlin engine needed no change, and the corpora
regenerated byte-identical. Held to 100-run stability, to `entries[0]` being the
decision's own winner, and to never offering a candidate a gate refused after
scoring; that last one verified to bite. The storefront's grid asks for three
and renders what the platform could fill.

**Deliberately not done here:** *which* N. See W-028, and the limit registered in
`gaps.md` — the placement is not part of the hashed decision, which is bounded
while ordering is the whole rule and is not once composition chooses.

*Original scoping below.*

The engine returns one action; a container answers with a list. The data already
exists — `decision.scores` carries every ranked candidate with its priority and
the record names a `runnerUp` — so what is missing is the contract that returns
them and the rule that composes the slate.

**Why this is here and not at Stage 18.** W-028 puts slate selection behind
multi-level ranking, which is right for the optimisation half: cardinality,
mutual exclusion, diversity, budget, inventory, fairness. The *contract* half
cannot wait that long. The container response is what every client integrates
against, and changing a single-action response into a list after partners have
built on it is a breaking change to the most widely consumed surface in the
platform. Land the shape with the container; land the optimisation later.

See `docs/review/INBOUND_VS_CDH.md` finding I-1.

**Done when:**
- A container returns N candidates in priority order, N from the placement's
  configured slot count, with the same reason codes and the same trace the
  single-action path produces.
- Slate composition is deterministic under ties, tested to 100 runs like the
  single-action path, and identical in both engines.
- The record explains the slate, not just the winner: why each slot holds what
  it holds, and what was refused.
- A slot that cannot be filled is stated as such and never padded.
- The latency gate holds at S1 with slates.

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

### W-023 — Flow unit tests with deterministic fixtures — **DONE 2026-09-06**
Gate 2 · Depends: none · Spec §11

**Closed.** A flow version may attach cases — a request and what should happen:
which offer wins, or that none does, which candidates are ruled out, and on
which reason codes. `registry.publish` runs them and refuses the version if any
fail, recording which ones in the append-only log.

Three decisions worth knowing:

- **The runner is injected, not imported.** The registry depends on the
  compiler and deliberately not on the engine; reversing that so the store
  layer could execute decisions would be the wrong direction.
- **A version that attaches cases and is published with no runner is refused.**
  An optional gate is not a gate — if a caller could skip the tests by omitting
  an argument, the first hurried deploy would.
- **Cases are not part of the artifact hash.** A test does not change how a
  flow decides, so treating one as new content would force a version bump for
  no behavioural change, or refuse to let anyone add a test to a published
  version. Results are stored with the version instead.

Writing the runner's own tests found a real flaw in it: `denied` originally
matched any denial, and the engine records `NOT_RANKED` against every candidate
that reached arbitration and lost — so the assertion was true for almost any
non-winner and could barely fail. It now means *ruled out*, and says so when a
candidate merely lost.


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

### W-026 — Eligibility / relevance / suitability layers
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
Gate 2 · Depends: W-027, W-052 · Spec §6

The engine returns a single action. Real placements have N slots. Add
cardinality, mutual exclusion, diversity, budget, inventory and fairness.

**The contract half moved to W-052**, at Stage 14, with the container. What
remains here is the optimisation: this item is now about *which* N, not about
being able to return N at all.

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

### W-042 — i18n mechanism — **ADR WRITTEN 2026-09-06, awaiting a decision**
Gate 3 · Depends: none

[ADR-005](adr/ADR-005-internationalisation.md) recommends `next-intl`, messages
keyed by surface rather than by English text, reason codes rendered from the
code with a test that every member of the closed set has a message, and the
lint rule this item asks for — with an explicit `untranslated()` marker so the
strings that must *not* be translated (a chain hash, a version, a reason code)
are greppable rather than accidental.

**Not implemented, deliberately.** `CLAUDE.md` lists "any change to the i18n
structure" as needing product and design review before code, and says of this
exact gap: *do not add a new one-off i18n mechanism to satisfy this line; it
needs a decision, not a workaround.* The ADR is written so the decision can be
made.

The ADR also argues this should move earlier than Stage 23: every sprint adds
strings, and Stage 23's third-party panel and theme authors need to know how
their strings reach a catalogue before they write any.


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
