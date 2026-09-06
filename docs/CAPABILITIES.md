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
Integration          6 passed  - author -> compile -> execute -> replay
Runtime            184 passed  - determinism, byte-identical replay, integration
                                 resolution, ADR-003 values, the 22-decision
                                 corpus, ranking functions, idempotency, shadow
Compiler            43 passed  - graph validation, version pinning, budgets
Registry            68 passed  - one behaviour suite, run against memory and a
                                 real PostgreSQL
Ledger              50 passed  - the same pattern: one suite, both stores
Performance          6 passed  - bench/harness, the latency gate
Unit (Vitest)       45 passed  - apps/console
E2E (Playwright)   184 passed  - contract, cross-engine, axe, registry, ledger,
                                 idempotency, shadow (13 skipped: writes covered
                                 by permissions-and-writes and registry instead)
Conformance (JVM)   13 passed  - engines/kotlin; 67 values, 22 decisions,
                                 60 real decisions over HTTP
Typecheck           clean      - root config and the console's, separately
Lint                0 errors   - root and console, separate configs
                   ---
                    599 tests, two languages, two engines
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
| Missing score is never a silent zero | PARTIAL | The engine uses a neutral 1.0 under exponentiation rather than 0, which is correct arithmetic but not the *configurable approved default* §6 asks for |
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
| Catalogue, policies and taxonomy in PostgreSQL | PARTIAL | Still an in-memory store with process lifetime |
| Redis, ClickHouse, event broker, object storage, online feature service | OUT OF SCOPE | Gate 2–3 |

## §9 — Contracts and portability

| Capability | Status | Evidence |
|---|---|---|
| OpenAPI 3.1 as the source of truth | BUILT | `packages/client` is generated; the console compiles against it, so spec drift is a compile error |
| Contract tested in both directions | BUILT | The compiler catches spec→console; `e2e/contract.spec.ts` asserts every non-proposed operation is served and returns what the spec declares. Verified to bite by pointing a spec path at an unserved route |
| **Export / re-import** | **PLANNED — Stage 7, [W-002](BACKLOG.md)** | `packages/portability`, and the conformance utility that validates round-trip fidelity. This is the exitability claim, so it is the one that most needs building rather than asserting |
| AsyncAPI, CloudEvents, OpenTelemetry | OUT OF SCOPE | Gate 2–3 |

## §10 — Performance

| Capability | Status | Evidence |
|---|---|---|
| Latency gate in CI | BUILT | `bench/harness/tests/gate.test.ts`. Currently **p95 < 50 ms**; measured 1.04 ms at 40 candidates |
| Tighten the gate to **p99 < 50 ms** | PLANNED — Stage 8 | The PDF states the promise as p99, which is the stricter reading and already passes |
| **S1 benchmark** — 1M profiles, 100 actions, 1k/2k decisions per second | **PLANNED — Stage 8, [W-003](BACKLOG.md)** | The harness scales candidate sets, not profiles. Variants needed: warm, cold, 1/5/20% miss, degraded provider |
| Publishing workload, data distribution, code version, cache state and confidence intervals with every result | PLANNED — Stage 8 | So a number cannot be quoted without its context |

Throughput is measured and deliberately **not** gated: it swung 3× under machine
load, and an ignored gate is worse than none.

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
| Complete export / re-import | **Not met** — Stage 7 |
| S1 benchmark | **Not met** — Stage 8 |
| No LLM dependency | **Met in fact**, not yet guarded by a test asserting no network egress in the decision path |

**Two of eight capabilities' worth of work remain, both in the exit criteria
rather than the capability list.**

## §14 — Differentiators

| | Status |
|---|---|
| Executable transparency | BUILT — every decision replays byte-identically and names its versions |
| Deterministic governance | BUILT — publish/promote separated, immutable versions, append-only audit |
| Cloud and runtime neutrality | PARTIAL — two independent engines (TypeScript, Kotlin) agree on a shared corpus, which is the substance of the claim; deployment neutrality is untested |
| Coexistence-led migration | PARTIAL — shadow mode is built; the migration factory is not |
| **Provable exitability** | **PLANNED — Stage 7.** The headline differentiator, and currently the least evidenced |
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
| Nothing tied the API paths to the spec | **Closed** — `tests/api-paths.test.ts`. Verified in both directions: a path renamed in the Kotlin router fails, and so does one renamed in the console's client |
| There is no i18n mechanism; every string is inline in JSX | Open — [W-042](BACKLOG.md), and it grows every sprint |
| The console still writes its client URLs by hand | Open — they are now *checked* against the spec, but W-001 asked for them to be generated. That is a 33-call-site refactor and was left as its own change |

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
| [`docs/adr/`](adr/) | Four decisions and their rationale, ADR-003 being normative for serialisation |
| [`docs/metis-api.openapi.yaml`](metis-api.openapi.yaml) | The contract. If an endpoint is not here, it does not exist |
| [`docs/GETTING_STARTED.md`](GETTING_STARTED.md) | How to run it |
