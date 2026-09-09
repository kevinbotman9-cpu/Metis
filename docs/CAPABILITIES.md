# METIS — Capabilities, built and planned

**Last verified:** 2026-09-09, by running the suites named below rather than by
reading the code: `npm run conformance` (24 failures, 2 warnings), the unit
suites, the full Playwright run, 49 accessibility tests, 9 bundle budgets, and
both typechecks and lints. Two rows were corrected the same day after the E4
coherence review drove the console by hand and found them stale — both had
understated the product for two days. The corrections are marked in place.

This is the single answer to "what does METIS actually do today, and what is it
going to do". It replaced three partial answers that had drifted apart: a
component table in `README.md` that still called the decision ledger,
idempotency and shadow mode unbuilt three stages after they were built; an
operation count in `docs/gaps.md` that said 26 built when the spec validator
said 39; and a test-count block in `docs/EXPERIENCE_LAYER_STATUS.md` that
understated the suite by 172 tests. Three documents making the same claim is
three chances to be wrong, so the claim now lives in one place and the others
point here.

**Extended 2026-09-09 by phase E3 of `docs/EVALUATION_BRIEF.md`**, which joined
the codebase survey in `docs/evaluation/TRUTH_AUDIT.md` to the vendor-neutral
taxonomy in `docs/evaluation/CAPABILITY_TAXONOMY.md`. E3 added two columns to
every capability table, a fifth status value, rows for the taxonomy items this
map did not cover, and the counts at the end. It created no second status
document, because that is the drift this file exists to prevent.

## The rule for "Built"

**BUILT** means a test fails when it breaks. Not "the code exists", not "it
works when you try it" — a named, running check that goes red. Anything else is
PARTIAL or PLANNED however much design exists for it, and the evidence column
names the check so the claim can be audited rather than trusted.

| | Meaning |
|---|---|
| **BUILT** | Works, and a test guards it |
| **PARTIAL** | Usable, with a stated limit — the limit is the interesting part |
| **PLANNED** | Committed, with a stage number |
| **ABSENT** | Nothing found, and nobody has committed to it. Distinct from PLANNED, which carries a stage, and from OUT OF SCOPE, which is a decision somebody made |
| **OUT OF SCOPE** | Deliberately not in this gate; §13 gates 2–3 |

### The two columns E3 added

| Column | `YES` only if |
|---|---|
| **Screen?** — operable from screen | You can name the route a person reaches it from |
| **Config?** — configurable without code | Adding a field or changing a rule needs no change under `apps/console/` |

A row that cannot answer them is answered `NO`, not left blank. These are the
two questions previous reviews of this codebase skipped, and they are the two
that decide whether a capability is a product or an inventory item.

They are carried on every table whose rows are capabilities. Four tables do not
carry them because their rows are not capabilities: the two legend tables above,
the §13 exit criteria (which are criteria), *Known holes in the checks
themselves* (which are checks), and *Where the detail lives* (which is an index).

### Reconciling the survey's verdicts

`docs/evaluation/TRUTH_AUDIT.md` uses a survey scale. This map's rule is
stricter and wins. Verdicts were mapped on the way in:

| Survey verdict | Became | Condition |
|---|---|---|
| `BUILT` | BUILT | Only where the check can be named. Otherwise PARTIAL |
| `ENGINE-ONLY` | PARTIAL | With Screen? = NO and the limit stated |
| `SCREEN-ONLY` | PARTIAL | With the mock source named as the limit |
| `SCAFFOLD` | ABSENT | Files existing is not a capability |
| `ABSENT` | ABSENT | — |

## The suites, and what each covers

```
Core                21 passed  - creative content per channel, and the
                                 invariant that an offer needs deliverable
                                 content before it can go active
Integration         25 passed  - author -> compile -> execute -> replay, plus the
                                 API-path reconciliation and source hygiene
                                 checks, which span packages and belong to none
Runtime            228 passed  - determinism, byte-identical replay, integration
                                 resolution over a real HTTP gateway, ADR-003
                                 values, the 22-decision corpus, ranking
                                 functions, slate composition, idempotency,
                                 shadow, no network egress in the decision
                                 path, and the approved default for a missing
                                 score
Compiler            43 passed  - graph validation, version pinning, budgets
Registry            75 passed  - one behaviour suite, run against memory and a
                                 real PostgreSQL
Catalogue           40 passed  - taxonomy, offers, creatives, policies, boosts
                                 and the ranking function; one suite over
                                 memory and a real PostgreSQL
Ledger              50 passed  - the same pattern: one suite, both stores
Portability         22 passed  - export, re-import, round-trip conformance, and
                                 the guard that stops the export rotting
Performance         12 passed  - bench/harness: the p99 gate, and S1 over a
                                 million seeded profiles
Unit (Vitest)      217 passed  - apps/console
E2E (Playwright)   310 passed  - contract, cross-engine, axe, registry, ledger,
                                 idempotency, shadow, the seeded tenant
                                 (25 skipped: writes covered by
                                 permissions-and-writes and registry instead)
Accessibility       49 passed  - axe over every route in both themes, one h1
                                 per route, keyboard operability
Bundle               9 passed  - route budgets against the standalone build
Conformance (JVM)   13 passed  - engines/kotlin; 67 values, 22 decisions,
                                 60 real decisions over HTTP
Typecheck           clean      - root config and the console's, separately
Lint                1 error    - console clean, 0 warnings. Root has one
                                 error: no-control-regex at
                                 tests/source-hygiene.test.ts:126, present
                                 since 660e56f and found 2026-09-09. This
                                 line claimed "0 errors" while it was not
                   ---
                   1000+ tests, two languages, two engines
```

The OpenAPI spec validates at **51 paths, 62 operations (58 built, 4 proposed),
70 schemas**. This line read "36 paths, 43 operations, 48 schemas" until
2026-09-09; it was authored once and never recomputed. Run
`node scripts/validate-spec.mjs` rather than trusting it.

The repository is **38,971 source lines** across 182 tracked files, excluding
tests, the generated client and stories. `apps/console` is 22,381 of them; the
ten packages are 11,602; `engines/kotlin` is 2,075; `planes/execution` is **0**.
Counted in `docs/evaluation/TRUTH_AUDIT.md`.

---

## §3/§4 — Canonical taxonomy

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Vendor-neutral vocabulary in code, API, UI and docs | BUILT | NO | NO | `tests/vocabulary.test.ts` scans tracked source for the eight words the platform was renamed away from, excluding its own list and the docs that have to name them. Verified to bite by Phase A's own experiment: `export type Proposition = Offer` now fails, where it used to pass typecheck, lint and every suite. The retained `arbitration` and `propensity` are deliberately not flagged |
| `offer` / `action` split | PARTIAL | NO | NO | An offer carries the `key` used as the action. Splitting them is a modelling change, not a rename, and has not been done |
| Objective and category as authorable levels | ABSENT | NO | NO | Taxonomy 4.2 `TABLE-STAKES`. `packages/ui-metadata/src/registry/index.ts:60-61` lists both in `PENDING`: *"No authoring surface at all; the taxonomy is fixture-authored."* The two top levels every offer hangs from cannot be created by a user |

The vocabulary was Pega's almost verbatim — proposition, treatment, engagement
policy, contact policy, lever, decision strategy. It is now the catalogue in
`CLAUDE.md`, which retains *arbitration* and *propensity* deliberately because
§3.2 keeps both as industry-standard. Every chain hash in the conformance
corpora changed on that date, because the rename reached the hashed decision.

## §6 — Deterministic execution

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Deterministic engine, byte-identical replay | BUILT | NO | NO | `packages/runtime/tests/determinism.test.ts`; byte-identical across 100 runs. The guard that separates "wrong inputs" from "the engine drifted" is tested too, as of 2026-09-07 — it was not, and disabling it passed every suite |
| Replaying a decision **through the API** | PARTIAL | YES — `/decisions/[id]` | NO | Taxonomy 1.18, 7.11 `FRONTIER`. Seeded decisions replay with no body. Any other decision needs its input handed back, because a record holds `inputSnapshotHash` and never the values — `replayDecision` answers 422 `input_required` rather than the 404 it used to. A caller who let the platform resolve a field cannot reconstruct the snapshot, since connector values are retained nowhere. General replay needs the snapshot stored, which is ADR-004's question. `ledger.spec.ts` asserts all three cases |
| Canonical serialisation, specified not implemented | BUILT | NO | NO | ADR-003 + a 67-case corpus; `conformance.test.ts` and the Kotlin suite both read it |
| Stable reason codes, per candidate | BUILT | YES — `/decisions/[id]` | NO | Taxonomy 14.4 `DIFFERENTIATING`. 8 codes in `deterministic/types.ts:198-215`; `decision-conformance.test.ts` asserts the corpus exercises **every** one, so none ships unverified in a second engine. `NOT_ACTIVE`, `OUT_OF_VALIDITY_WINDOW`, `ELIGIBILITY_FAILED`, `RELEVANCE_FAILED`, `SUITABILITY_FAILED`, `CONSENT_WITHHELD`, `FREQUENCY_CAP_BREACHED`, `NOT_RANKED` |
| Typed, versioned ranking functions | BUILT | YES — `/arbitration` | NO | Taxonomy 7.1, 7.12 `DIFFERENTIATING`. `packages/core/src/utility.ts:27-175`, a closed operation set and no `eval`; `utility.test.ts` proves `multiplicative@1.0.0` reproduces the formula it replaced bit for bit. Term weights are edited from the screen and reach the engine — `configuration reaches the engine` |
| Idempotency — same key and hash returns the original | BUILT | NO | NO | Taxonomy 17.5 `DIFFERENTIATING`. `runtime/tests/idempotency.test.ts`, `e2e/idempotency.spec.ts`. A reused key with a different request is a 409, not a silently stale answer. No screen: this is an API property |
| Durable decision ledger | BUILT | NO | NO | `packages/ledger`, 50 tests against both stores; append-only triggers. **The console does not read it** — it reads the in-process store, so the durability is real and unreached by any screen |
| Outcome capture | BUILT | NO | NO | `POST /outcomes/{tenantId}/{decisionId}`, `e2e/ledger.spec.ts`. Storage only — learning from outcomes is §7. No screen records an outcome |
| Missing score is never a silent zero | BUILT | YES — `/decisions/[id]` | NO | A flow declares a `missingScoreDefault` with its approver and date; the engine applies it, and every decision records which candidates fell back and what default stood in. Both engines agree via two corpus cases. Verified: an engine that ignores the declared default fails two unit tests and the corpus |
| Integration resolution on the decision path | BUILT | YES — `/integrations` | NO | Taxonomy 1.14 `DIFFERENTIATING`. Connectors are fetched before the deterministic core, their values are hashed into the input snapshot, and the fields the caller supplied win. `HttpIntegrationGateway` does the I/O; `packages/runtime/tests/http-gateway.test.ts` drives it against a real HTTP server. Verified to bite: executing on the unresolved request loses the provenance and fails |
| A per-connector latency budget with defined timeout behaviour | BUILT | YES — `/integrations` | NO | Taxonomy 1.15, 17.2 `DIFFERENTIATING`. `packages/runtime/src/integration/{resolve,http-gateway}.ts`; tests `latency budget`, `HttpIntegrationGateway` |
| Replay calls no connector | BUILT | NO | NO | Replay re-executes against the recorded snapshot, and `no-egress.test.ts` asserts `execute` and `replay` open no socket. Wire timings live on the measured half, so a decision cannot depend on whether it was lucky with a cache |
| The engine cannot reach the network at all outside a configured connector | BUILT | NO | NO | Taxonomy 17.12 `FRONTIER`. `packages/runtime/tests/no-egress.test.ts:213` — `fetch` throws `Network blocked` inside the decision path. The taxonomy classes this as frontier; it is here and tested |
| Connector authentication | PLANNED — [ADR-007](adr/ADR-007-secrets-and-connector-authentication.md) | NO | NO | The gateway sends no credentials, because `Connector` has no field for one. A secret in connector configuration is a secret in an append-only audit log and in every export made from it, so the shape needs deciding before the field exists. Integrations therefore work against internal and unauthenticated endpoints and fail against a real bureau. **Proposed, not accepted** |
| Reading a `feature-store` connector | PLANNED — [W-009](BACKLOG.md) | NO | NO | Taxonomy 1.16 `FRONTIER`. No feature service exists. The gateway says so by name rather than attempting a `featurestore://` URL |
| A placement returns a ranked slate | BUILT | YES — `/decisions/[id]` | NO | `POST /placements/{tenantId}/{key}/decisions`. The engine still returns one action; the slate is a *projection* of that decision — every candidate that reached ranking is in the record with its priority — so it moves no chain hash and needs no change in either engine. `slate.test.ts` holds it to the same 100-run stability the engine is held to, and to the property that `entries[0]` is the decision's own winner |
| Placement as a configured object | BUILT | YES — `/decision-flows/[id]` | NO | Taxonomy 11.10 `DIFFERENTIATING`. `Placement` carries the slot count and the flow that answers it, so a website names a slot rather than a flow. **Not** part of the catalogue the engine hashes: a placement governs delivery, not the decision. The consequence is stated in `gaps.md` — a slate is reproducible from its decision *plus* the placement that composed it |
| Slate *composition*: cardinality, mutual exclusion, diversity | OUT OF SCOPE | NO | NO | Taxonomy 7.8 `DIFFERENTIATING`. Ordering by priority is the whole rule today. Budget, inventory and fairness are [W-028](BACKLOG.md), and when they land they have to be part of the hashed decision, because a slate composed by a rule nobody recorded is not explainable |
| Timing captured per decision | BUILT | YES — `/decisions/[id]` | NO | Taxonomy 17.3 `FRONTIER` in part. `packages/runtime/tests/*` test `hot path cost`; the trace carries `totalMs` and the decision index carries it per record. Per-node attribution of that time is not surfaced |

## §7 — Intelligence

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Model gateway, model registry | OUT OF SCOPE | NO | NO | Taxonomy 8.7, 8.14 `DIFFERENTIATING`. Gate 2. Registered as [W-029](BACKLOG.md) |
| Adaptive learning, contextual bandits, drift, calibration | OUT OF SCOPE | NO | NO | Taxonomy 8.3, 8.4, 8.5, 8.11, 9.13 — Gate 2–3 |
| Model shadow scoring | OUT OF SCOPE | NO | NO | Taxonomy 8.6 `DIFFERENTIATING`. Distinct from flow-version shadow mode, which is built — see §12 |
| `score-model` node type | ABSENT | NO | NO | Taxonomy 8.1 `TABLE-STAKES`. The node type exists and produces a propensity of `0.05 + seededUnitInterval(customerId, offerKey, modelKey) * 0.9`, now in `packages/runtime/src/scoring/index.ts` rather than inline in the engine. That is still arithmetic over a hash, and moving it changed nothing about what it is — the seam is built, the model is not. Files existing is not a capability |
| The trace declaring the propensity is not a model | BUILT | YES — `/decisions/[id]` | NO | `engine.ts:519-524` — the trace reads *"a pinned deterministic function, not a trained model (W-029)"*. The comment above it records why: the sentence used to read like a real model had scored, and nobody had written a false claim — a pinned model id made one anyway |
| `score-adaptive` is refused for new flows | BUILT | NO | NO | [ADR-009](adr/ADR-009-the-model-plane.md) §7 puts adaptive scoring out of scope for v1. The compiler answers `DEPRECATED_NODE_TYPE` and names `score-model`; `packages/compiler/tests/compile.test.ts` › `refuses a score-adaptive node, and says what to use instead`. **Deprecated, not deleted:** a corpus case recorded 2026-09-05 carries the type inside its hashed eliminations, so the runtime still executes it and that decision replays unchanged. [G-012](gaps.md) |
| Scoring resolved before the deterministic core | BUILT | NO | NO | [ADR-009](adr/ADR-009-the-model-plane.md) §2 phase one. `packages/runtime/src/scoring/` holds the propensity scorer and `resolveScores`; `execute` takes the result. The arithmetic did not change — every hash in all four corpora regenerates byte-identical, and the Kotlin engine still agrees. `packages/runtime/tests/scoring.test.ts` › `produces an identical decision either way`. The seam matters more than the move: a scorer declaring `pure: false` is **refused inside the core** with `ScoresNotResolved` rather than run, so when a model gateway lands a caller that has not been updated fails loudly instead of silently getting a seeded number |
| `Model` as a user-editable entity | ABSENT | NO | NO | `packages/ui-metadata/src/registry/index.ts:65`: *"Gate 2. No schema, no screen."* |

Propensity today is a seeded, deterministic function. That is what makes the
corpus reproducible, and it is also why nothing here claims to learn.

**One reference is misfiled.** `engine.ts:522` and
`apps/console/mocks/fixtures/artifacts.ts:147` both point a reader to W-029.
W-029 is registered in [`BACKLOG.md`](BACKLOG.md), not in
[`gaps.md`](gaps.md), which is where `CLAUDE.md` tells a blocked agent to look.

## §8 — Storage

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| PostgreSQL for the registry | BUILT | NO | NO | One behaviour suite against memory and a real database, so the rules are known to be storage-independent |
| PostgreSQL for the decision ledger | BUILT | NO | NO | Same pattern, `packages/ledger` |
| Append-only enforced at the schema | BUILT | NO | NO | Triggers reject `UPDATE` and `DELETE` on versions, events and records — the application refusing is not enough |
| A configured database that cannot be reached | BUILT | NO | NO | An error, never a silent fallback to storage that forgets |
| Retention and erasure | PLANNED — [W-006](BACKLOG.md) | NO | NO | Taxonomy 2.7, 2.12 `TABLE-STAKES`. [ADR-004](adr/ADR-004-retention-and-erasure.md) proposes crypto-shredding per subject, so the ledger stays append-only while the plaintext becomes unrecoverable. **Proposed, not accepted** — it carries real operational cost and legal consequences, and needs a product decision before W-008 begins. Nothing implements it |
| Catalogue, policies and taxonomy in PostgreSQL | PARTIAL | NO | NO | `packages/catalogue` is built and durable — one behaviour suite over memory and a real database, foreign keys, a unique offer key, and an append-only edit log enforced by trigger. The console has not been repointed at it yet, so authored state is still lost on restart there. [W-005](BACKLOG.md) |
| Any store reachable from a screen | PARTIAL | NO | NO | The **only** non-test caller of `createRegistryStore`, `createLedgerStore` or `createCatalogueStore` is `packages/portability/src/cli.ts:17-19`. Three stores with migrations, dual implementations and passing suites are reachable today by a CLI and by nothing a person can click |
| Redis, ClickHouse, event broker, object storage, online feature service | OUT OF SCOPE | NO | NO | Gate 2–3. All three are declared in `docker-compose.yml` and connected to no code; that file's header comment says so |

## §9 — Contracts and portability

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| OpenAPI 3.1 as the source of truth | BUILT | NO | NO | Taxonomy 16.11 `DIFFERENTIATING`. `packages/client` is generated; the console compiles against it, so spec drift is a compile error |
| A content library, across offers | BUILT | YES — `/creatives` | NO | Taxonomy 5.13, 5.19 `TABLE-STAKES` / `DIFFERENTIATING`. `/creatives` lists every creative with the line its channel leads with, the offer that owns it, its placement and shape, and whether it is delivering. Search covers the copy, not only the name. Editing from there writes through the same dialog. `creatives.spec.ts`, plus the axe sweep and a route budget |
| Authoring an offer and its content **from the console** | BUILT | YES — `/offers`, `/offers/[id]` | NO | Taxonomy 4.1 `TABLE-STAKES`. `New offer`, `Edit`, `Add creative` and the creative's own `Edit` open Radix dialogs and write through the generated client. Activation is a control on the detail page, beside the creatives, because that is where the reason it can be refused is visible. `offer-authoring.spec.ts` drives the whole path as a person does — create, be refused, add content, activate — plus axe on both dialogs |
| Server refusals land on the field they are about | BUILT | YES — `/offers/[id]` | NO | Taxonomy 5.2 `TABLE-STAKES`. The 400 from `createCreative` carries `problems[]`, each naming a field; `ApiError` carries them and the form renders each against its own input, with `aria-invalid` and `aria-describedby`. Asserted on the 160-character and sender-id rules at once |
| Authoring a creative through the API | PARTIAL | YES — `/offers/[id]` | NO | Taxonomy 5.1 `TABLE-STAKES`. `createCreative` and `updateCreative` are served, permission-gated, audited and validated per channel. A field is required only where its absence breaks delivery; a call to action is required in *pairs*; a web creative names both the slot it is for and the shape it takes there, the second from a closed set of six. Plus the 160-character SMS segment limit, a carrier-legal sender id, and an address that is an address. Every problem reported at once. **Not built:** uploading an asset. `imageUrl` is a reference the caller supplies and nothing stores or serves the file. Approval, effective dating and expiry are [W-015](BACKLOG.md) |
| The creative form is declared, not hand-built | BUILT | YES — `/offers/[id]` | **YES** | Taxonomy 16.1 `FRONTIER`. `packages/ui-metadata/src/registry/creative.ts`; tests `every descriptor matches its OpenAPI schema`, `the declared creative form @screen-only`. Adding a field touches the descriptor and the OpenAPI spec and **nothing under `apps/console/`** |
| The offer form is declared, not hand-built | BUILT | YES — `/offers/[id]` | **YES** | Taxonomy 16.1 `FRONTIER`. `packages/ui-metadata/src/registry/offer.ts`, same tests. Two of the fourteen entities in `USER_EDITABLE_ENTITIES` have a descriptor |
| An offer cannot go active with nothing to deliver | BUILT | YES — `/offers/[id]` | NO | Taxonomy 4.12 `DIFFERENTIATING`. `domain.ts` said "at least one is required to go active" and enforced it nowhere, so an offer could be active, win a decision and render nothing. Now refused at creation, at activation, and when switching off the last active creative of an active offer. `permissions-and-writes.spec.ts`; verified to bite by disabling each guard |
| Authoring an offer, and having it decided | BUILT | YES — `/offers/[id]`, `/decision-flows/[id]` | NO | Taxonomy 4.1 `TABLE-STAKES`. `createOffer` and `updateOffer` are served, permission-gated server-side, audited, and covered by `permissions-and-writes.spec.ts`. `createOffer` was **declared built and served by nothing** until 2026-09-07. The offer then becomes decidable: candidate sets are edited on the flow page, and `flow-authoring.test.ts` walks the whole chain — create the offer, give it a creative, add it to the candidate set, publish, promote, decide. The compiler refused its first attempt with `NO_DELIVERABLE_CREATIVE`, so the test walks the real path rather than routing around the gate. **Corrected 2026-09-09:** this row read "an offer created this way cannot be decided (W-005, W-024)" for two days after `gaps.md` recorded both closed on 2026-09-07 |
| Every exempted operation names the suite that covers it | BUILT | NO | NO | The contract suite's exemption list was a bare set of ids and hid the defect above. It now maps each id to a spec file that must carry a matching `covers:` marker, and the check excludes its own file so it cannot pass on itself. Verified to bite twice |
| Contract tested in both directions | BUILT | NO | NO | The compiler catches spec→console; `e2e/contract.spec.ts` asserts every non-proposed operation is served and returns what the spec declares. Verified to bite by pointing a spec path at an unserved route |
| **Export / re-import** | **BUILT** | NO | NO | Taxonomy 15.14 `DIFFERENTIATING`. `packages/portability`. A populated tenant exports, imports into an empty instance and re-exports byte-identically; version hashes, ledger records and environment state including a running shadow all survive; and a pre-export decision replayed on the imported instance produces the same chain hash. `npm run export -- --tenant <id> --out <dir>`. **CLI only — no screen exports or installs anything** |
| Export completeness does not rot | BUILT | NO | NO | `completeness.test.ts` reads the migrations and requires every table to be exported or excluded with a written reason. Verified: adding a table fails the suite until somebody decides what the export does with it |
| Export covers the catalogue and its authoring history | BUILT | NO | NO | Nine catalogue tables travel in the bundle, and the round trip asserts what the engine decides *from* comes back with what it decided |
| Export covers approvals and the audit log | PARTIAL | NO | NO | Both are still in the console's in-memory store, so there is nothing durable to export |
| Bulk import of a catalogue with per-row failures | PARTIAL | NO | NO | Taxonomy 4.8 `TABLE-STAKES`. `packages/portability/src/import.ts` round-trips a whole tenant, and `packages/core/src/intake.ts:321-407` validates rows and reports problems per row for data sources. Neither is a catalogue import a person can start from a screen |
| AsyncAPI, CloudEvents, OpenTelemetry | OUT OF SCOPE | NO | NO | Gate 2–3 |

## §10 — Performance

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Latency gate in CI | BUILT | NO | NO | `bench/harness/tests/gate.test.ts`, gating **p99 < 50 ms** — the promise the specification actually states. Verified: a budget the engine cannot meet fails it |
| **S1 benchmark** — 1M profiles, 100 actions | **BUILT** | NO | NO | `npm run bench:s1` over 1,000,000 seeded profiles and 100 active actions, cold and warm. Measured p99 **6.8 ms cold, 3.6 ms warm** against the 50 ms budget. `bench/results/S1.json` |
| S1's remaining variants — feature-store miss, degraded provider, sustained 1k/2k per second | PARTIAL | NO | NO | Named in the result with the reason each is absent, rather than left to be inferred from silence. The first two need a feature service and the gateway in the measured path ([W-009](BACKLOG.md), [W-010](BACKLOG.md)); the third needs a deployed service, since this harness is single-threaded and measures per-core capacity |
| Publishing workload, data distribution, infrastructure, code version, model latency, cache state and confidence intervals | BUILT | NO | NO | Mandatory fields on the report type, asserted field by field in `s1.test.ts`. Verified: dropping one fails the suite |
| Route bundle budgets | BUILT | NO | NO | `apps/console/tests/bundle`; nine budgets measured against the standalone build |
| A running system observed at all — latency distribution, throughput, error rate, log lag | ABSENT | NO | NO | Taxonomy 17.1, 17.4, 17.10 `TABLE-STAKES` / `DIFFERENTIATING`. The bench measures a process offline. There is no metrics endpoint, no health check beyond `docker-compose.yml`'s, and no operator screen |

Throughput is measured and deliberately **not** gated: it swung 3x under machine
load, and an ignored gate is worse than none. The number is published on every
S1 variant, so a real collapse is still visible.

## §11 — Governance

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Immutable audit log | BUILT | YES — `/audit` | NO | Taxonomy 15.7 `TABLE-STAKES`. Every write lands in it; `/audit` is filterable by actor type. Tests `the log does not observe itself`, `does not record reads of itself` — reads do not record, which is why the log stays legible |
| Segregation of duties | BUILT | YES — `/approvals` | NO | Taxonomy 15.11 `TABLE-STAKES`. `publish:flows` and `promote:flows` are separate permissions, refused server-side with a 403, not merely hidden in the UI. Tests `role-based access`, `registry permissions`, `setting a shadow needs promote:flows` |
| Publishing runs the version's own tests | BUILT | YES — `/decision-flows/[id]` | NO | A flow version may attach cases; `registry.publish` runs them through an injected runner and refuses the publish if any fail, recording which. A version attaching cases with no runner supplied is refused too — an optional gate is not a gate. `packages/runtime/src/flow-tests` |
| Publishing compiles first | BUILT | YES — `/decision-flows/[id]` | NO | Taxonomy 7.9 `TABLE-STAKES`. A flow that does not compile never enters the registry, and the refusal is recorded — an audit that only shows successes cannot answer whether anyone tried. `the compilation gate` |
| Versions immutable, bound to an artifact hash | BUILT | YES — `/decision-flows` | NO | Taxonomy 15.9 `DIFFERENTIATING`. Same content republished is a no-op; different content under the same version is refused. `version resolution` |
| Promotion between environments, and rollback | BUILT | YES — `/decision-flows/[id]` | NO | Taxonomy 15.5, 15.6 `TABLE-STAKES` / `DIFFERENTIATING`. `promotion and rollback`, `an edit reaches decisions only through publish and promote` |
| Change sets and approvals | BUILT | YES — `/approvals`, `/approvals/[id]` | NO | Taxonomy 15.1, 15.2 `TABLE-STAKES`. Agent vs person provenance, diff applied on approval. `writes persist` |
| Agentic autonomy ladder L0–L4 | BUILT | YES — `/agentic` | NO | Taxonomy 15.12 `DIFFERENTIATING`. Per-scope guardrails, resolved autonomy shown on each offer. `AUTONOMY_LEVELS`, `resolveAutonomy` |
| Consent as a decision input, enforced with a service exemption | BUILT | YES — `/decisions/[id]` | NO | Taxonomy 2.2 `TABLE-STAKES`. `packages/runtime/src/deterministic/engine.ts:287, 425-460`; `types.ts:151` carries marketing, profiling and third-party as purposes. Test `suppresses everything when marketing consent is withheld`. Withheld marketing consent removes commercial offers and **not** duty-of-care ones, which is the part most products get wrong. **The limit:** consent arrives on the request. Nothing stores it, ages it, or proves what it said at that instant |
| A flow that omits the consent constraint decides without consent | ABSENT | NO | NO | Registered in [`gaps.md`](gaps.md) — *"a flow can ignore consent and nothing says so"*, 2026-09-07. Enforcement is per-flow authoring discipline, not a platform guarantee |
| A second approver for changes touching regulated rules | ABSENT | NO | NO | Taxonomy 6.10, 15.4 `DIFFERENTIATING`. Change sets have one approval path for everything |
| ABAC, artefact signing, SBOM, NIST AI RMF / EU AI Act evidence packs | OUT OF SCOPE | NO | NO | Gate 2–3 |

## §12 — Migration

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Shadow mode — a version beside the active one, deciding nothing | BUILT | YES — `/decision-flows/[id]` | NO | Taxonomy 13.10 `DIFFERENTIATING`. `packages/runtime/src/shadow`, `e2e/shadow.spec.ts` — nine tests. Verified to bite: pointing the shadow at the active version makes everything agree and the divergence assertion fails |
| Candidate / rank / reason comparison | BUILT | YES — `/decision-flows/[id]` | NO | Three questions, not one boolean — two versions can pick the same offer for opposite reasons, and a migration that changes *why* without changing *what* is the case a regulator asks about |
| Agreement rate that cannot flatter | BUILT | YES — `/decision-flows/[id]` | NO | Zero comparisons reports 0%, never 100%; the panel shows "—" until there is something behind it |
| Pega migration factory | OUT OF SCOPE | NO | NO | Gate 3 |

## §13 — The Foundation MVP gate

The eight named capabilities:

| | Status | Screen? | Config? |
|---|---|---|---|
| Canonical taxonomy | BUILT | NO | NO |
| Open contracts | BUILT | NO | NO |
| Versioned catalogue / policy AST | BUILT | YES — `/targeting-policies` | NO |
| Deterministic runtime | BUILT | NO | NO |
| Decision ledger | BUILT | YES — `/decisions` | NO |
| Replay | BUILT | YES — `/decisions/[id]` | NO |
| Idempotency | BUILT | NO | NO |
| Shadow mode | BUILT | YES — `/decision-flows/[id]` | NO |

The four exit criteria — criteria, not capabilities, so the two columns do not
apply:

| | Status |
|---|---|
| Semantic tests pass | **Met** — three corpora, two languages, two engines |
| Complete export / re-import | **Met for everything durably stored.** The round-trip conformance utility passes on the registry and the ledger. The catalogue, policies and approvals are still in memory, so they are outside the export until they are outside memory — [W-005](BACKLOG.md) |
| S1 benchmark | **Met at the scale the engine can be held to.** 1M profiles, 100 actions, p99 6.8 ms cold against 50 ms, published with its context. The load variants that need a feature store, a gateway or a deployed service are named in the result as unmeasured |
| No LLM dependency | **Met, and guarded.** `no-egress.test.ts` blocks fetch, http, https, net, socket and dns at the process level, then decides and replays successfully with zero attempts. Verified: a `fetch` planted in the engine fails it |

**All eight capabilities are built, and all four exit criteria are met — two of
them bounded, and the bounds are stated above rather than buried: the export
covers what is durably stored, and S1 covers what a single-process engine
benchmark can honestly claim.** Three of the eight are reachable from no screen.

## §14 — Differentiators

| | Status | Screen? | Config? |
|---|---|---|---|
| Executable transparency | BUILT — every decision replays byte-identically and names its versions | YES — `/decisions/[id]` | NO |
| Deterministic governance | BUILT — publish/promote separated, immutable versions, append-only audit | YES — `/approvals` | NO |
| Cloud and runtime neutrality | PARTIAL — two independent engines (TypeScript, Kotlin) agree on a shared corpus, which is the substance of the claim; deployment neutrality is untested | NO | NO |
| Coexistence-led migration | PARTIAL — shadow mode is built; the migration factory is not | YES — `/decision-flows/[id]` | NO |
| **Provable exitability** | **BUILT, and bounded.** A tenant round-trips byte-identically and a decision replayed after the move produces the same chain hash. Bounded because it covers what is persisted, which today is the registry and the ledger | NO | NO |
| Replaceable intelligence | OUT OF SCOPE — gate 2 | NO | NO |

---

## Targeting, arbitration and the catalogue

Added by E3. These were exercised by tests and operated by routes before this
map had rows for them.

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| The three qualification tiers as separately named policy kinds | BUILT | YES — `/targeting-policies` | NO | Taxonomy 6.1, 6.2, 6.3 `TABLE-STAKES` / `DIFFERENTIATING`. `packages/core/src/domain.ts:225` — `PolicyKind = 'eligibility' \| 'relevance' \| 'suitability'`. Each has its own denial reason in the trace. The distinction is modelled rather than collapsed into one filter |
| Targeting policies authored from the screen, scoped, and reaching decisions | BUILT | YES — `/targeting-policies` | NO | Tests `authoring a policy`, `creating a policy`, `editing a policy`. [`gaps.md`](gaps.md) records this closing on 2026-09-07: *"a created offer is decidable, and a created policy runs"* |
| A policy attached to nothing, and a scope pointing at a deleted object | BUILT | YES — `/targeting-policies` | NO | Taxonomy 6.11, 3.11 `TABLE-STAKES`. Tests `a policy nobody attached`, `dangling policy scopes` |
| The targeting policy form is hand-built | PARTIAL | YES — `/targeting-policies` | NO | Taxonomy 16.1 `FRONTIER`. `packages/ui-metadata/src/registry/index.ts:63`: *"Hand-built in components/policy-form-dialog.tsx."* Adding a field to the entity that decides who gets what requires a change under `apps/console/` — the condition Rule 8 exists to prevent |
| Rules validated against the profile schema at authoring time | BUILT | YES — `/targeting-policies` | NO | Taxonomy 1.11 `TABLE-STAKES`. `packages/core/src/profile-schema.ts:262-386, 443-477`; operators are constrained by field type and a bad path gets a spelling suggestion. Test `policy conditions against the data model` |
| A profile schema as a first-class object — entities, relationships, typed fields with sensitivity, declared aggregations | PARTIAL | YES — `/data-model` | NO | Taxonomy 1.9, 1.20 `TABLE-STAKES` / `DIFFERENTIATING`. `packages/core/src/profile-schema.ts:62-160`; test `the schema itself`. **The limit:** the screen is read-only — `getProfileSchema` is the only call — so a computed attribute can be seen and not defined. Sensitivity is `none \| personal \| special_category` and nothing enforces it |
| Aggregations over history resolved at decision time | BUILT | YES — `/data-model` | NO | `packages/runtime/src/integration/aggregate.ts`, `resolve.ts:180-310`; tests `usage becomes decision input`, `merging into the input` |
| Data source intake: define, map, transform, validate, activate | BUILT | YES — `/data-model/intake` | NO | Taxonomy 1.1, 1.13 `TABLE-STAKES`. `packages/core/src/intake.ts:37-426`; tests `mapping a row`, `transforms`, `the validation report`, `activation`. Per-row problems are reported, not a single rejection |
| A frequency & suppression policy with cap, period and scope, enforced at a constraint node | BUILT | YES — `/frequency-policy` | NO | Taxonomy 12.1, 12.2, 12.3 `TABLE-STAKES`. `packages/core/src/domain.ts:274-300`, `engine.ts:425-470`; tests `what a cap must be`, `precedence and determinism`. A scope-specific cap can raise the global one, and the trace names the first breached cap in catalogue order |
| Changing the frequency & suppression policy | PARTIAL | YES — `/frequency-policy` | NO | Taxonomy 12.1 `TABLE-STAKES`. `packages/ui-metadata/src/registry/index.ts:64`: *"Read-only screen today; no write endpoint is served."* The engine enforces a policy nobody can change without editing a fixture |
| Business boosts as a multiplicative weight with an effective window | BUILT | YES — `/arbitration` | NO | Taxonomy 4.11, 7.3 `DIFFERENTIATING`. `effectiveBoost` is evaluated against the decision's own timestamp, so a boost expires without anyone remembering. `the ranking function` |
| An offer's validity window enforced by the engine | BUILT | YES — `/offers/[id]` | NO | Taxonomy 4.4 `TABLE-STAKES`. `OUT_OF_VALIDITY_WINDOW`; test `the window comes from the decision, not the clock`. Evaluated against the decision timestamp, which is what makes replay work |
| Volume constraints — a finite inventory with per-period usage | PARTIAL | NO | NO | Taxonomy 4.7 `DIFFERENTIATING`. `packages/core/src/volume.ts:31-181`; tests `what a cap must be`, `resolveVolume`. **No screen and no route reads or writes a constraint.** Survey verdict ENGINE-ONLY |
| Flow test cases run against a catalogue snapshot | PARTIAL | NO | NO | Taxonomy 13.8 `FRONTIER`. `packages/runtime/src/flow-tests/index.ts:30-147`; test `running a flow author`. **No route runs these** — a tester cannot reach them from a screen. Survey verdict ENGINE-ONLY |
| A simulation that does not touch live decisions or the interaction log | BUILT | YES — `/simulations` | NO | Taxonomy 13.5 `TABLE-STAKES`. `getCounterfactual` compares a pending change set against what is live; test `the two gaps close`. Ad-hoc simulation is a proposed operation nothing serves, and the page says so rather than rendering an empty panel |
| Searching a large catalogue | PARTIAL | YES — `/offers` | NO | Taxonomy 4.9 `TABLE-STAKES`. A virtualised grid with faceted search over 251 offers; tests `smart search`, `virtualised decision grid`. The taxonomy's bar is tens of thousands, which has not been measured |

## Experiments and measurement

Added by E3.

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Experiments with arms, shares and a holdout | BUILT | YES — `/experiments` | NO | Taxonomy 9.1 `TABLE-STAKES`. `packages/core/src/experiment.ts:38-211`; tests `what an experiment must be`, `creates a holdout as a draft, assigning nobody yet` |
| Assignment as a pure function, recorded nowhere | BUILT | YES — `/experiments` | NO | Taxonomy 9.20 `TABLE-STAKES` — inverted. `experiment.ts:88-148`; test `assignment is a function, not a record`. Deterministic bucketing means no assignment table can drift, **and** means there is no assignment record to export for independent analysis |
| A started split frozen against edits, with the refusal explained | BUILT | YES — `/experiments` | NO | Taxonomy 9.3 `DIFFERENTIATING`. `experiment.ts:187-205`; tests `a running experiment is frozen`, `explains why a started split cannot be changed` |
| An arm reachable from a targeting policy at a declared field path | BUILT | YES — `/experiments`, `/targeting-policies` | NO | Taxonomy 9.2 `DIFFERENTIATING`. `experiment.ts:78`; tests `arms as decision input`, `refuses a key that would collide at the same field path`. This is the join that makes an experiment change a decision rather than only a message |
| The arm recorded as part of what was decided | BUILT | YES — `/decisions/[id]` | NO | Test `an arm is part of what was decided` |
| Performance broken down by arm | BUILT | YES — `/experiments` | NO | `packages/ledger/src/performance.ts:109-215`; test `performance by arm`. Counting only |
| A permanent holdout read as incremental value | PARTIAL | YES — `/experiments` | NO | Taxonomy 9.9, 14.11 `TABLE-STAKES`. The mechanism to hold a group out exists. **Nothing computes lift against it** |
| Statistical inference of any kind | ABSENT | NO | NO | Taxonomy 9.5, 9.6, 9.7, 9.8, 9.11 `DIFFERENTIATING` / `TABLE-STAKES`. Searched `significan`, `p-value`, `confidence`, `bayes`, `sequential`, `CUPED`, `power`, `sample ratio`. The platform can split traffic, assign arms deterministically and count outcomes per arm. It cannot say whether a difference is real |

## Reporting

Added by E3.

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| A performance report over real decision records | BUILT | YES — `/performance` | NO | Taxonomy 14.1 `TABLE-STAKES`. `packages/ledger/src/performance.ts:37-215`; tests `report`, `the report reaches real outcomes`, `performance by arm`. Built from the corpus at request time, not a precomputed table |
| Outcomes produced, joined to their decision, and reported — for web | BUILT | YES — `/storefront/index.html`, `/performance` | NO | Taxonomy 11.8 `TABLE-STAKES` in part. [ADR-008](adr/ADR-008-closing-the-outcome-loop.md) phase one. The storefront reports `impression` when a slot renders an offer and `click` when someone clicks it, bound by decision id and nothing else. `outcome-loop.spec.ts` is `@screen-only`: it opens the storefront as a visitor, clicks as a customer, then opens `/performance` as a marketer and reads a real rate. **The limits, all deliberate:** web only — nothing is sent, queued or bounced, so this does not prove outbound and [W-017](BACKLOG.md) stays open; `impression` and `click` only, because an acceptance is a business event this storefront does not model; and the decision behind the rate cannot be opened, which is a defect in the trace route registered in [`gaps.md`](gaps.md) rather than a property of the loop |
| The report refusing to state what it cannot know | BUILT | YES — `/performance` | NO | Taxonomy 14.22 `FRONTIER`. `performance.ts:11` and `apps/console/app/performance/page.tsx:307` both say it in the product's own words: *"Counting only: attribution and uplift are statistical…"*. Tests `what the numbers refuse to say`, `absent is not zero` enforce the refusal, so the honesty cannot quietly lapse |
| A searchable decision grid over the whole corpus, reporting the real total | BUILT | YES — `/decisions` | NO | Taxonomy 14.1, 14.2 `TABLE-STAKES`. Tests `virtualised decision grid`, `summary strip`, `reports the real decision total, not the page size`. 10,400 records |
| Every displayed decision reaching its own trace, and the trace re-executing | BUILT | YES — `/decisions/[id]` | NO | Taxonomy 14.3 `FRONTIER`. Tests `decision search and trace`, `the decision ledger`. This is the one place the taxonomy's hardest reporting item — click a number, reach the records — is genuinely answered |
| The seeded corpus reports its own outcomes | BUILT | YES — `/performance` | NO | Taxonomy 14.1, 14.12 `TABLE-STAKES`. [ADR-008](adr/ADR-008-closing-the-outcome-loop.md) phase two. `apps/console/mocks/fixtures/outcomes.ts` derives impressions, clicks, acceptances, rejections and conversions from the same seed as the decisions, as a projection rather than ledger rows — the ledger refuses an outcome whose decision it cannot find, and putting 10,400 seeded decisions in it costs the 13.1-second import the two-tier index exists to avoid. `/performance` now reads **2,101 measured of 3,425 offered** and says so: *"1,324 of 3,425 offers have no outcome recorded. The rates below describe the 2,101 that do."* `tests/unit/seeded-outcomes.test.ts` holds the shape over all 10,400 — the funnel nests on every decision, coverage stays between 45% and 80%, web reports more than an outbound call, value appears on conversions and nowhere else, and the churn cohort converts materially worse |
| An offer with reach and no takers, findable | BUILT | YES — `/performance` | NO | `acq_sim_30` wins 619 decisions and is accepted by almost nobody: 135 offered on push, 85 seen, 27% clicked, **0% accepted**, and the same on every other channel. Chosen rather than emergent, because "somewhere in 240 offers there is probably a bad one" is not a demo. `outcome-loop.spec.ts` asserts it is on the screen |
| Outcomes survive a restart | BUILT | NO | NO | [ADR-008](adr/ADR-008-closing-the-outcome-loop.md) phase three. `apps/console/mocks/store.ts` resolves its ledger through `createLedgerStore()`, so `METIS_DATABASE_URL` puts decisions and outcomes in PostgreSQL and its absence keeps them in memory. Both satisfy `LedgerStore` and both pass `packages/ledger`'s one behaviour suite, so this is a deployment choice rather than a behavioural one. `tests/unit/ledger-durability.test.ts` holds the selection: the default is the lossy one and says so, and **a configured database that cannot be reached is an error, never a quiet downgrade** — the failure mode where the console starts, looks healthy, and loses every decision it records. No screen shows which store is in use; it is a startup line |
| A synthetic number says so, wherever it goes | BUILT | YES — `/performance`, `/decisions`, `/decisions/[id]` | NO | Taxonomy 14.3 `FRONTIER` in part. The seeded tenant became indistinguishable from real reporting on 2026-09-09 — 10,400 decisions, 2,101 measured outcomes, plausible rates, realised value in pounds — and the only marker was an untested badge in the nav rail, which a screenshot of the report does not include. Now: a `Provenance` schema in the spec, carried on the decision search, the trace, the outcomes list and the performance report; a banner rendered **above the figures in the content column** on all three screens; and the marker inside both export payloads as the first key. `tests/unit/provenance.test.ts` holds all three routes out of the building — API, export, screenshot — including that the banner is on each named screen and is **not** in the app shell, because that is where it failed before |
| A live decision’s trace opens | BUILT | YES — `/decisions/[id]` | NO | `GET /decisions/{id}/trace` returned the runtime `DecisionRecord` for a ledger decision where the spec declares the flat API one, so every decision the storefront made answered 200 with a body the page threw on. `toApiTrace` is now the one projection both branches use. `contract.spec.ts` gained the branch it had never reached — it makes a decision, opens its trace, and asserts `decision` is not a key. Verified to bite. [G-020](gaps.md) |
| Exporting a decision record as evidence | BUILT | YES — `/decisions/[id]` | NO | Taxonomy 9.20 `TABLE-STAKES` in part. `Export JSON` writes the whole record — chain hash, artifact version, eliminations, scores, arbitration formula — to a file named `decision-<id>-<date>.json`. `evidence-export.spec.ts` reads the file off disk and asserts the chain hash in it is the one on screen, because an export that opens a dialog and writes nothing is the defect this replaced. The regulator-ready PDF pack is [W-053](gaps.md) and its control is disabled with that reason |
| Exporting a compiled flow | BUILT | YES — `/decision-flows/[id]` | NO | `Export DIR` writes nodes, edges, candidate keys, pinned package versions, the artifact hash and the cost manifest. Disabled with a reason on a flow that did not compile, because a graph without an artifact cannot be run and should not be handed over under that name |
| Value stated in money from a named field | BUILT | YES — `/performance` | NO | Taxonomy 14.12 `TABLE-STAKES`. Expected margin, not a click count standing in for revenue |
| Breaking a number down by placement, objective, category or audience | PARTIAL | YES — `/performance` | NO | Taxonomy 14.2 `TABLE-STAKES`. Offer, channel, flow and arm are supported. The other four dimensions are not |
| Attribution of any kind | ABSENT | NO | NO | Taxonomy 14.7, 14.8, 14.9, 14.10 `TABLE-STAKES` / `DIFFERENTIATING`. `attribution` appears twice in the repository and both are disclaimers saying it is not done. Searched `first touch`, `last touch`, `time decay`, `shapley`, `incremental`, `uplift` |
| Streaming decision records to a warehouse | ABSENT | NO | NO | Taxonomy 14.13 `TABLE-STAKES`. `packages/portability` exports a tenant's configuration, which is a different thing from an event stream |

## Inbound traffic and channels

Added by E3.

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| A decision API answering for a customer in a named placement | BUILT | NO | NO | Taxonomy 11.1 `TABLE-STAKES`. Tests `POST /api/placements/{tenantId}/{key}/decisions`, `GET /api/placements/{tenantId}`. Served by `apps/console/app/api/[...path]/route.ts`; **`planes/execution` contains zero tracked files**, so there is no deployable API plane |
| Five channels modelled end to end in the catalogue and the trace | BUILT | YES — `/creatives` | NO | Taxonomy 11.2 `TABLE-STAKES`. `packages/core/src/domain.ts:101` — email, SMS, web, push, outbound call. Modelled, not delivered |
| Inbound traffic recorded with both payloads, caller attribution and refusals | BUILT | YES — `/integrations/traffic` | NO | `apps/console/mocks/call-log.ts`; tests `the traffic recorder`, `caller attribution`, `body capture`, `inbound traffic`. Registered limit in [`gaps.md`](gaps.md): recorded at the edge, not by the platform |
| Outbound delivery of any kind — a message reaching a person | ABSENT | NO | NO | Taxonomy 11.8, 11.14 `TABLE-STAKES`. Searched `send`, `deliver`, `SMTP`, `provider`, `dispatch`, `queue`, `throttle`, `bounce`. The platform decides what should be delivered and records that it decided. Nothing delivers |

---

## Demo readiness — the seeded tenant

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| A seeded `demo-telco-uk` tenant, reproducible from a fixed seed | BUILT | YES — every route | NO | `apps/console/mocks/fixtures/seed.ts` generates 240 offers and 415 creatives from `seededUnitInterval`, which is sha256 over its arguments — nothing uses `Math.random` or `Date.now`, so the catalogue is byte-identical on every reload and on every machine. `tests/unit/seed.test.ts` holds the shape |
| Real-shaped names, a value distribution that is not flat | BUILT | YES — `/offers` | NO | Names are composed per category — "Unlimited 5G renewal — heavy data user" — from eleven plan families, six fibre tiers and nine segment qualifiers. Expected margin follows a power law: the top fifth holds **79%** of total margin, measured in `seed.test.ts` rather than asserted |
| Named authors, irregular dates over 24 months | BUILT | YES — `/offers` | NO | Ten authors, three of whom can sign in. Offers are authored in bursts — the test fails if the longest quiet stretch is not at least eight times the median gap |
| 10,400 decisions over 24 months, with seasonality and a churn cohort | BUILT | YES — `/decisions` | NO | Every decision is a real execution of `@metis/runtime` over the seeded catalogue. Volume ramps toward the present and peaks before Christmas; the hour-of-day peak is 18:00 and the trough 03:00. One customer in eleven is in a churn cohort, so their decisions suppress on `CONSENT_WITHHELD` rather than being labelled. `tests/unit/decision-index.test.ts` |
| The corpus does not cost thirteen seconds to import | BUILT | NO | NO | Flat rows are generated once by `apps/console/scripts/build-decision-index.mjs` and committed (2.2 MB); a full trace is re-executed from the same seed when one is opened. Import went from 13.1s to 317ms. The committed index and the generator are diffed on every reproducible column |
| Every built screen populated from it | BUILT | YES — every route | NO | `apps/console/tests/e2e/seeded-tenant.spec.ts`, tagged `@screen-only`: the catalogue grid scrolls, the content library has content, the decision history spans two years, a decision opens onto a re-executed cascade, and the performance report covers all 10,400 |
| Three things wrong on purpose | PARTIAL | YES — `/offers`, `/audit` | NO | The spec asks for a drifting model, an offer with a bias warning and an incident. Two are expressible on built screens and are there: an offer held for bias review, findable by typing "bias" into the offers filter; and an incident six days ago, as the four audit entries an incident actually leaves behind. **The drifting model is not**: there is no `Model` or `Drift` schema and no `/models` route — §7 is OUT OF SCOPE, Gate 2. Registered rather than invented |

## The token layer

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| One place colour is decided | BUILT | NO | NO | `app/globals.css` is the only stylesheet; 48 of 59 files consume it through Tailwind utilities and **no file in the console contains a literal colour**. The twelve `rgb(...)` occurrences in app code are all `rgb(var(--token))` on SVG attributes that cannot take a class. A palette change reaches every surface by changing values |
| Four theme axes | BUILT | YES — `/settings` | NO | Taxonomy 16.10 `DIFFERENTIATING` in part. light/dark × compact/comfortable, as two independent attributes on `documentElement`. Storybook drives all four; `app-shell.spec.ts` asserts they persist across a reload. An administrator cannot add a theme without a file |
| Contrast is measured, not claimed | BUILT | NO | NO | `scripts/check-contrast.mjs` resolves the token aliases and measures 146 pairs across both themes, including alpha composites and the focus ring. `tests/contrast.test.ts` fails the build on any required pair. Verified to bite: it reproduced the exact ratio the axe sweep reported for the active nav item, 3.91 |
| Every surface clears WCAG 2.2 AA | BUILT | YES — every route | NO | The contrast script on the token layer, plus `accessibility.spec.ts` running axe over every route in **both** themes on what actually renders. 49 tests |
| Navigation generated from a persona manifest joined with the routes that exist | BUILT | YES — every route | NO | Taxonomy 16.2 `DIFFERENTIATING`. `apps/console/lib/nav/{build-nav,persona-manifest,routes.generated}.ts`; tests `buildNav`, `the real manifest against the real routes`, `navigation rail @screen-only`. Screens that do not exist cannot appear; groups a persona lacks are hidden rather than disabled |
| Layout manifests — screens declared rather than coded | ABSENT | NO | NO | Taxonomy 16.1 `FRONTIER`. `packages/ui-metadata/src/registry/index.ts:70`: *"Layout manifests do not exist yet."* This is the largest block of the standing conformance failures: `/`, `/performance`, `/settings`, `/simulations`, `/targeting-policies` and others each fail `[layout-manifests]` |

## Screen configurability

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| A form descriptor registry with a generic renderer, diffed against the OpenAPI schema | BUILT | YES — `/offers/[id]`, `/creatives` | **YES** | Taxonomy 16.1 `FRONTIER`. `packages/ui-metadata/src/registry/index.ts:16-80`; tests `every descriptor matches its OpenAPI schema`, `every user-editable entity is accounted for`, `declared forms @screen-only` |
| Two of fourteen user-editable entities actually declared | PARTIAL | YES — `/offers/[id]` | NO | `registry/index.ts:16-19` holds `Offer` and `Creative`; `:35-49` lists fourteen entities; `:59-72` records why each of the other twelve is absent, per entity, with a reason. Rule 8 is enforced for **14%** of the entities it names. A test fails if an entity is in neither list, so the mechanism tracking the debt is better built than the mechanism it tracks |
| Multi-tenancy | PARTIAL | NO | NO | Taxonomy 16.4 `TABLE-STAKES`. `tenantId` throughout `packages/{registry,ledger,catalogue}`; tests `GET /api/placements/{tenantId}`, `a tenant survives being exported and imported`. Present at the data layer; one tenant is served, and no screen creates or switches one |
| A node type package that nothing imports | ABSENT | NO | NO | Registered in [`gaps.md`](gaps.md) — *"`packages/nodes-core` is imported by nothing"*, 2026-09-07. 445 lines of operator metadata wired to nothing |
| Composing a role from named permissions | ABSENT | NO | NO | Taxonomy 16.3 `TABLE-STAKES`. Permissions are named and enforced; the roles that carry them are fixed in code |
| Single sign-on | ABSENT | NO | NO | Taxonomy 16.12 `TABLE-STAKES`. Searched `SSO`, `SAML`, `OIDC` |
| Partner packages, label overrides, per-user column choices, previewing a screen as another role | ABSENT | NO | NO | Taxonomy 16.5, 16.8, 16.9, 16.13 `DIFFERENTIATING` / `TABLE-STAKES` / `FRONTIER` |

## Authoring, which is worth stating plainly

The canvas is **editable**, as of the flow-authoring work on 2026-09-07.
`Edit graph` on a flow opens a node palette — Source, Filter, Constraint, Score,
Switch, Arbitrate — with drag to rearrange, drag from a node edge to connect,
and Delete on a selected edge. Saving changes no decision, and the screen says
so: a version reaches decisions by being published and promoted, never by being
saved. Candidate sets are edited on the same page, which is what makes a
newly-created offer decidable.

**Corrected 2026-09-09.** This section read "The canvas is **read-only**… it
cannot be drafted in the console" for two days after that stopped being true,
and the E3 session carried the sentence forward without checking it. Both stale
claims in this file understated the product, which is the less obvious direction
for a status document to drift and the harder one to catch: nobody re-reads a
row that admits a limitation.

What is still absent around the canvas: creating a flow from nothing has no
API (`New flow` is disabled and says so), and comparing two versions has no diff
view ([W-054](gaps.md)). Ad-hoc simulation is a proposed operation that nothing
serves; `/simulations` says so on the page.

---

## Coverage against the capability taxonomy

Every line item in `docs/evaluation/CAPABILITY_TAXONOMY.md` that no row above
covers. Each is ABSENT, cites its taxonomy id and classification, and answers
both columns `NO`. The searches behind each domain are recorded in
`docs/evaluation/TRUTH_AUDIT.md`; they are not repeated per row.

### 1 — Data, profile and identity

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Declare a tracking plan for inbound events and count violations against it | ABSENT | NO | NO | Taxonomy 1.2 `TABLE-STAKES` |
| Quarantine violating events and replay them after the producer is fixed | ABSENT | NO | NO | Taxonomy 1.3 `DIFFERENTIATING` |
| Look up one customer by any identifier and see the profile the engine sees | ABSENT | NO | NO | Taxonomy 1.4 `TABLE-STAKES`. `/data-model` shows the schema, never a profile |
| Define which identifiers are strong enough to merge two profiles | ABSENT | NO | NO | Taxonomy 1.5 `TABLE-STAKES` |
| View the identity graph for one customer | ABSENT | NO | NO | Taxonomy 1.6 `DIFFERENTIATING` |
| Unmerge two profiles wrongly stitched | ABSENT | NO | NO | Taxonomy 1.7 `FRONTIER` |
| Configure survivorship and see which source supplied each field | ABSENT | NO | NO | Taxonomy 1.8 `DIFFERENTIATING` |
| See when a computed attribute was last recalculated | ABSENT | NO | NO | Taxonomy 1.10 `DIFFERENTIATING` |
| Ingest a profile change as a stream and have a decision read it a second later | ABSENT | NO | NO | Taxonomy 1.12 `TABLE-STAKES` |
| See which flows, policies and models read an attribute before changing it | ABSENT | NO | NO | Taxonomy 1.17 `DIFFERENTIATING` |
| One customer's interaction log — impressions, clicks, acceptances — chronologically | ABSENT | NO | NO | Taxonomy 1.19 `TABLE-STAKES`. The log holds decisions the platform made, not interactions the customer had. No impression, click or delivery event type exists |
| Version a profile schema and run both during a migration | ABSENT | NO | NO | Taxonomy 1.21 `FRONTIER` |
| Profile store totals — how many profiles, how many anonymous, how many touched | ABSENT | NO | NO | Taxonomy 1.22 `TABLE-STAKES` |

### 2 — Consent, preference and privacy

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Record a channel-level preference and honour it within seconds | ABSENT | NO | NO | Taxonomy 2.1 `TABLE-STAKES`. Consent is three purposes, not per channel |
| See which consent record was read for a decision, and what it said then | ABSENT | NO | NO | Taxonomy 2.4 `FRONTIER`. The decision records the value passed in on the request; there is no consent record with its own provenance |
| Ingest consent from an external consent platform as authoritative | ABSENT | NO | NO | Taxonomy 2.5 `TABLE-STAKES` |
| Fail closed when the consent source is unavailable | ABSENT | NO | NO | Taxonomy 2.6 `DIFFERENTIATING`. The demo incident narrates this; nothing implements it |
| Execute a data access request across everything held about one customer | ABSENT | NO | NO | Taxonomy 2.8 `TABLE-STAKES` |
| Restrict an attribute to named purposes so a flow using it otherwise fails to compile | ABSENT | NO | NO | Taxonomy 2.9 `DIFFERENTIATING`. `Sensitivity` is a label on a field and nothing reads it |
| Apply a data residency rule | ABSENT | NO | NO | Taxonomy 2.10 `DIFFERENTIATING` |
| Suppress categories on a vulnerability or age condition, and prove it ran | ABSENT | NO | NO | Taxonomy 2.11 `DIFFERENTIATING` |

### 3 — Audience and segmentation

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Build an audience in a visual editor and see the count before saving | ABSENT | NO | NO | Taxonomy 3.1 `TABLE-STAKES`. `registry/index.ts:66`: *"No schema in the spec and no screen"* |
| Build an audience that qualifies in real time as events stream in | ABSENT | NO | NO | Taxonomy 3.2 `TABLE-STAKES` |
| See the overlap between two audiences | ABSENT | NO | NO | Taxonomy 3.3 `DIFFERENTIATING` |
| Nest one audience inside another, with circularity warned | ABSENT | NO | NO | Taxonomy 3.4 `TABLE-STAKES` |
| See an audience's size history and be alerted when it moves sharply | ABSENT | NO | NO | Taxonomy 3.5 `DIFFERENTIATING` |
| Build a lookalike audience from a seed | ABSENT | NO | NO | Taxonomy 3.6 `DIFFERENTIATING` |
| Hold a random sample out of all activity, permanently | ABSENT | NO | NO | Taxonomy 3.7 `TABLE-STAKES`. An experiment arm holds out of one experiment, not of everything |
| Ask why one named customer did or did not qualify for an audience | ABSENT | NO | NO | Taxonomy 3.8 `DIFFERENTIATING` |
| Define an audience over an account or a household and activate at that level | ABSENT | NO | NO | Taxonomy 3.9 `DIFFERENTIATING` |
| Compose an audience from a warehouse without copying rows | ABSENT | NO | NO | Taxonomy 3.10 `FRONTIER` |
| Schedule an audience to refresh, and see when it last ran | ABSENT | NO | NO | Taxonomy 3.12 `TABLE-STAKES` |

### 4 — Offer and action management

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Define offer attributes of your own without a schema change under version control | ABSENT | NO | NO | Taxonomy 4.2 `TABLE-STAKES`. The descriptor registry removes the console change; the OpenAPI schema change remains |
| Version an offer so two versions are live with independent effective dates | ABSENT | NO | NO | Taxonomy 4.3 `TABLE-STAKES`. Offers carry one validity window and no version |
| Retire an offer and have every flow naming it report the break | ABSENT | NO | NO | Taxonomy 4.5 `DIFFERENTIATING` |
| See, before activating, every placement and flow where an offer becomes decidable | ABSENT | NO | NO | Taxonomy 4.6 `DIFFERENTIATING` |
| Copy an offer with its creatives and targeting | ABSENT | NO | NO | Taxonomy 4.10 `TABLE-STAKES` |
| See every decision an offer took part in, from the offer's own screen | ABSENT | NO | NO | Taxonomy 4.13 `DIFFERENTIATING`. The data exists at `/decisions`; the offer page does not link to it |
| Bundle offers arbitrated as one unit | ABSENT | NO | NO | Taxonomy 4.14 `FRONTIER` |

### 5 — Content, creative and asset governance

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Assemble a creative from reusable blocks that update everywhere on change | ABSENT | NO | NO | Taxonomy 5.3 `TABLE-STAKES` |
| Preview a creative rendered against a named real profile | ABSENT | NO | NO | Taxonomy 5.4 `TABLE-STAKES` |
| Send a proof on the real channel before anything reaches a customer | ABSENT | NO | NO | Taxonomy 5.5 `TABLE-STAKES` |
| Be told at authoring time that a personalisation field does not exist | ABSENT | NO | NO | Taxonomy 5.6 `DIFFERENTIATING`. Policies get this against the schema; creatives do not |
| Require a fallback for every personalisation field | ABSENT | NO | NO | Taxonomy 5.7 `DIFFERENTIATING` |
| Pull content from an external system at send time, with defined failure behaviour | ABSENT | NO | NO | Taxonomy 5.8 `DIFFERENTIATING` |
| Require a creative to pass approval before it can be delivered | ABSENT | NO | NO | Taxonomy 5.9 `TABLE-STAKES`. Change sets approve catalogue edits; nothing approves content as content. [W-015](BACKLOG.md) |
| Check a creative against brand rules automatically | ABSENT | NO | NO | Taxonomy 5.10 `FRONTIER` |
| Attach a mandatory disclosure to a category | ABSENT | NO | NO | Taxonomy 5.11 `DIFFERENTIATING` |
| Set expiry and territorial licensing on an asset and have delivery refuse outside them | ABSENT | NO | NO | Taxonomy 5.12 `DIFFERENTIATING` |
| See every creative and offer using an asset before replacing it | ABSENT | NO | NO | Taxonomy 5.13 `TABLE-STAKES`. There are no assets — `imageUrl` is a reference nothing stores |
| Localise a creative and see which locales are missing or stale | ABSENT | NO | NO | Taxonomy 5.14 `TABLE-STAKES`. Searched `locale`, `i18n`, `translat` — `locale` matches only number formatting. `CLAUDE.md` records the message catalogue as deleted on 2026-09-05 and the gap as needing a decision |
| Draft creative copy from a prompt and a brand profile | ABSENT | NO | NO | Taxonomy 5.15 `DIFFERENTIATING` |
| Generate several variants and put them into a content experiment | ABSENT | NO | NO | Taxonomy 5.16 `DIFFERENTIATING` |
| Version a creative, diff two versions, roll back | ABSENT | NO | NO | Taxonomy 5.17 `TABLE-STAKES`. Versioning exists for artifacts, not for content |
| Check a creative for alt text, contrast and reading level | ABSENT | NO | NO | Taxonomy 5.18 `FRONTIER` |
| See the exact rendered content one customer received | ABSENT | NO | NO | Taxonomy 5.20 `DIFFERENTIATING`. Nothing renders and nothing delivers |
| Author once and adapt to placements of several sizes | ABSENT | NO | NO | Taxonomy 5.21 `DIFFERENTIATING` |
| Withdraw a creative and have in-flight decisions stop selecting it within seconds | ABSENT | NO | NO | Taxonomy 5.22 `DIFFERENTIATING` |

### 6 — Eligibility, relevance and suitability

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| See, for one customer, which offers each tier removed and on which clause | ABSENT | NO | NO | Taxonomy 6.4 `DIFFERENTIATING`. The trace names the tier that removed a candidate; it does not name the clause |
| Attach a policy at objective, category and offer, applied in a defined order | ABSENT | NO | NO | Taxonomy 6.5 `DIFFERENTIATING`. Policies carry a scope; three-level precedence is not modelled |
| Test a policy against a sample and see survivors per clause before publishing | ABSENT | NO | NO | Taxonomy 6.6 `DIFFERENTIATING` |
| Express a rule as a decision table with a stated hit policy | ABSENT | NO | NO | Taxonomy 6.7 `TABLE-STAKES` |
| Call an external service inside an eligibility rule with timeout behaviour | ABSENT | NO | NO | Taxonomy 6.8 `DIFFERENTIATING`. Connectors resolve before the deterministic core, not inside a rule |
| Be prevented from publishing a policy that excludes everybody | ABSENT | NO | NO | Taxonomy 6.9 `DIFFERENTIATING` |
| Express a rule over the interaction log without writing a query | ABSENT | NO | NO | Taxonomy 6.12 `TABLE-STAKES`. Aggregations do this for usage; "has not been offered this in ninety days" has no expression |

### 7 — Arbitration and ranking

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Change a term weight and see the effect on a sample before publishing | ABSENT | NO | NO | Taxonomy 7.2 `DIFFERENTIATING` |
| See the full ranked candidate list for one decision | ABSENT | NO | NO | Taxonomy 7.4 `DIFFERENTIATING` — covered in substance by the slate projection and the trace, but not presented as a ranked list on any screen |
| See which term cost a losing candidate its position | ABSENT | NO | NO | Taxonomy 7.5 `FRONTIER` |
| Guarantee a minimum share of decisions to a strategic objective | ABSENT | NO | NO | Taxonomy 7.6 `DIFFERENTIATING` |
| Arbitrate across objectives in one ranking | ABSENT | NO | NO | Taxonomy 7.7 `DIFFERENTIATING` |

### 8 — Predictive and adaptive models

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Launch an offer with no history and have the platform explore it | ABSENT | NO | NO | Taxonomy 8.2 `DIFFERENTIATING` |
| See a model's performance trend and be alerted when it degrades | ABSENT | NO | NO | Taxonomy 8.4 `TABLE-STAKES` |
| Compare a model's live score distribution with its training distribution | ABSENT | NO | NO | Taxonomy 8.5 `DIFFERENTIATING` |
| Get model inputs and their contributions for one decision | ABSENT | NO | NO | Taxonomy 8.8 `FRONTIER` |
| Test a model for bias before it goes live | ABSENT | NO | NO | Taxonomy 8.9 `DIFFERENTIATING` |
| Block a model on a breached bias threshold | ABSENT | NO | NO | Taxonomy 8.10 `FRONTIER` |
| See how much of a model's learning came from exploration | ABSENT | NO | NO | Taxonomy 8.11 `FRONTIER` |
| Retrain or reset a model from the screen | ABSENT | NO | NO | Taxonomy 8.12 `DIFFERENTIATING` |
| Read a plain statement of what a model predicts and what counts as success | ABSENT | NO | NO | Taxonomy 8.13 `DIFFERENTIATING` |

### 9 — Experimentation and measurement

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Declare guardrail metrics that stop an experiment automatically | ABSENT | NO | NO | Taxonomy 9.4 `DIFFERENTIATING` |
| Look at results at any time without inflating the false positive rate | ABSENT | NO | NO | Taxonomy 9.5 `DIFFERENTIATING` |
| See results corrected for multiple comparisons | ABSENT | NO | NO | Taxonomy 9.6 `DIFFERENTIATING` |
| Reduce required sample size using pre-period data | ABSENT | NO | NO | Taxonomy 9.7 `DIFFERENTIATING` |
| See minimum detectable effect and duration before launching | ABSENT | NO | NO | Taxonomy 9.8 `TABLE-STAKES` |
| Hold a group out of one offer while leaving the rest intact | ABSENT | NO | NO | Taxonomy 9.10 `DIFFERENTIATING` |
| Be warned when assignment was not balanced across arms | ABSENT | NO | NO | Taxonomy 9.11 `DIFFERENTIATING` |
| Segment results after the fact, with pre-registered cuts distinguished | ABSENT | NO | NO | Taxonomy 9.12 `DIFFERENTIATING` |
| Run a bandit that shifts traffic during the experiment | ABSENT | NO | NO | Taxonomy 9.13 `DIFFERENTIATING` |
| See what exploration cost, in the units of the win | ABSENT | NO | NO | Taxonomy 9.14 `FRONTIER` |
| Assign by region and time window rather than customer | ABSENT | NO | NO | Taxonomy 9.15 `FRONTIER` |
| Measure on an outcome that lands days later, with the window held open | ABSENT | NO | NO | Taxonomy 9.16 `TABLE-STAKES`. Outcomes are captured; no attribution window governs them |
| Stop an experiment and record why | ABSENT | NO | NO | Taxonomy 9.17 `DIFFERENTIATING` |
| Prevent two experiments overlapping on one population | ABSENT | NO | NO | Taxonomy 9.18 `DIFFERENTIATING` |
| See every experiment run against an offer and whether it was adopted | ABSENT | NO | NO | Taxonomy 9.19 `DIFFERENTIATING` |
| Export raw assignment and exposure records | ABSENT | NO | NO | Taxonomy 9.20 `TABLE-STAKES`. Assignment is a pure function, so there is nothing to export |
| Run an experiment whose arms differ in targeting | ABSENT | NO | NO | Taxonomy 9.21 `FRONTIER` |
| Be shown the decision a result supports, not only the numbers | ABSENT | NO | NO | Taxonomy 9.22 `FRONTIER` |

### 10 — Journeys and orchestration

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Build a multi-step journey with waits, branches and message steps | ABSENT | NO | NO | Taxonomy 10.1 `TABLE-STAKES` |
| Set entry criteria and control re-entry | ABSENT | NO | NO | Taxonomy 10.2 `TABLE-STAKES` |
| Branch on attribute, behaviour or a random split, with counts per branch | ABSENT | NO | NO | Taxonomy 10.3 `TABLE-STAKES` |
| Preview the path one named customer would take | ABSENT | NO | NO | Taxonomy 10.4 `DIFFERENTIATING` |
| Start a journey from an inbound event within seconds | ABSENT | NO | NO | Taxonomy 10.5 `TABLE-STAKES` |
| Call the decision engine inside a journey step | ABSENT | NO | NO | Taxonomy 10.6 `DIFFERENTIATING` |
| See how many customers are at each step right now | ABSENT | NO | NO | Taxonomy 10.7 `TABLE-STAKES` |
| Change a live journey without ejecting those inside it | ABSENT | NO | NO | Taxonomy 10.8 `DIFFERENTIATING` |
| Wait until a condition becomes true, with a maximum wait | ABSENT | NO | NO | Taxonomy 10.9 `TABLE-STAKES` |
| End a journey when its goal is met and count those who exited that way | ABSENT | NO | NO | Taxonomy 10.10 `TABLE-STAKES` |
| See which journeys one customer is in, and remove them from one | ABSENT | NO | NO | Taxonomy 10.11 `DIFFERENTIATING` |
| Coordinate journeys so service and sales do not collide | ABSENT | NO | NO | Taxonomy 10.12 `FRONTIER` |

The whole domain is absent. `journey` appears twice in the repository: an SVG
path name at `apps/console/components/nav-rail.tsx:263` and a doc comment at
`packages/core/src/domain.ts:584`. The decision flow canvas is a DAG executed to
completion inside one decision; nothing persists a customer's position in a
process across time.

### 11 — Channels and delivery

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| See recommended actions for the customer on the line, inside an agent desktop | ABSENT | NO | NO | Taxonomy 11.3 `DIFFERENTIATING` |
| Record a conversation outcome and have the next decision reflect it | ABSENT | NO | NO | Taxonomy 11.4 `DIFFERENTIATING`. Outcomes are captured by API; nothing feeds them back into a decision |
| Activate an audience to a paid media destination and see the match rate | ABSENT | NO | NO | Taxonomy 11.5 `TABLE-STAKES` |
| Suppress existing customers from a paid acquisition audience | ABSENT | NO | NO | Taxonomy 11.6 `TABLE-STAKES` |
| Run a batch decision over the base overnight and deliver a file | ABSENT | NO | NO | Taxonomy 11.7 `TABLE-STAKES` |
| Retry or reroute a failed delivery without re-deciding | ABSENT | NO | NO | Taxonomy 11.9 `DIFFERENTIATING` |
| Add a delivery provider through configuration | ABSENT | NO | NO | Taxonomy 11.11 `DIFFERENTIATING` |
| Hold a send until the moment each individual is likeliest to engage | ABSENT | NO | NO | Taxonomy 11.12 `DIFFERENTIATING` |
| Set quiet hours in each customer's time zone | ABSENT | NO | NO | Taxonomy 11.13 `TABLE-STAKES` |
| Throttle outbound volume and see queue depth | ABSENT | NO | NO | Taxonomy 11.14 `TABLE-STAKES` |

### 12 — Frequency, suppression and fatigue

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Mark a message transactional so it bypasses caps, and list what bypassed | ABSENT | NO | NO | Taxonomy 12.4 `TABLE-STAKES`. Service exemption exists for consent, not for caps |
| Suppress an offer after a stated number of refusals | ABSENT | NO | NO | Taxonomy 12.5 `DIFFERENTIATING` |
| See how many decisions each policy suppressed, and what | ABSENT | NO | NO | Taxonomy 12.6 `DIFFERENTIATING`. Per-decision reasons are in the trace; nothing aggregates them |
| Let the platform choose each individual's volume within a range | ABSENT | NO | NO | Taxonomy 12.7 `DIFFERENTIATING` |
| See fatigue evidence for a cohort | ABSENT | NO | NO | Taxonomy 12.8 `FRONTIER` |
| Cap by category rather than by channel | ABSENT | NO | NO | Taxonomy 12.9 `DIFFERENTIATING`. Scopes exist; a category-level cap is not among them |
| See what a customer would have been offered had a cap not blocked it | ABSENT | NO | NO | Taxonomy 12.10 `FRONTIER` |

### 13 — Simulation, testing and pre-production QA

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Run a proposed policy against a sample and see removals per clause | ABSENT | NO | NO | Taxonomy 13.1 `DIFFERENTIATING` |
| Compare two configurations on the same population | ABSENT | NO | NO | Taxonomy 13.2 `DIFFERENTIATING`. `/simulations` compares change sets, which is narrower |
| See the projected offer distribution before publishing | ABSENT | NO | NO | Taxonomy 13.3 `DIFFERENTIATING` |
| Find customers who would receive nothing, or only low-value actions | ABSENT | NO | NO | Taxonomy 13.4 `DIFFERENTIATING` |
| Send one synthetic customer through the live configuration and read the trace | ABSENT | NO | NO | Taxonomy 13.7 `TABLE-STAKES`. The trace exists for recorded decisions; no screen originates one |
| Project the value of a configuration against a target | ABSENT | NO | NO | Taxonomy 13.6 `DIFFERENTIATING` |
| Be told which live decisions a pending change set would alter | ABSENT | NO | NO | Taxonomy 13.9 `FRONTIER` |
| See how long a simulation will take and what it will cost | ABSENT | NO | NO | Taxonomy 13.11 `FRONTIER` |

### 14 — Analytics, attribution and reporting

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| See the decision funnel as counts, stage by stage | ABSENT | NO | NO | Taxonomy 14.4 `DIFFERENTIATING`. Reason codes exist per decision; nothing aggregates them into a funnel |
| See that funnel for one named customer | ABSENT | NO | NO | Taxonomy 14.5 `DIFFERENTIATING` |
| Be told whether a movement is outside normal variation | ABSENT | NO | NO | Taxonomy 14.6 `DIFFERENTIATING` |
| Reconcile the platform's totals against a warehouse | ABSENT | NO | NO | Taxonomy 14.14 `FRONTIER` |
| Build a report the vendor did not anticipate | ABSENT | NO | NO | Taxonomy 14.15 `DIFFERENTIATING` |
| Schedule a report to named recipients | ABSENT | NO | NO | Taxonomy 14.16 `TABLE-STAKES` |
| See value produced this period against target on one screen | ABSENT | NO | NO | Taxonomy 14.17 `DIFFERENTIATING` |
| See performance by acquisition cohort followed forward | ABSENT | NO | NO | Taxonomy 14.18 `DIFFERENTIATING` |
| See which offers are never chosen and why they lose | ABSENT | NO | NO | Taxonomy 14.19 `DIFFERENTIATING` |
| See each ranking term's contribution to realised value | ABSENT | NO | NO | Taxonomy 14.20 `FRONTIER` |
| See latency and compute cost beside the value a decision produced | ABSENT | NO | NO | Taxonomy 14.21 `FRONTIER` |

### 15 — Governance, approval, environments and audit

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Reject a change set with a reason that reaches the author | ABSENT | NO | NO | Taxonomy 15.3 `TABLE-STAKES`. Rejection exists; a reason travelling back to the author does not |
| Verify the audit log is append-only and unaltered | ABSENT | NO | NO | Taxonomy 15.8 `FRONTIER`. Decisions are chain-hashed; audit events are rows |
| Get a change into production within a working day without a release | ABSENT | NO | NO | Taxonomy 15.10 `DIFFERENTIATING`. Catalogue edits do not reach the engine — W-005 |
| List every decision affected by a past incident window | ABSENT | NO | NO | Taxonomy 15.13 `FRONTIER` |

### 16 — Administration, extensibility and screen configurability

Covered above in *Screen configurability* and *The token layer*. The remaining
uncovered item:

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| Extend a decision flow with a custom operator under a resource limit | ABSENT | NO | NO | Taxonomy 16.7 `DIFFERENTIATING`. `packages/nodes-core` describes operator metadata and is imported by nothing |

### 17 — Operations, reliability and cost

| Capability | Status | Screen? | Config? | Evidence |
|---|---|---|---|---|
| See the decision endpoint's latency distribution in real time | ABSENT | NO | NO | Taxonomy 17.1 `TABLE-STAKES`. The bench measures a process offline |
| See which stage of a flow consumed the time, per decision | ABSENT | NO | NO | Taxonomy 17.3 `FRONTIER` |
| See sustained throughput and how close it is to the limit | ABSENT | NO | NO | Taxonomy 17.4 `TABLE-STAKES` |
| Keep deciding under a stated degradation policy when a source is down | ABSENT | NO | NO | Taxonomy 17.6 `DIFFERENTIATING`. Per-connector timeouts exist; a system-level policy does not |
| See the cost of decisions by tenant, flow or channel | ABSENT | NO | NO | Taxonomy 17.7 `FRONTIER` |
| Be alerted when a metric departs from its own history | ABSENT | NO | NO | Taxonomy 17.8 `DIFFERENTIATING` |
| Drain and restart a node without losing decisions in flight | ABSENT | NO | NO | Taxonomy 17.9 `TABLE-STAKES` |
| See how far behind real time the interaction log is | ABSENT | NO | NO | Taxonomy 17.10 `DIFFERENTIATING` |
| Reprocess a period of events after an outage without double-counting | ABSENT | NO | NO | Taxonomy 17.11 `DIFFERENTIATING` |

---

## Evaluation counts

**Computed 2026-09-09 from the rows above.** Each count names the rows it came
from so it can be recomputed rather than trusted.

### TABLE-STAKES items at ABSENT — the evaluation-loss list

**53 of the 91 `TABLE-STAKES` items in the taxonomy.**

Rows: every taxonomy id cited by a row above whose status is ABSENT, and cited
by no row at BUILT, PARTIAL, PLANNED or OUT OF SCOPE. All 91 are cited
somewhere, so this is a partition rather than a sample. By domain: 1 (6), 2 (3),
3 (5), 4 (3), 5 (6), 6 (2), 7 (0), 8 (1), 9 (2), 10 (7), 11 (6), 12 (1), 13 (1),
14 (3), 15 (1), 16 (3), 17 (3).

The ids: 1.2, 1.4, 1.5, 1.12, 1.19, 1.22, 2.1, 2.5, 2.8, 3.1, 3.2, 3.4, 3.7,
3.12, 4.2, 4.3, 4.10, 5.3, 5.4, 5.5, 5.9, 5.14, 5.17, 6.7, 6.12, 8.1, 9.8,
9.16, 10.1, 10.2, 10.3, 10.5, 10.7, 10.9, 10.10, 11.5, 11.6, 11.7, 11.8, 11.13,
11.14, 12.4, 13.7, 14.7, 14.13, 14.16, 15.3, 16.3, 16.9, 16.12, 17.1, 17.4,
17.9.

**One domain loses nothing: arbitration and ranking.** Three lose most of what a
buyer asks about first — journeys (7 of 7), channels and delivery (6 of 8), and
content (6 of 9). Governance loses one of six and data loses six of ten, which
is the shape of a platform built inward from the decision rather than outward
from the campaign.

### BUILT or PARTIAL where Screen? = NO — the inventory list

**44 rows.** Work already paid for that delivers nothing to a person.

Rows: the vocabulary check, the offer/action split, the deterministic engine,
canonical serialisation, idempotency, the durable decision ledger, outcome
capture, replay-calls-no-connector, the no-egress guarantee, all four PostgreSQL
rows, the catalogue in PostgreSQL, any store reachable from a screen, OpenAPI as
the source of truth, the exemption check, the bidirectional contract test,
export/re-import, export completeness, export of catalogue history, export of
approvals, bulk import, all five performance rows, the four §13 gate
capabilities that have no screen (canonical taxonomy, open contracts,
deterministic runtime, idempotency), cloud and runtime neutrality, provable
exitability, the decision API, volume constraints, flow test cases,
multi-tenancy, the corpus import cost, one place colour is decided, contrast
measurement, and outcome durability — which is a startup line rather than a
screen, and correctly so.

The single largest block is storage and portability: three PostgreSQL-backed
stores, a byte-identical tenant round trip, and a completeness guard — all of it
reachable only from `packages/portability/src/cli.ts`.

### Configurable without code? = NO — the extensibility debt list

**311 rows, of 314 capability rows in this map.**

Only three rows answer YES, and they are the same mechanism seen three times:
the form descriptor registry, the declared Offer form, and the declared Creative
form. Everything else in this product — every objective, every category, every
targeting policy field, every frequency cap, every theme, every layout, every
role — requires a commit.

Two of fourteen entities in `USER_EDITABLE_ENTITIES` have a descriptor. The
twelve that do not are listed with a reason each at
`packages/ui-metadata/src/registry/index.ts:59-72`, and eight of those reasons
are not "not done yet" but "no schema, no screen, no authoring surface at all."

---

## Known holes in the checks themselves

Recorded because a check that appears to run and does not is worse than no
check. [W-001](BACKLOG.md) closed four of these on 2026-09-06; each fix was
verified by breaking the thing it guards. These rows are checks rather than
capabilities, so the two columns do not apply.

| Hole | Status |
|---|---|
| The root typecheck checked zero files, and `bench/*` was covered by nothing | **Closed** — `tsconfig.typecheck.json` covers every package, its tests, bench and scripts. Verified: a type error in `bench/harness/src` fails `npm run typecheck` |
| Route bundle size was in the definition of done and checked by nothing | **Closed** — `npm run test:bundle` measures what a browser downloads from the standalone build. Verified: a route over budget fails |
| The axe sweep scanned no detail routes | **Closed** — `/decision-flows/[id]` and `/decisions/[id]` added, both clean. Verified: a nameless button fails `button-name` |
| Nothing stopped a second document claiming things were built | **Closed** — `tests/docs-status.test.ts`. Verified: a "Decision ledger \| Built" row in README fails it |
| Nothing tied the API paths to the spec | **Closed** — `tests/api-paths.test.ts`. Verified in both directions |
| There is no i18n mechanism; every string is inline in JSX | Open — [ADR-005](adr/ADR-005-internationalisation.md) proposes one and is **awaiting a product decision**. It grows every sprint |
| The console edits a catalogue the engine does not read | **Closed 2026-09-07**, and this row said Open until 2026-09-09. Live decisions build their `CatalogueSnapshot` from `store.*`, so weights, boosts, policies, caps and offers reach the engine; `catalogue-configurability.test.ts` asserts a weight change changes the ranking, not merely that it persisted. [G-021, G-029](gaps.md). The E4 review found this row stale and it was corrected two days late — the third such row this week, all understating the product |
| The console still writes its client URLs by hand | **Closed** — `api-client.ts` derives both path and method from `OPERATIONS`. Verified: a literal path fails it |
| Layout manifests do not exist, and the gate has said so for two sessions | Open — the largest block of the 24 standing conformance failures. `UX_CONTRACT.md` §2 |
| `W-029` is cited from source and registered in the wrong file | Open — `engine.ts:522` and `artifacts.ts:147` point at `gaps.md`; W-029 lives in [`BACKLOG.md`](BACKLOG.md):832 |

Two things the typecheck found the moment it started running, both invisible for
months: `packages/nodes-core` declared its node registry as an abstract
constructor with the wrong arity, so `createNode` could never have worked —
nothing imports that package's code, only its name as a version range — and two
catalogue literals in tests omitted `connectors`.

The bundle budget is honest about its own granularity: authenticated routes
cluster tightly because the shared shell dominates, so it is close to a shell
budget with two exceptions. It catches a heavy new dependency long before it
catches a heavy new page.

Full detail, with dates and diagnoses, is in [`docs/gaps.md`](gaps.md).

## Where the detail lives

| Document | What it is for |
|---|---|
| **This file** | The capability map: what is built, now. Start here |
| [`docs/evaluation/CAPABILITY_TAXONOMY.md`](evaluation/CAPABILITY_TAXONOMY.md) | 250 vendor-neutral line items mined from fifteen products' documentation. What a buyer will ask for |
| [`docs/evaluation/TRUTH_AUDIT.md`](evaluation/TRUTH_AUDIT.md) | The codebase survey this map's new rows are drawn from, with paths and line numbers |
| [`docs/review/METIS_REVIEW_BRIEF.md`](review/METIS_REVIEW_BRIEF.md) | A six-phase platform review, not yet run. Its Phase A verifies this file claim by claim |
| [`docs/BACKLOG.md`](BACKLOG.md) | What is next: 51 work items, W-000 to W-050, in stage order, each with the check that would close it |
| [`docs/EXPERIENCE_LAYER_STATUS.md`](EXPERIENCE_LAYER_STATUS.md) | Console routes, one row each, and a narrative per stage |
| [`docs/gaps.md`](gaps.md) | The gap register: what is missing, per operation and per persona, with dates |
| [`docs/adr/`](adr/) | Seven decisions and their rationale. ADR-003 is normative for serialisation; ADR-004 (erasure) and ADR-005 (i18n) are proposed and awaiting product calls |
| [`docs/metis-api.openapi.yaml`](metis-api.openapi.yaml) | The contract. If an endpoint is not here, it does not exist |
| [`docs/GETTING_STARTED.md`](GETTING_STARTED.md) | How to run it |
