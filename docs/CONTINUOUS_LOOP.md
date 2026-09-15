# Metis — Continuous Review and Development Loop

**Purpose:** a standing directive so sessions no longer need a hand-written one. Point Claude Code at this file at the start of every session with: *"Run the loop."*

**Place it at:** `docs/CONTINUOUS_LOOP.md`, referenced from `CLAUDE.md`.

---

## 0. Precedence

When documents conflict:

1. `CLAUDE.md` (the working agreement) and accepted ADRs.
2. This document.
3. `METIS_Vision_and_Build_Plan.md` §§1–4 — binding architecture.
4. `UX_CONTRACT.md`, `METIS_CONSOLE_SPEC.md`, `JOURNEY_SPINES.md`, `BACKLOG.md`.
5. Everything else.

`PHASES_SUMMARY.md` sits outside this order. It claims all phases complete; that claim is false and is the reason the conformance gate exists. It is a historical record of a failure mode, not a source. Never cite it as evidence that something is built.

---

## 1. Ground truth before anything (Rule 11, generalised)

No claim is treated as true because a document, a directive, or a previous session summary says it. This includes claims written by the owner and claims written by Claude Code last week.

**Every session opens with a status read, before any work is selected:**

```
git log --oneline <last-session-sha>..HEAD
gh pr list --state open
npm run demo:claims        # regenerates docs/DEMO_CLAIMS.md + conformance
npm run gates:quick
```

Then report, in the first message of the session:

- what merged since last time;
- the current claims-sheet counts (demonstrable / unproven / not built / disagreements) and the delta;
- the conformance count and the delta;
- **every place a directive or document disagrees with the tree**, named individually.

If the directive for the session contains a factual premise that the tree contradicts, say so and stop for correction before building on it. A premise that is wrong at the start produces work that is wrong at the end.

---

## 2. Ranking of sources

| Rank | Source | Standing |
|---|---|---|
| 1 | The tree, and a named check that fails when the thing breaks | Authoritative |
| 2 | Generated artifacts — `DEMO_CLAIMS.md`, `bench/results/*.json`, conformance output | Authoritative **as of the timestamp in the artifact**, and no longer |
| 3 | Hand-authored docs — `CAPABILITIES.md`, `JOURNEY_SPINES.md`, `docs/gaps.md`, `BACKLOG.md` | Claims awaiting verification |
| 4 | `METIS_Vision_and_Build_Plan.md`, proposals, decks | Intent, never state |
| 5 | `PHASES_SUMMARY.md` | Not a source |

A number without a scope statement is not a number. Benchmark artifacts carry their own header saying what was excluded, which tenant and dataset, which machine, and whether the machine was quiet. In-process engine timings are never quoted as system timings.

---

## 3. The loop

Six steps. One pass per session; several passes per week.

### 3.1 Review
The status read from §1. Read-only. No product code is touched in this step.

### 3.2 Select
Pick the next work in this order. Stop at the first category that has anything in it.

1. **Regressions** — anything that would reopen a closed journey spine.
2. **The nearest unblocked step on the active spine.** One spine at a time; a second is not opened while one is in progress.
3. **Conformance failures on screens belonging to the active spine.**
4. **Disagreements between a document and the tree** (fix the document or fix the tree — decide which, and say which).
5. **Table-stakes gaps with no screen** — screen configurability is the differentiator, so a capability that exists only behind an API is not finished.
6. Everything else, by `BACKLOG.md` order.

Never select work because it is quick to finish. Never select work that only moves a number on a sheet.

### 3.3 Confirm
Post the plan as a short list of workstreams (W-numbers), each with: what will change, which files, which check will prove it, and which tier it falls in (§6). Then act according to tier — T3 proceeds, T2 proceeds within the stated bounds, T1 waits.

**A defect list is always a stop.** Read-only audits produce a list and end there. No product code changes until the owner names the items to fix.

### 3.4 Build
- One workstream per branch. Branches are not switched while a dev server or walker is running against the tree.
- One machine: a benchmark run and a Playwright walk do not run at the same time. Whichever is running holds the machine; the other waits and says so.
- Fix defects visibly. Surfacing a problem on a screen beats deleting the data that reveals it.
- Vertical slices only. A layer with no screen is not a deliverable.
- No LLM in the decision hot path, ever. If a feature seems to need one, it belongs in the authoring plane.

### 3.5 Prove
A capability is BUILT when a **named check fails if it breaks**. Not when the code exists, not when a screen renders, not when prose describes it.

Every change ships with the §8 checklist satisfied. A claim in `CAPABILITIES.md` that cites no check lands in "built but unproven" — which is where it belongs until someone writes the check.

Tests are never edited to make a change pass. If an expectation is genuinely wrong, that is a T1 item: say so, propose the new expectation, and wait.

### 3.6 Report
The session report in §7. Then update the status artifacts by regenerating them, never by hand.

---

## 4. Standing rules

Carried forward from prior sessions; they do not need restating in a directive.

- **Status is emitted by tooling, never authored by hand.** If a status table exists outside a generated file, that is a defect.
- **Read-only evaluation precedes remediation.** Audit, list, stop, then fix what was confirmed.
- **API before UI, never API instead of UI.** Every capability is configurable from the screen.
- **Grounded commitments.** Prices, eligibility, terms, quantities come from a system of record with a recorded version. Never generated.
- **Explanation is emitted, not reconstructed.** If it affects a decision, it appears in the trace.
- **Numbers are committed as measured, not as tuned.** Machine noise is recorded in the artifact.
- **Nothing on the do-not-touch list is started.** The list is restated in each session report, even when empty.
- **Temporary scripts stay uncommitted** and the tree is confirmed clean before the report.

---

## 5. What requires the owner

Claude Code proposes; it does not decide these.

- Architectural forks worth an ADR.
- Which defects from an audit list to fix.
- Any change to what a test expects.
- Regenerating seeded data (every seeded decision's hash changes).
- Deleting data rather than surfacing the defect it reveals.
- The five open strategic decisions: segment focus; layer-above-incumbent as a deliberate entry; adaptive models build vs. integrate; open core; pricing model. These are recorded as open in every session report until answered, because §9 sequencing depends on them.

---

## 6. Autonomy tiers for the loop

The loop runs under the same ladder as the product's change workflow.

**T3 — act, report afterwards**
Status regeneration; read-only audits and walks; listing doc-vs-tree disagreements; benchmark re-runs; adding a check that proves existing behaviour without changing it; documentation generated from typed contracts.

**T2 — act within stated bounds, escalate outside them**
Label and wording corrections on screens already inside the active spine; removing controls that are disabled with a "not built" tooltip; adding a cited check to a claim currently classed as unproven. Bounds are stated in the plan before acting.

**T1 — propose and wait**
DIR schema or node contracts; arbitration, scoring or eligibility behaviour; seeded data regeneration; anything that changes a test expectation; new packages; deletions; anything touching a closed spine.

When a task's tier is unclear, it is T1.

---

## 7. Session report

Always these headings, in this order.

**Landed** — PR number, SHA, what it proves, and the check that proves it.

**Failed** — including the loop's own failures (broken walker scripts, bad locators, failed branches). Distinguish a product failure from a tooling failure explicitly.

**In progress** — branch name, what remains, what it is waiting on.

**State of truth**

| | This session | Last session | Δ |
|---|---|---|---|
| Demonstrable today | | | |
| Built but unproven | | | |
| Not built | | | |
| Doc/tree disagreements | | | |
| Conformance failures | | | |
| Spines closed | | | |

**Not done, and why** — each item with its reason: waiting on the owner, out of scope, moved to a date, or on the do-not-touch list.

An unchanged number is reported, not omitted. Flat weeks are information.

---

## 8. Definition of done

Every capability ships with:

1. Public API before UI, and a screen that configures it.
2. Generated OpenAPI spec, not hand-written.
3. Deterministic unit tests plus at least one simulation fixture.
4. Trace contribution, if it affects a decision.
5. Load-test coverage, if it touches the hot path.
6. Documentation generated from the typed contract.
7. Audit events for every state change.
8. Tenant isolation test.
9. WCAG 2.2 AA check, if it has a UI.
10. A rollback path.
11. A named check in `CAPABILITIES.md` — otherwise the row stays unproven.

---

## 9. Cadence

- **Per session:** one loop pass. Two or three W-numbered workstreams at most, each independently mergeable, each with a stated dependency order.
- **Weekly:** regenerate the claims sheet and the benchmark; review the drift register (§10); close or re-plan the active spine.
- **Monthly:** re-score against the capability taxonomy; review the ADR log for decisions that reality has overtaken.

---

## 10. Drift register — failure modes to check for every week

These are the ways this project has gone wrong before, or plausibly will.

| Mode | Symptom | Check |
|---|---|---|
| Claims drift | Docs describe capability the tree lacks | Claims sheet disagreement count |
| Scaffolding as built | A screen renders with fixture data and no engine behind it | Does a named check fail when the engine is removed? |
| API-instead-of-UI | Capability configurable only by editing JSON | Configurable-without-code count |
| Easy-thing selection | Several small merges, spine unchanged | Spines closed, week over week |
| Benchmark scope creep | In-process numbers quoted as system numbers | Scope header present and enforced by test |
| Expectation editing | A test changed in the same commit as the code it guards | Review any diff touching both |
| Working-tree interference | Branch switched under a running server; walker failures read as product failures | Tooling failures reported separately |

---

## 11. First run

On the first pass under this document, before selecting any work:

1. Run the §1 status read and publish the baseline table in §7 with the "last session" column empty.
2. Confirm with the owner: the do-not-touch list, the active journey spine, and whether the tier assignments in §6 are right.
3. Record the baseline SHA in the session report so the next pass has a `git log` anchor.

---

*Agents author. A deterministic engine executes. Everything explains itself — including this loop.*
