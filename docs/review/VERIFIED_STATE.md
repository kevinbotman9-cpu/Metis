# Phase A — Verified state

**Date:** 2026-09-06
**Method:** every suite run; every capability verified by breaking the thing it
guards and confirming a named check goes red, then restoring via
`git checkout --` from a clean tree.
**Fixes made:** none. This phase is read-only, per the brief §0.

The purpose of this document is a state of the repo that can be trusted before
anything is compared to it. `docs/CAPABILITIES.md` is the most honest document
in the project and it is still a claim.

---

## 1. Suite results, actual

Every number below was produced by running the command, not read from a
document.

| Suite | Command | Claimed | Actual |
|---|---|---|---|
| Integration | `npm run test:integration` | — | **16** (4 files) |
| Runtime | `npm run test:runtime` | 205 | **205** (10 files) |
| Compiler | `npm run test:compiler` | 43 | **43** |
| Registry | `npm run test:registry` | 75 | **75** (4 files, memory + PostgreSQL) |
| Catalogue | `npm run test:catalogue` | 40 | **40** (memory + PostgreSQL) |
| Ledger | `npm run test:ledger` | 50 | **50** |
| Portability | `npm run test:portability` | 22 | **22** |
| Performance | `npm run test:bench` | 12 | **12** |
| Console unit | `npm run test:console` | 45 | **45** |
| E2E | `npx playwright test` | 187 | **185 passed, 2 failed, 13 skipped** — see §4.1 |
| Conformance (JVM) | `./gradlew test` | 13 | **23** across 4 classes |
| Typecheck | `npm run typecheck` | clean | **clean** |
| Lint | `npm run lint` | 0 errors | **0 errors, 12 warnings** |
| Spec | `node scripts/validate-spec.mjs` | 34 / 41 / 46 | **34 paths, 41 operations (39 built, 2 proposed), 46 schemas** |

**Two count discrepancies, both in `CAPABILITIES.md`, neither a capability
problem:**

- **JVM is 23, not 13.** The four classes are `ConformanceTest` (2),
  `DecisionConformanceTest` (2), `IdempotencyTest` (8),
  `ServiceConformanceTest` (11). The two "2"s are parameterised: two test
  methods that loop over 67 canonical values and 27 decisions respectively. So
  the *breadth* is far larger than either 13 or 23 suggests, and neither number
  conveys it. Finding A-9.
- **E2E is quoted as 187 and the suite contains 200**, of which 13 are skipped
  by design. 185 passed and 2 failed on a cold full run. Finding A-1.

Corpus breadth, since several claims rest on it: canonical corpus **67** cases,
decision corpus **27**, service cases **60**.

---

## 2. The eight Foundation MVP capabilities

Each was broken and the named check confirmed red, unless stated.

| # | Capability | Result | How it was broken | What went red |
|---|---|---|---|---|
| 1 | Canonical taxonomy | **WEAKER-THAN-CLAIMED** | Added `export type Proposition = Offer; export type Treatment = Creative;` to `packages/core/src/domain.ts` | **Nothing.** Typecheck clean, lint clean, 16 + 205 tests pass. Finding A-2 |
| 2 | Open contracts | **CONFIRMED** | Covered below and in §3 Q4 | `contract.spec.ts` derives its operation list from the spec itself; `tests/api-paths.test.ts` bites on a hand-written path (verified 2026-09-06, `20f9f66`) |
| 3 | Versioned catalogue / policy AST | **CONFIRMED** | `registry.ts:~155` — treated every republish as unchanged | `registry` memory **and** PostgreSQL suites, 1 failure each |
| 4 | Deterministic runtime | **CONFIRMED** | Injected `Math.random()` into the hashed `context` term, `engine.ts:~516` | 13 of 27 decision-corpus cases, plus 2 integration determinism tests |
| 5 | Decision ledger | **CONFIRMED** | `ledger.ts:73` — returned the existing entry instead of refusing a hash collision | `ledger` memory **and** PostgreSQL suites, 1 failure each |
| 6 | Replay | **CONFIRMED, with a hole** | `engine.ts:721` — forced `identical = true` | `determinism.test.ts` and `tests/integration/pipeline.test.ts`. **But** disabling the input-snapshot-hash guard at `engine.ts:694` broke nothing — see Finding A-3 |
| 7 | Idempotency | **CONFIRMED** | `idempotency/index.ts` — returned `replay` where it should return `conflict` | `runtime/tests/idempotency.test.ts` |
| 8 | Shadow mode | **CONFIRMED** | `route.ts` — shadowed the active version against itself | `e2e/shadow.spec.ts:119`, the divergence assertion |

## 3. The two exit criteria the brief expects to be unmet

Both are **met and bounded**, and the bounds are already stated in
`CAPABILITIES.md`. The brief was written before they landed.

| Criterion | Result | How it was broken | What went red |
|---|---|---|---|
| Complete export / re-import | **CONFIRMED, bounded** | Marked `decision_records` excluded in `portability/src/entities.ts` | `completeness.test.ts` (1) and `round-trip.test.ts` (2) |
| S1 benchmark | **CONFIRMED, bounded** | Set `p99Ms: 0.0001` in `bench/harness/src/index.ts` | `s1.test.ts`, both variants: "p99 7.458ms exceeds", "p99 15.300ms exceeds" |

The bounds are real and recorded: the export covers what is durably stored
(registry, ledger, catalogue) and not approvals or the audit log; S1 covers what
a single-process engine benchmark can claim, with feature-store miss, degraded
provider and sustained throughput named in `bench/results/S1.json` as
unmeasured. Both bounds are honestly stated. Neither is overclaimed.

---

## 4. The brief's six specific questions

### Q1 — "Byte-identical across 100 runs of *what*?"

**Of one request, against one artifact and one catalogue.**
`packages/runtime/tests/determinism.test.ts:129` executes a single fixture 100
times. That proves the absence of per-invocation nondeterminism — an unseeded
random, a wall clock in the hashed half, a map iteration order that varies
between calls. It proves nothing about breadth.

Breadth comes from the decision corpus: 27 cases, and the `Math.random()` break
failed 13 of them. So the claim is sound, but the "100 executions" phrasing
credits the wrong test. **Finding A-8**, documentation precision.

### Q2 — Do the two engines agree on the *current* corpus, or a stale one?

**Current, and it is enforced.** Verified by running `./gradlew test` to a
steady `:engine:test UP-TO-DATE`, appending a newline to
`docs/conformance/decision-corpus.json`, and re-running: `:engine:test`
executed. The corpora are declared Gradle task inputs, so a regenerated corpus
cannot be silently skipped. Corpora last changed 2026-09-06 with W-007, and
both engines were regenerated and re-run in that commit (`723c085`).

### Q3 — Does the reason-code coverage test fail if a ninth code is added unexercised?

**No.** Added `| 'BUDGET_EXHAUSTED'` to the `ReasonCode` union at
`packages/runtime/src/deterministic/types.ts:201`. Typecheck clean, all 205
runtime tests pass.

The list at `decision-conformance.test.ts:67` is **hardcoded** — eight string
literals maintained by hand, not derived from the union. The test asserts the
corpus exercises those eight. It cannot notice a ninth.

This is the single most consequential finding in Phase A, because the check's
own stated purpose is "so none ships unverified in a second engine", and
W-012 in the backlog will add reason codes for suppression. The guard will fail
in exactly the circumstance it was written for. **Finding A-4.**

### Q4 — Does `contract.spec.ts` cover all 39 built operations, or a subset?

**All of them, by construction.** `apps/console/tests/e2e/contract.spec.ts:52`
walks `spec.paths` and builds its own operation list, filtering
`x-metis-status: proposed`. It does not maintain a list. An operation added to
the spec is covered the moment it is added, and one that stops being served
fails. **CONFIRMED**, and stronger than the brief assumed.

### Q5 — Is the append-only trigger tested by attempting an `UPDATE`, or asserted by reading the migration?

**By attempting it**, in all three stores that have one:

- `packages/registry/tests/postgres.test.ts:80,98` — `DELETE FROM registry_versions`, `UPDATE registry_events`
- `packages/catalogue/tests/postgres.test.ts:101,103` — `UPDATE` and `DELETE` on `catalogue_events`
- `packages/ledger/tests/postgres.test.ts` — same pattern

Each expects a rejection matching `/append-only/`. **CONFIRMED.**

### Q6 — Is the shadow-mode divergence assertion still verified to bite?

**Yes.** Pointing the shadow at the active version so the two always agree
failed `e2e/shadow.spec.ts:119` — "decisions made while shadowing are compared
and reported" — while the other 13 shadow tests passed, which is the correct
shape: only the divergence assertion should care. **CONFIRMED.**

---

## 5. Findings

Severity per brief §6.

### A-1 — The E2E suite is not reliably green on a cold full run · S4

Two of 200 tests failed on a cold full-suite run and **both passed on
re-run**: `integrations.spec.ts:57` ("a compliance officer can read but not
toggle") and `navigation.spec.ts:32` ("Decision flows resolves to a real
page"). Both failed with "element(s) not found" waiting for a page landmark —
`getByRole('navigation', { name: 'Main' })` and an `h1` — rather than on an
assertion about behaviour.

That signature is page-load timeout under full-suite contention, not a
regression. It is consistent with what `docs/gaps.md` already records about
cold-start and contention. It is a finding rather than noise because a suite
that fails 1% of the time on a clean tree teaches people to re-run rather than
to read, and the next real failure will be re-run too.

Not diagnosed further here: Phase A is read-only, and distinguishing "slow
under load" from "a race in auth setup" needs instrumentation.

### A-2 — The canonical taxonomy is unguarded · S1

`CAPABILITIES.md` marks it BUILT with evidence "the rename landed 2026-09-05
(`1d3da31`); `CLAUDE.md` holds the normative catalogue". Both are true and
neither is a check.

Adding `export type Proposition = Offer` and `export type Treatment = Creative`
to `packages/core/src/domain.ts` passes typecheck, lint, and every unit and
integration suite. No grep-based check, lint rule or test targets the
vocabulary anywhere in the repository.

S1 because the brief's own definition of BUILT — a named check fails when it
breaks — is not met, so the row is false as written. The *rename* is real and
complete; what is missing is anything that keeps it that way. The vocabulary is
§3 of a normative specification and the stated reason for the whole rename was
that a reader must not conclude METIS is a Pega copy; drift back is exactly
what nothing prevents.

Note the asymmetry with A-4: this one is cheap to fix (a lint rule or a grep
test over tracked source, excluding the retained `arbitration` and
`propensity`) and its consequence is reputational rather than correctness.

### A-3 — Replay's input-snapshot-hash guard is untested · S2

`packages/runtime/src/deterministic/engine.ts:694` refuses a replay whose
supplied input does not hash to the recorded `inputSnapshotHash`. Disabling it —
`const suppliedHash = d.inputSnapshotHash;` — passes all 205 runtime tests.

Replay's *verdict* is guarded (forcing `identical = true` fails
`determinism.test.ts` and `pipeline.test.ts`), so replay as a capability is
CONFIRMED. What is unguarded is the early check that distinguishes "this
decision does not reproduce" from "you gave me the wrong inputs". Today those
converge, because the subsequent chain-hash comparison catches a wrong input
anyway — with a less useful message.

S2 rather than S4 because of what the brief says at §5.3: when the feature store
lands (W-009), replay must read a snapshot rather than the live store, and this
guard is the thing that will detect a replay that read the wrong one. It is
untested now, while the cost of adding a test is one fixture.

### A-4 — Reason-code coverage cannot see a ninth code · S1

Detailed in Q3. `decision-conformance.test.ts:67` hardcodes the eight codes
rather than deriving them from the `ReasonCode` union at `types.ts:187–201`.

S1 because two engines silently disagreeing about a reason code is a
conformance hole, and because the check's stated purpose — "so none ships
unverified in a second engine" — is defeated in precisely the case it exists
for. W-012 will add suppression reason codes to the closed set; the guard will
be silent when it does.

The fix is small and belongs in Phase E: derive the list from the union, or
assert the test's list against it.

### A-5 — `CAPABILITIES.md` understates the JVM suite · S5

Claims 13; the actual is 23 across four classes, and neither number conveys the
breadth, because two of the classes are parameterised over 67 values and 27
decisions. A count is the wrong summary for a conformance suite. Recorded for
Phase F rather than fixed.

### A-6 — `CAPABILITIES.md` quotes an E2E count that no run produces · S5

Claims 187. The suite holds 200, of which 13 skip by design, so a green run
reports 187 passed — which is what an earlier run produced. The cold run in this
phase produced 185 + 2 failed. The number is not wrong so much as fragile: it
will be wrong again after any spec is added, and it was already stale twice in
this project's history. Phase F should consider whether per-suite counts belong
in a capability map at all.

### A-7 — Lint reports 12 warnings, and the capability map says "0 errors" · S5

True as stated, and worth a sentence in Phase F: the warnings are all
`@typescript-eslint/no-explicit-any`, concentrated in the console's dev API
route handler. None is a defect. Recording it so that "0 errors" is not read as
"clean".

### A-8 — "Byte-identical across 100 runs" credits the wrong test · S5

Detailed in Q1. The 100-run test covers one fixture; breadth comes from the
27-case corpus. Both facts are good; the sentence in `CAPABILITIES.md` implies
the first carries the claim.

### A-9 — No capability row covers the flow-test gate · S5

`registry.publish` runs a version's attached test cases and refuses the publish
if any fail (`d11ef80`, W-023). `CAPABILITIES.md` has a row for it under §11
Governance, added in the same commit — so this is *not* a missing row. Verified
present. Recorded here only because the brief asks for capabilities found that
are not in the map, and the answer is: none.

---

## 6. Capabilities present but not in `CAPABILITIES.md`

**None found.** Every capability encountered while running the suites has a row.
Three were added during the same session that wrote them — flow-test gate,
approved default for a missing score, catalogue durability — and each row names
its check.

The reverse also holds: no row was found describing something that does not
exist. Every row sampled resolved to a real file.

---

## 7. What Phase A did not establish

Recorded as uncertainty rather than left implied, per brief §1.3.

- **Whether the two E2E flakes are timing or a race.** Both passed on re-run;
  distinguishing the causes needs instrumentation that Phase A may not add.
- **Whether the 12 lint warnings hide anything.** They were counted, not read.
- **Tenant isolation.** The brief's Appendix 3 asks whether it is enforced at
  the data layer and tested. The catalogue and registry suites assert
  tenant separation on reads; whether *every* store path is isolated was not
  systematically verified here and belongs to Phase D.
- **Whether `packages/nodes-core` is reachable at all.** It is imported by
  nothing but its own name as a version range, which `gaps.md` records. Phase A
  did not confirm whether its code is dead or merely unused.

---

## 8. Summary

Of the eight Foundation MVP capabilities, **seven are CONFIRMED** by a check
that goes red when the capability is broken. One — canonical taxonomy — is
**WEAKER-THAN-CLAIMED**: real, complete, and guarded by nothing.

Both exit criteria the brief expected to be unmet are **met and honestly
bounded**.

Two S1 findings, both of the same species: a check whose stated purpose is
defeated in the case it was written for. Neither is a capability that does not
work. Both are capabilities that would stop working without anything noticing,
which is the failure mode this project has already been bitten by five times
and records in `CAPABILITIES.md` under "Known holes".
