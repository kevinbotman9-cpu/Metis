# METIS — Capabilities, built and planned

**Last verified:** 2026-09-06, by running the suites named below rather than by
reading the code.

This is the single answer to "what does METIS actually do today, and what is it
going to do". It replaced three partial answers that had drifted apart: a
component table in `README.md` that still called the decision ledger,
idempotency and shadow mode unbuilt three stages after they were built; an
operation count in `docs/gaps.md` that said 26 built when the spec validator
said 39; and a test-count block in `docs/EXPERIENCE_LAYER_STATUS.md` that
understated the suite by 172 tests. Three documents making the same claim is
three chances to be wrong, so the claim now lives in one place and the others
point here.

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
| **OUT OF SCOPE** | Deliberately not in this gate; §13 gates 2–3 |

## The suites, and what each covers

```
Integration         15 passed  - author -> compile -> execute -> replay, plus the
                                 API-path reconciliation and source hygiene
                                 checks, which span packages and belong to none
Runtime            196 passed  - determinism, byte-identical replay, integration
                                 resolution, ADR-003 values, the 22-decision
                                 corpus, ranking functions, idempotency, shadow,
                                 no network egress in the decision path, and
                                 the approved default for a missing score
Compiler            43 passed  - graph validation, version pinning, budgets
Registry            68 passed  - one behaviour suite, run against memory and a
                                 real PostgreSQL
Catalogue           40 passed  - taxonomy, offers, creatives, policies, boosts
                                 and the ranking function; one suite over
                                 memory and a real PostgreSQL
Ledger              50 passed  - the same pattern: one suite, both stores
Portability         22 passed  - export, re-import, round-trip conformance, and
                                 the guard that stops the export rotting
Performance         12 passed  - bench/harness: the p99 gate, and S1 over a
                                 million seeded profiles
Unit (Vitest)       45 passed  - apps/console
E2E (Playwright)   187 passed  - contract, cross-engine, axe, registry, ledger,
                                 idempotency, shadow (13 skipped: writes covered
                                 by permissions-and-writes and registry instead)
Conformance (JVM)   13 passed  - engines/kotlin; 67 values, 22 decisions,
                                 60 real decisions over HTTP
Typecheck           clean      - root config and the console's, separately
Lint                0 errors   - root and console, separate configs
                   ---
                    688 tests, two languages, two engines
```

The OpenAPI spec validates at **34 paths, 41 operations (39 built, 2 proposed),
46 schemas**.

---

## §3/§4 — Canonical taxonomy

| Capability | Status | Evidence |
|---|---|---|
| Vendor-neutral vocabulary in code, API, UI and docs | BUILT | The rename landed 2026-09-05 (`1d3da31`). `CLAUDE.md` holds the normative catalogue |
| `offer` / `action` split | PARTIAL | An offer carries the `key` used as the action. Splitting them is a modelling change, not a rename, and has not been done |

The vocabulary was Pega's almost verbatim — proposition, treatment, engagement
policy, contact policy, lever, decision strategy. It is now the catalogue in
`CLAUDE.md`, which retains *arbitration* and *propensity* deliberately because
§3.2 keeps both as industry-standard. Every chain hash in the conformance
corpora changed on that date, because the rename reached the hashed decision.

## §6 — Deterministic execution

| Capability | Status | Evidence |
|---|---|---|
| Deterministic engine, byte-identical replay | BUILT | `packages/runtime/tests/determinism.test.ts`; byte-identical across 100 runs |
| Canonical serialisation, specified not implemented | BUILT | ADR-003 + a 67-case corpus; `conformance.test.ts` and the Kotlin suite both read it |
| Stable reason codes, per candidate | BUILT | 8 codes in `deterministic/types.ts`; `decision-conformance.test.ts` asserts the corpus exercises **every** one, so none ships unverified in a second engine |
| Typed, versioned ranking functions | BUILT | `packages/core/src/utility.ts`, a closed operation set and no `eval`; `utility.test.ts` proves `multiplicative@1.0.0` reproduces the formula it replaced bit for bit |
| Idempotency — same key and hash returns the original | BUILT | `runtime/tests/idempotency.test.ts`, `e2e/idempotency.spec.ts`. A reused key with a different request is a 409, not a silently stale answer |
| Durable decision ledger | BUILT | `packages/ledger`, 50 tests against both stores; append-only triggers |
| Outcome capture | BUILT | `POST /outcomes/{tenantId}/{decisionId}`, `e2e/ledger.spec.ts`. Storage only — learning from outcomes is §7 |
| Missing score is never a silent zero | BUILT | A flow declares a `missingScoreDefault` with its approver and date; the engine applies it, and every decision records which candidates fell back and what default stood in. Both engines agree via two new corpus cases. Verified: an engine that ignores the declared default fails two unit tests and the corpus |
| Optimisation constraints, slate selection | OUT OF SCOPE | The engine returns a single action. Cardinality, mutual exclusion, diversity, budget, inventory and fairness are gate 2–3 |

## §7 — Intelligence

| Capability | Status | Evidence |
|---|---|---|
| Model gateway, model registry | OUT OF SCOPE | Gate 2 |
| Adaptive learning, contextual bandits, drift, calibration | OUT OF SCOPE | Gate 2–3 |
| Model shadow scoring | OUT OF SCOPE | Distinct from flow-version shadow mode, which is built — see §12 |

Propensity today is a seeded, deterministic function. That is what makes the
corpus reproducible, and it is also why nothing here claims to learn.

## §8 — Storage

| Capability | Status | Evidence |
|---|---|---|
| PostgreSQL for the registry | BUILT | One behaviour suite against memory and a real database, so the rules are known to be storage-independent |
| PostgreSQL for the decision ledger | BUILT | Same pattern, `packages/ledger` |
| Append-only enforced at the schema | BUILT | Triggers reject `UPDATE` and `DELETE` on versions, events and records — the application refusing is not enough |
| A configured database that cannot be reached | BUILT | An error, never a silent fallback to storage that forgets |
| Retention and erasure | PLANNED — [W-006](BACKLOG.md) | [ADR-004](adr/ADR-004-retention-and-erasure.md) proposes crypto-shredding per subject, so the ledger stays append-only while the plaintext becomes unrecoverable. **Proposed, not accepted** — it carries real operational cost and legal consequences, and needs a product decision before W-008 begins. Nothing implements it |
| Catalogue, policies and taxonomy in PostgreSQL | PARTIAL | `packages/catalogue` is built and durable — one behaviour suite over memory and a real database, foreign keys, a unique offer key, and an append-only edit log enforced by trigger. The console has not been repointed at it yet, so authored state is still lost on restart there. [W-005](BACKLOG.md) |
| Redis, ClickHouse, event broker, object storage, online feature service | OUT OF SCOPE | Gate 2–3 |

## §9 — Contracts and portability

| Capability | Status | Evidence |
|---|---|---|
| OpenAPI 3.1 as the source of truth | BUILT | `packages/client` is generated; the console compiles against it, so spec drift is a compile error |
| Contract tested in both directions | BUILT | The compiler catches spec→console; `e2e/contract.spec.ts` asserts every non-proposed operation is served and returns what the spec declares. Verified to bite by pointing a spec path at an unserved route |
| **Export / re-import** | **BUILT** | `packages/portability`. A populated tenant exports, imports into an empty instance and re-exports byte-identically; version hashes, ledger records and environment state including a running shadow all survive; and a pre-export decision replayed on the imported instance produces the same chain hash. `npm run export -- --tenant <id> --out <dir>` writes one readable JSON file per entity plus a manifest, and `--verify` checks a bundle against it |
| Export completeness does not rot | BUILT | `completeness.test.ts` reads the migrations and requires every table to be exported or excluded with a written reason. Verified: adding a table fails the suite until somebody decides what the export does with it |
| Export covers the catalogue and its authoring history | BUILT | Nine catalogue tables travel in the bundle, and the round trip asserts what the engine decides *from* comes back with what it decided |
| Export covers approvals and the audit log | PARTIAL | Both are still in the console's in-memory store, so there is nothing durable to export |
| AsyncAPI, CloudEvents, OpenTelemetry | OUT OF SCOPE | Gate 2–3 |

## §10 — Performance

| Capability | Status | Evidence |
|---|---|---|
| Latency gate in CI | BUILT | `bench/harness/tests/gate.test.ts`, gating **p99 < 50 ms** — the promise the specification actually states. Verified: a budget the engine cannot meet fails it |
| **S1 benchmark** — 1M profiles, 100 actions | **BUILT** | `npm run bench:s1` over 1,000,000 seeded profiles and 100 active actions, cold and warm. Measured p99 **6.8 ms cold, 3.6 ms warm** against the 50 ms budget. `bench/results/S1.json` |
| S1's remaining variants — feature-store miss, degraded provider, sustained 1k/2k per second | PARTIAL | Named in the result with the reason each is absent, rather than left to be inferred from silence. The first two need a feature service and the gateway in the measured path ([W-009](BACKLOG.md), [W-010](BACKLOG.md)); the third needs a deployed service, since this harness is single-threaded and measures per-core capacity |
| Publishing workload, data distribution, infrastructure, code version, model latency, cache state and confidence intervals | BUILT | Mandatory fields on the report type, asserted field by field in `s1.test.ts`. Verified: dropping one fails the suite |

Throughput is measured and deliberately **not** gated: it swung 3x under machine
load, and an ignored gate is worse than none. The number is published on every
S1 variant, so a real collapse is still visible.

## §11 — Governance

| Capability | Status | Evidence |
|---|---|---|
| Immutable audit log | BUILT | Every write lands in it; `/audit` is filterable by actor type |
| Segregation of duties | BUILT | `publish:flows` and `promote:flows` are separate permissions, refused server-side with a 403, not merely hidden in the UI |
| Publishing compiles first | BUILT | A flow that does not compile never enters the registry, and the refusal is recorded — an audit that only shows successes cannot answer whether anyone tried |
| Versions immutable, bound to an artifact hash | BUILT | Same content republished is a no-op; different content under the same version is refused |
| Change sets and approvals | BUILT | `/approvals`, agent vs person provenance, diff applied on approval |
| Agentic autonomy ladder L0–L4 | BUILT | Per-scope guardrails, resolved autonomy shown on each offer |
| ABAC, artefact signing, SBOM, NIST AI RMF / EU AI Act evidence packs | OUT OF SCOPE | Gate 2–3 |

## §12 — Migration

| Capability | Status | Evidence |
|---|---|---|
| Shadow mode — a version beside the active one, deciding nothing | BUILT | `packages/runtime/src/shadow`, `e2e/shadow.spec.ts`. Verified to bite: pointing the shadow at the active version makes everything agree and the divergence assertion fails |
| Candidate / rank / reason comparison | BUILT | Three questions, not one boolean — two versions can pick the same offer for opposite reasons, and a migration that changes *why* without changing *what* is the case a regulator asks about |
| Agreement rate that cannot flatter | BUILT | Zero comparisons reports 0%, never 100%; the panel shows "—" until there is something behind it |
| Pega migration factory | OUT OF SCOPE | Gate 3 |

## §13 — The Foundation MVP gate

The eight named capabilities:

| | Status |
|---|---|
| Canonical taxonomy | BUILT |
| Open contracts | BUILT |
| Versioned catalogue / policy AST | BUILT |
| Deterministic runtime | BUILT |
| Decision ledger | BUILT |
| Replay | BUILT |
| Idempotency | BUILT |
| Shadow mode | BUILT |

The four exit criteria:

| | Status |
|---|---|
| Semantic tests pass | **Met** — three corpora, two languages, two engines |
| Complete export / re-import | **Met for everything durably stored.** The round-trip conformance utility passes on the registry and the ledger. The catalogue, policies and approvals are still in memory, so they are outside the export until they are outside memory — [W-005](BACKLOG.md) |
| S1 benchmark | **Met at the scale the engine can be held to.** 1M profiles, 100 actions, p99 6.8 ms cold against 50 ms, published with its context. The load variants that need a feature store, a gateway or a deployed service are named in the result as unmeasured |
| No LLM dependency | **Met, and guarded.** `no-egress.test.ts` blocks fetch, http, https, net, socket and dns at the process level, then decides and replays successfully with zero attempts. Verified: a `fetch` planted in the engine fails it |

**All eight capabilities are built, and all four exit criteria are met — two of
them bounded, and the bounds are stated above rather than buried: the export
covers what is durably stored, and S1 covers what a single-process engine
benchmark can honestly claim.**

## §14 — Differentiators

| | Status |
|---|---|
| Executable transparency | BUILT — every decision replays byte-identically and names its versions |
| Deterministic governance | BUILT — publish/promote separated, immutable versions, append-only audit |
| Cloud and runtime neutrality | PARTIAL — two independent engines (TypeScript, Kotlin) agree on a shared corpus, which is the substance of the claim; deployment neutrality is untested |
| Coexistence-led migration | PARTIAL — shadow mode is built; the migration factory is not |
| **Provable exitability** | **BUILT, and bounded.** The claim is now evidenced rather than asserted: a tenant round-trips byte-identically and a decision replayed after the move produces the same chain hash. Bounded because it covers what is persisted, which today is the registry and the ledger |
| Replaceable intelligence | OUT OF SCOPE — gate 2 |

---

## Authoring, which is worth stating plainly

The canvas is **read-only**. A flow can be compiled, published, promoted, rolled
back, shadowed and replayed, but it cannot be drafted in the console — node
positions are authored in fixtures, not laid out. Ad-hoc simulation is a
proposed operation that nothing serves; `/simulations` says so on the page.

## Known holes in the checks themselves

Recorded because a check that appears to run and does not is worse than no
check. [W-001](BACKLOG.md) closed four of these on 2026-09-06; each fix was
verified by breaking the thing it guards.

| Hole | Status |
|---|---|
| The root typecheck checked zero files, and `bench/*` was covered by nothing | **Closed** — `tsconfig.typecheck.json` covers every package, its tests, bench and scripts. Verified: a type error in `bench/harness/src` fails `npm run typecheck` |
| Route bundle size was in the definition of done and checked by nothing | **Closed** — `npm run test:bundle` measures what a browser downloads from the standalone build. Verified: a route over budget fails |
| The axe sweep scanned no detail routes | **Closed** — `/decision-flows/[id]` and `/decisions/[id]` added, both clean. Verified: a nameless button fails `button-name` |
| Nothing stopped a second document claiming things were built | **Closed** — `tests/docs-status.test.ts`. Verified: a "Decision ledger \| Built" row in README fails it |
| Nothing tied the API paths to the spec | **Closed** — `tests/api-paths.test.ts`. Verified in both directions: a path renamed in the Kotlin router fails, and so does one renamed in the console's client |
| There is no i18n mechanism; every string is inline in JSX | Open — [ADR-005](adr/ADR-005-internationalisation.md) proposes one and is **awaiting a product decision**. `CLAUDE.md` lists i18n structure as needing review before code and says the gap needs a decision rather than a workaround, so nothing was built. It grows every sprint, and Stage 23's package authors will need the answer before they write a string |
| The console edits a catalogue the engine does not read | Open — the store deep-clones the fixtures and the engine reads the fixture modules, so a ranking-weight change persists, is audited, and changes no decision. Registered in [`gaps.md`](gaps.md); it is what makes W-005's second half a design question rather than a refactor |
| The console still writes its client URLs by hand | **Closed** — `api-client.ts` derives both path and method from `OPERATIONS`. The check inverted with it, from "the hand-written paths match" to "there are no hand-written paths". Verified: a literal path fails it |

Two things the typecheck found the moment it started running, both of which had
been invisible for months: `packages/nodes-core` declared its node registry as
an abstract constructor with the wrong arity, so `createNode` could never have
worked — nothing imports that package's code, only its name as a version range
— and two catalogue literals in tests omitted `connectors`, which is the same
class of bug `gaps.md` had already recorded as "caught by a failing benchmark,
not by the compiler".

The bundle budget is honest about its own granularity: every authenticated
route measures an identical 706.4 kB because the shared shell dominates, so it
is close to a shell budget with two exceptions. It catches a heavy new
dependency long before it catches a heavy new page.

Full detail, with dates and diagnoses, is in [`docs/gaps.md`](gaps.md).

## Where the detail lives

| Document | What it is for |
|---|---|
| **This file** | The capability map: what is built, now. Start here |
| [`docs/BACKLOG.md`](BACKLOG.md) | What is next: 51 work items, W-000 to W-050, in stage order, each with the check that would close it |
| [`docs/EXPERIENCE_LAYER_STATUS.md`](EXPERIENCE_LAYER_STATUS.md) | Console routes, one row each, and a narrative per stage — what each change surfaced, what it got wrong |
| [`docs/gaps.md`](gaps.md) | The gap register: what is missing, per operation and per persona, with dates |
| [`docs/adr/`](adr/) | Six decisions and their rationale. ADR-003 is normative for serialisation; ADR-004 (erasure) and ADR-005 (i18n) are proposed and awaiting product calls |
| [`docs/metis-api.openapi.yaml`](metis-api.openapi.yaml) | The contract. If an endpoint is not here, it does not exist |
| [`docs/GETTING_STARTED.md`](GETTING_STARTED.md) | How to run it |
