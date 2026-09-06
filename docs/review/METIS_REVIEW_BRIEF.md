# METIS — Full platform review and remediation brief

> **Adopted into the repo 2026-09-06.** The brief below is kept verbatim. It was
> written against an earlier state of the tree, and seven of its premises have
> since moved. Recording that here rather than editing the brief, because a
> fresh Phase A session would otherwise spend its effort re-verifying settled
> things — or, worse, "confirm" a premise that is no longer true. Checked
> against the tree, not from memory:
>
> | Premise in the brief | State on adoption |
> |---|---|
> | Delete `PHASES_SUMMARY.md` before starting | Already deleted 2026-09-05 (`7330292`). W-000's surviving half — a CI check that only the capability map claims BUILT — is done: `tests/docs-status.test.ts` (`9dfc3bb`) |
> | "the claimed 599 tests" | Now **704**. Paths, operations and schemas unchanged at 34 / 41 / 46 |
> | Export/re-import and S1 are "the two unmet exit criteria" | Both now met and **bounded**, with the bounds stated in `CAPABILITIES.md` (`a9b7625`, `0e8addc`). Phase A should test whether those bounds are honest, which is a better question than whether the criteria are unmet |
> | §5.1 the console's hand-written client URLs | Gone. `api-client.ts` derives path *and* method from `OPERATIONS` (`20f9f66`), and the check inverted to "no hand-written paths remain" |
> | §5.2 in-memory catalogue and policy store | Half addressed. `packages/catalogue` is durable and tested against memory and PostgreSQL (`bbb5ac1`). The console is **not** repointed, and `gaps.md` records why that is a design question rather than a swap: the console edits a catalogue the engine does not read |
> | §5.4 append-only versus erasure, unresolved | ADR-004 proposes crypto-shredding, **Proposed not Accepted** (`3c599c3`). Phase D's actual question — can the current schema support it without migrating existing records — is still open and still right |
> | §5.7 bench untyped, no bundle check, axe covers one route, no i18n | First three closed in W-001 (`7edb768`, `c1fe678`), each verified to bite. i18n has ADR-005, Proposed (`391c955`), deliberately unimplemented because `CLAUDE.md` forbids a one-off mechanism |
>
> **Two things the brief does not know about, and should.** The test suites had
> been running **stale compiled JavaScript** that shadowed the TypeScript source
> — a `throw` planted at the top of `execute` changed nothing, and four tests
> passed against code that could not run (`660e56f`). It is now guarded by
> `tests/source-hygiene.test.ts`. And W-023 landed a flow-test gate on publish
> (`d11ef80`), which Phase C's *Simulate* column and Phase D's governance-path
> check should both take account of.
>
> Everything else stands. The method in particular — findings first, fixes only
> in Phase E, one fresh session per phase — is right, and §1.2 ("verify the
> checks bite") is the discipline that has found every significant defect in
> this project so far.

---

**For:** Claude Code, running as the reviewing and remediating agent.
**Inputs it must read first:** `docs/CAPABILITIES.md`, `docs/BACKLOG.md`,
`docs/gaps.md`, `docs/adr/`, `docs/metis-api.openapi.yaml`, `CLAUDE.md`,
`METIS_Vision_and_Build_Plan.md`.
**Input it must not read:** `PHASES_SUMMARY.md`. Delete it before starting
(W-000). It claims Phases 0–4 complete, including capabilities that
`CAPABILITIES.md` marks OUT OF SCOPE, and an agent that reads it will build on
things that do not exist.

**The question this review answers:** what stops METIS being a complete
decisioning *and* marketing platform that a business user can configure entirely
from the screen, in the way Pega CDH can be — and what in the current
architecture will prevent that if left alone.

---

## 0. How to run this

Do not attempt this in one session. It will exceed useful context and the
findings will degrade toward the end, which is the worst place for them to
degrade. Run six phases, each a fresh session, each ending in a committed
artifact so nothing depends on a previous session's context surviving.

| Phase | Output artifact | Fixes allowed? |
|---|---|---|
| A | `docs/review/VERIFIED_STATE.md` | No |
| B | `docs/review/GAPS_PLATFORM.md` | No |
| C | `docs/review/CONFIGURABILITY.md` | No |
| D | `docs/review/ARCH_REVIEW.md` + draft ADRs | No |
| E | Code, tests, ADRs | Yes, and only here |
| F | Updated `CAPABILITIES.md`, `BACKLOG.md`, `gaps.md` | Docs only |

**Phases A–D are read-only.** The single most common failure mode in a review of
this size is that the agent starts fixing something interesting in hour two and
never completes the survey. Findings first. The fix list is chosen from a
complete picture or it is chosen from whatever was encountered first.

Commit after each phase. If a session is lost, the next one starts from the
committed artifact, not from scratch.

---

## 1. Ground rules for the review

1. **Evidence, not documentation.** A capability is BUILT if a named check fails
   when it breaks. Run the suites. Where a doc and a test disagree, the test is
   right and the doc is a finding.
2. **Verify the checks bite.** For every claim you are asked to confirm, break
   the thing and confirm the check goes red. A check that appears to run and
   does not is worse than no check — `CAPABILITIES.md` already lists five of
   those, found the hard way.
3. **Record uncertainty as uncertainty.** "I could not determine whether X is
   guarded" is a valid and useful finding. An invented confirmation is not.
4. **Severity is about consequence, not effort.** See §6.
5. **Every finding names a file and a line, or it is not a finding.**
6. **Do not fix during A–D.** Write the finding. If something is a five-minute
   fix, note it as such and leave it; batching them into Phase E is cheaper than
   losing the survey.

---

## 2. Phase A — Verify the baseline

The purpose is a state of the repo you can trust before comparing it to
anything. `CAPABILITIES.md` is the most honest document in the project, and it
is still a claim.

Run everything: `npm test`, `npm run test:e2e`, `npm run bench`,
`npm run typecheck`, `npm run lint`, `./gradlew test`. Record actual counts
against the claimed 599 tests, 34 paths, 41 operations, 46 schemas.

Then verify, individually, each of the eight Foundation MVP capabilities in §13
by breaking it and confirming a named check fails:

- canonical taxonomy, open contracts, versioned catalogue/policy AST,
  deterministic runtime, decision ledger, replay, idempotency, shadow mode.

And each of the two unmet exit criteria (export/re-import, S1 benchmark) —
confirm they are genuinely unmet rather than partially present and unrecorded.

Specific things to check, because each is a place where a true claim can quietly
become false:

- Does the determinism test actually cover the paths that would break it, or
  only a narrow fixture? Byte-identical across 100 runs of *what*?
- Do the two engines agree on the *current* corpus, or on a stale one? When did
  the corpora last change, and did both engines regenerate?
- Is `decision-conformance.test.ts` still asserting that every one of the 8
  reason codes is exercised, and does it fail if a ninth is added unexercised?
- Does `e2e/contract.spec.ts` cover all 39 built operations, or a subset?
- Is the append-only trigger tested by attempting an `UPDATE`, or asserted by
  reading the migration?
- Is the shadow-mode divergence assertion still verified to bite?

**Output:** `docs/review/VERIFIED_STATE.md`. A table of every claim in
`CAPABILITIES.md` with: claim, verification method, result (CONFIRMED /
WEAKER-THAN-CLAIMED / UNVERIFIABLE / FALSE), and evidence. Plus a list of
capabilities you found that are not in `CAPABILITIES.md` at all.

---

## 3. Phase B — Gap analysis against a complete platform

Compare the verified state against the reference model in Appendix 1. Do not
compare against the vision document; it is a plan, and a plan agreeing with
itself proves nothing.

For each reference-model line, record: PRESENT / PARTIAL / ABSENT, what exists,
what a buyer would find missing in an evaluation, and — this is the part that
matters — **what in the current architecture blocks it**. A gap that is just
unwritten code is cheap. A gap that requires a storage or contract change is
expensive and belongs in Phase D.

Pay particular attention to the boundary this project has not yet crossed:
METIS is currently a decision engine. A marketing platform additionally needs
audiences, content, delivery, scheduling, response capture and measurement. Be
concrete about which of those are absent versus scaffolded.

**Output:** `docs/review/GAPS_PLATFORM.md`, ordered by what an evaluation would
surface first, not by build order.

---

## 4. Phase C — The configurability audit

**This is the phase with a new requirement in it, and it is the one most likely
to change the architecture.**

The requirement: *every aspect of METIS must be configurable from the screen by
a business user, as Pega CDH is.* Not "has an API and eventually a UI". The
console is the primary interface for configuration, and the API exists to serve
it and to allow automation, not to replace it.

Today the canvas is read-only, node positions are authored in fixtures, the
catalogue and policies live in an in-memory store, and `/simulations` is a
proposed operation nothing serves. So the honest starting point is that almost
nothing is configurable from the screen.

### 4.1 The audit itself

Build the matrix in Appendix 2: every configurable object type × every lifecycle
operation × whether it can be done from the console today, from the API only, or
only by editing a fixture or code. Fill it in by trying, not by reading.

### 4.2 The architectural question this phase must answer

There are two ways to reach screen-configurability and they diverge early.

**Hand-built screens per entity.** Fast for the first six objects, then linear
forever. Every new node type, channel, model provider or pack needs a
bespoke form. The package system in W-038 then cannot deliver a genuinely new
configurable object, because a package can ship a node type but not the screen
to configure it. This path quietly caps the platform at whatever the core team
has built forms for — and it is the default path, because it is what you get by
building screens one at a time without deciding not to.

**Metadata-driven rendering.** Every configurable object declares a typed
schema; the console renders create, edit, validate, diff, version, approve and
simulate surfaces *from* that schema. A package that ships a new node type ships
its schema, and it is configurable on arrival with no console change. This is
substantially how CDH's configurability actually works, and it is what makes
"configurable in every aspect" a property of the architecture rather than a
promise about future sprints.

**Phase C must determine which path the codebase is currently on**, how far down
it, and what the cost of changing is. My expectation is that the console is on
the first path by default and that the cost is low right now and rises steeply
once Stages 13–18 add a dozen more object types. If that is what you find, it is
the single highest-value finding in this review and it needs an ADR.

Check specifically:
- Are the console's forms hand-written per entity, or generated?
- Does the OpenAPI spec carry enough type information to render a form, or would
  a separate schema layer be needed?
- Do the artifact schemas distinguish "config a business user sets" from
  "internal structure", or would generated forms expose internals?
- Is there any concept of a field-level permission or an autonomy-tier gate on a
  form field? The L0–L4 ladder exists per scope; does it reach the UI?
- Can a change made in the console produce the same change set as one made by an
  agent, through the same `/approvals` path? It must, or there are two
  governance regimes and only one is audited properly.

**Output:** `docs/review/CONFIGURABILITY.md` — the filled matrix, the path
determination, the cost estimate for the metadata-driven path now versus after
Stage 18, and a draft ADR.

---

## 5. Phase D — Architecture and technical review

Now review the code as code. Appendix 3 is the checklist. Named suspects,
because they are visible from the documentation and should be either confirmed
or cleared early:

1. **Four components must agree on API paths and one typecheck covers one of
   them** — the spec, the generated client, the console's hand-written URLs, and
   the Kotlin router. The console's hand-written client is the defect; it should
   be generated.
2. **In-memory catalogue and policy store with process lifetime.** Authored
   state is lost on restart. This is a correctness problem, and it also makes
   screen-configurability meaningless — you cannot configure from a screen what
   does not survive a deploy.
3. **Replay exactness once real data exists.** Today propensity is a seeded
   function and there is no feature store, so replay is trivially exact. When
   W-009 lands, replay must read a snapshot, not the live store. Determine
   whether the record format can already carry a full input snapshot, or whether
   that is a breaking format change. If it is breaking, it is far cheaper now.
4. **Append-only versus erasure.** Unresolved, and the ledger is already
   append-only with triggers. Establish whether the current schema can support
   crypto-shredding without a migration of existing records.
5. **Two engines, one growth rate.** Every semantic addition doubles. Determine
   what the Kotlin engine's actual coverage is and what the cost per new node
   type is. If it is high, the review should say plainly whether the second
   engine remains worth it, because "cloud and runtime neutrality" is currently
   PARTIAL and rests entirely on it.
6. **Determinism under configurability.** A business user changing configuration
   from a screen produces new versions constantly. Check that version creation,
   pinning and compile are cheap enough to sit behind an interactive UI, and
   that a half-edited configuration cannot reach the registry.
7. **`bench/*` is typechecked by nothing**, route bundle size is checked by
   nothing, the axe sweep covers one route, there is no i18n mechanism. All four
   get worse with every screen added, so they precede Phase C's remediation.

For each finding: severity, blast radius, whether it is a now-or-never decision,
proposed remedy, and the test that would prove the remedy.

**Output:** `docs/review/ARCH_REVIEW.md`, plus a draft ADR in `docs/adr/` for
every finding marked as a now-or-never decision.

---

## 6. Severity

| | Meaning |
|---|---|
| **S1** | The claim in `CAPABILITIES.md` is false, or determinism/audit/tenancy can be violated |
| **S2** | Now-or-never: the cost of fixing rises sharply with more build on top. Erasure, record format, configurability path |
| **S3** | Blocks a stage in `BACKLOG.md` |
| **S4** | Correctness or quality issue with a bounded fix |
| **S5** | Noted, deliberately deferred, recorded in `gaps.md` |

S1 and S2 are fixed in Phase E. S3 folds into the backlog at the stage it
blocks. S4 is batched. S5 is written down and left alone — an honest deferral is
a finding too, and the register of them is part of what makes this project's
documentation trustworthy.

---

## 7. Phase E — Fix

Only after A–D are committed. Only S1 and S2, plus S4 items that are genuinely
under an hour and touch nothing else.

Rules, in addition to the standing rules in `BACKLOG.md` §0:

1. **Failing test first.** Write the check that proves the defect, watch it go
   red, then fix. A fix without a check that would have caught it is not a fix,
   it is a coincidence.
2. **One finding per commit**, referencing the finding ID from the review docs.
3. **Anything touching decision semantics or serialisation regenerates both
   conformance corpora and passes in both engines.** Expect chain hashes to
   change; say so in the commit message, as was done for the vendor-neutral
   rename.
4. **Anything changing the record format or storage schema gets an ADR before
   the code**, not after.
5. **Stop and report rather than expanding scope.** If a fix turns out to be
   larger than its severity implied, write it up as a backlog item and move on.
   The review's value is the survey; do not spend it on one item.

---

## 8. Phase F — Reconcile

- Update `docs/CAPABILITIES.md` so every row matches Phase A's verified result.
  Downgrade anything that was WEAKER-THAN-CLAIMED. This will feel like going
  backwards and is the most valuable output of the review.
- Rewrite `docs/BACKLOG.md`: insert the new work items, re-sequence for the
  configurability decision, remove anything the review found already done.
- Add every deferred finding to `docs/gaps.md` with a date and a diagnosis.
- Add the CI check from W-000 that fails if any doc outside `CAPABILITIES.md`
  asserts BUILT status.

---

## 9. Session prompts

Paste these. One per session, fresh context each time.

**Phase A**
> Read `docs/CAPABILITIES.md`, `CLAUDE.md`, `docs/adr/` and
> `docs/review/METIS_REVIEW_BRIEF.md`. Execute Phase A only. Run every suite and
> record actual results. Then verify each of the eight §13 capabilities by
> breaking it and confirming a named check fails; restore after each. Do not fix
> anything. Produce `docs/review/VERIFIED_STATE.md` in the format the brief
> specifies and commit it.

**Phase B**
> Read the brief and `docs/review/VERIFIED_STATE.md`. Execute Phase B only.
> Compare the verified state to Appendix 1 of the brief. For each line record
> PRESENT/PARTIAL/ABSENT, what exists, what a buyer would find missing, and what
> in the current architecture blocks it. Do not fix anything. Produce
> `docs/review/GAPS_PLATFORM.md` and commit.

**Phase C**
> Read the brief and the two prior review artifacts. Execute Phase C only. Fill
> the configurability matrix in Appendix 2 by attempting each operation in the
> console, not by reading code. Then answer §4.2: is the console on the
> hand-built or metadata-driven path, how far, and what does changing cost now
> versus after Stage 18. Produce `docs/review/CONFIGURABILITY.md` and a draft
> ADR. Do not fix anything.

**Phase D**
> Read the brief and the three prior review artifacts. Execute Phase D only.
> Work through Appendix 3 and the seven named suspects in §5. Severity-rate
> every finding per §6. Produce `docs/review/ARCH_REVIEW.md` and a draft ADR for
> each now-or-never decision. Do not fix anything.

**Phase E**
> Read the brief and all four review artifacts. Execute Phase E. Fix S1 and S2
> findings only, in severity order, failing-test-first, one finding per commit.
> If a fix exceeds its severity, stop, write it up as a backlog item, and
> continue to the next. Report what you fixed and what you deferred.

**Phase F**
> Read the brief and all review artifacts and the Phase E report. Execute Phase
> F. Reconcile `CAPABILITIES.md`, `BACKLOG.md` and `gaps.md` with what is now
> true, downgrading anything the review found weaker than claimed.

---

## Appendix 1 — Reference model: a complete decisioning and marketing platform

Compare against this in Phase B. Grouped by what an evaluation asks for.

**Data**
Profile store and versioned data model · identity resolution · online feature
service with freshness and lineage · offline store · streaming and batch ingest ·
interaction history with fast recency queries · consent and preference store ·
retention and erasure.

**Decisioning**
Eligibility, applicability and suitability as distinct layers · contact policy,
suppression, frequency caps · multi-level arbitration · channel- and
placement-specific ranking · slate and bundle selection · optimisation
constraints: cardinality, mutual exclusion, diversity, budget, inventory,
fairness · deterministic tie-breaking · prioritisation levers with immediate
simulated impact.

**Intelligence**
Model gateway and registry · ONNX and PMML import · adaptive online learning ·
contextual bandits and exploration · drift, calibration, auto-quarantine ·
champion/challenger · model shadow scoring · feature attribution reaching the
decision record.

**Content**
Action and treatment as distinct entities · per-channel treatment schema ·
content library with review, approval, effective dating, expiry, usage
tracking · personalisation tokens with a grounding contract · localisation ·
cross-channel preview · brand compliance checks.

**Delivery**
Inbound real-time containers with named placements and slots · CSR/agent-assist
surface · outbound adapters per channel · always-on outbound with volume
governance · batch decisioning · event-triggered decisioning over streams ·
paid media audience export with consent filtering · quiet hours, throttling,
retry, bounce and complaint handling.

**Campaign and journey**
Segment and audience builder · journey orchestration with waits, branches,
triggers, exits and re-entry · scheduling and calendar with conflict detection ·
A/B and multivariate testing with significance · holdouts and incrementality.

**Simulation**
Distribution test over a sampled population · version-versus-version diff by
segment · under-served analysis · bias and fairness gate before publish ·
counterfactual replay over history · flow unit tests in CI.

**Governance**
Change sets, approvals, segregation of duties · autonomy ladder · immutable
audit · branching and merge of configuration · environment promotion ·
artefact-granular RBAC and ABAC · evidence packs.

**Measurement**
Decision, delivery and response reporting · attribution · value and ROI ·
channel and segment performance · model performance · cost per decision.

**Platform**
Package system and SDK · industry and regulatory packs with change reports ·
theming, layout manifests, pluggable panels · persona workspaces ·
SSO/SCIM · multi-region residency · observability, SLOs, quotas · degradation
ladder · DR and chaos · export and re-import.

---

## Appendix 2 — Configurability matrix

Fill one row per object type. Columns are operations; cells are `CONSOLE`,
`API-ONLY`, `FIXTURE`, `CODE`, or `N/A`. Anything that is not `CONSOLE` for a
business-user object is a finding.

| Object | Create | Edit | Validate | Version | Diff | Approve | Simulate | Publish | Promote | Roll back | Delete/retire | Permission-scoped |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Decision flow | | | | | | | | | | | | |
| Node within a flow | | | | | | | | | | | | |
| Node layout / position | | | | | | | | | | | | |
| Taxonomy: issue, group | | | | | | | | | | | | |
| Action | | | | | | | | | | | | |
| Offer | | | | | | | | | | | | |
| Treatment | | | | | | | | | | | | |
| Content asset | | | | | | | | | | | | |
| Eligibility policy | | | | | | | | | | | | |
| Applicability policy | | | | | | | | | | | | |
| Suitability policy | | | | | | | | | | | | |
| Contact policy | | | | | | | | | | | | |
| Frequency cap | | | | | | | | | | | | |
| Consent type | | | | | | | | | | | | |
| Ranking function | | | | | | | | | | | | |
| Lever / weighting | | | | | | | | | | | | |
| Arbitration level | | | | | | | | | | | | |
| Constraint | | | | | | | | | | | | |
| Segment | | | | | | | | | | | | |
| Journey | | | | | | | | | | | | |
| Campaign / schedule | | | | | | | | | | | | |
| Experiment / holdout | | | | | | | | | | | | |
| Channel config | | | | | | | | | | | | |
| Placement / slot | | | | | | | | | | | | |
| Model binding | | | | | | | | | | | | |
| Feature definition | | | | | | | | | | | | |
| Data source / connector | | | | | | | | | | | | |
| Profile schema | | | | | | | | | | | | |
| Tenant settings | | | | | | | | | | | | |
| Autonomy tier per scope | | | | | | | | | | | | |
| Role and permission | | | | | | | | | | | | |
| Approval quorum | | | | | | | | | | | | |
| Retention policy | | | | | | | | | | | | |
| Theme | | | | | | | | | | | | |
| Layout / workspace | | | | | | | | | | | | |
| Package install | | | | | | | | | | | | |

Then answer, in prose:
- Which of these could a package introduce as a *new* type, and would it be
  configurable from the console on arrival, or would it need console work?
- Which cells require a developer today, and is that deliberate or accidental?
- Where a cell is `CONSOLE`, does the change flow through `/approvals` and the
  audit log identically to an API or agent change?

---

## Appendix 3 — Architecture review checklist

**Determinism and replay.** Every input to a decision snapshot-able · no wall
clock, no unseeded randomness, no map iteration order dependence in the decision
path · replay reads snapshots not live stores · both engines agree on the
current corpus · canonical serialisation per ADR-003 applied everywhere it
should be.

**Contracts.** Spec is the source of truth · client generated · no hand-written
URLs anywhere · every served operation contract-tested in both directions ·
versioning strategy for breaking changes · the Kotlin router in the same check
as everything else.

**Storage.** No process-lifetime state that a user can author · append-only
enforced at the schema · unreachable store is an error not a fallback · tenant
isolation enforced at the data layer, not in application code, and tested ·
migrations reversible · erasure design settled.

**Governance path.** Exactly one path to a published version, whether the change
came from the console, the API or an agent · autonomy tier consulted server-side
· refusals audited, not only successes · no way to publish something that did
not compile.

**Performance.** Hot path free of network calls other than configured storage ·
latency gate meaningful at realistic candidate and profile counts · degradation
path defined for every dependency · nothing unbounded in the decision path.

**Extensibility.** Extension points declared and typed, not discovered · core
contains no reference to any specific channel, model provider or pack · a new
node type requires changes in a bounded, documented set of places — count them,
that number is the composability claim.

**Console.** Forms generated or hand-written · state management coherent ·
accessibility across all routes and modes · i18n mechanism · bundle budgets ·
optimistic updates cannot diverge from server truth · a half-edited artifact
cannot reach the registry.

**Operability.** Structured logs with correlation to `decision_id` · metrics for
every stage · configuration by environment, secrets never in code · health and
readiness distinct · a deploy that fails rolls back without manual steps.

---

## Appendix 4 — What this review must not do

- Rewrite the Kotlin engine, or drop it, without an ADR that survives §5.5.
- Change canonical serialisation for aesthetic reasons. It is normative and
  every chain hash depends on it.
- Add a capability during Phase E. Fix findings; build in stages.
- Soften a finding because fixing it is inconvenient. The value of
  `CAPABILITIES.md` is that it has been willing to say PARTIAL. Preserve that.
- Mark anything BUILT without the check that fails when it breaks.
