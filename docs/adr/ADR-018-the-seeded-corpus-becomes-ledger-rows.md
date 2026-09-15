# ADR-018: The seeded corpus becomes ledger rows, and screens read only the ledger

**Status:** Proposed
**Date:** 2026-09-15 (proposed)
**Owner:** The product owner, who picks the data-layer slices from the survey of 2026-09-15.
**Decision needed by:** before slice 2 of the data-layer order starts. Slice 2 builds the seed job and moves decision search onto the ledger, and every clause below is a choice slice 2 would otherwise make by accident.
**Constrains:** `apps/console/mocks/fixtures/engine.ts`, `outcomes.ts`, `decisions.ts` and `decision-index.json`; `apps/console/scripts/build-decision-index.mjs`; `apps/console/mocks/provenance.ts`; the decision search, trace, outcomes, performance, policy funnel and flow volume handlers in `apps/console/app/api/[...path]/route.ts`; `packages/ledger`; `scripts/build-service-bundle.mjs`; the e2e harness (`apps/console/playwright.config.ts`); and every test that pins the committed index.
**Arises from:** the data-layer survey of 2026-09-15, under the directive of the same date. Related: [G-118](../gaps.md), [G-068](../gaps.md), [ADR-008](ADR-008-closing-the-outcome-loop.md) §6, [ADR-013](ADR-013-delivery.md), [ADR-016](ADR-016-deployment-operations-and-scale.md).

## Context

**Every decision figure on the console comes from a projection, not from the ledger.** The generator in `apps/console/mocks/fixtures/engine.ts` makes 10,400 decisions (`DECISION_COUNT`, line 408). Each one is a real execution of a live flow over the fixture catalogue, from a request built from a seed: `buildRequest` and `executeAt`, dated over the 24 months before 2026-09-04 (lines 117–120). A committed index, `decision-index.json` (1.5 MB, written by `apps/console/scripts/build-decision-index.mjs`), holds one flat row per decision. A full trace is re-executed from the generator when someone opens one.

The ledger holds almost none of it:

- **Decision search reads only the index.** The `decisions` case in `route.ts` filters `decisions`, the index rows, and never queries the ledger. A decision the platform actually makes can be opened by id, but it never appears in `/decisions`.
- **Performance, the policy funnel and flow volume merge the index with the ledger.** They deduplicate by decision id (`route.ts`, the `performance` case, and the `policy-funnel` and `flow-volume` cases).
- **Outcomes are invented at read time.** `seededOutcomesFor` in `outcomes.ts` generates events from `seededUnitInterval`: on 2026-09-15, 1,654 events across 1,228 of the 4,688 decisions that offered something (1,228 impressions, 278 clicks, 80 rejections, 44 acceptances, 24 conversions). They are never written.
- **A seeded decision reaches the ledger only when someone posts an outcome against it.** The `POST /outcomes` handler materialises it first, so the ledger's rule that an outcome joins a decision holds (`route.ts`, around line 1862).
- **"Synthetic" is decided by membership.** `provenance.ts` labels a decision synthetic if its id is in the committed index, and recorded otherwise.

Four facts about the ledger constrain any replacement:

- `DecisionLedger.record` reads before it writes, and refuses a different chain hash under an existing id (`packages/ledger/src/ledger.ts`, lines 77–103).
- `recordOutcome` and `recordDelivery` each refuse an event whose decision the ledger does not hold (lines 122–160).
- A ledger store has a data class, `synthetic` or `real` (`create-store.ts`, line 40). The subject hash is unkeyed and the raw customer reference sits in the stored record (G-068), which is why `real` is refused while `SUBJECT_PROTECTION` is `none`.
- `recordDeliveryFor` in `route.ts` records `dispatched` for a slot with a deliverer and `suppressed: no_adapter` for one without, stamped with the wall clock. The generator's three slots are `account_dashboard_hero` (web, `delivery: { mode: 'caller' }`), `weekly_offers_send` (email, `delivery: null`) and `triggered_outbound` (sms, `delivery: null`) (`apps/console/mocks/fixtures/catalogue.ts`, lines 1096–1154).

**Measured on 2026-09-15**, on the Windows development machine under other load, one connection, one write at a time:

| Where | Decisions | Execute | Record decisions | Record outcomes | Open |
|---|---|---|---|---|---|
| PostgreSQL | 1,000 | 0.69 ms each | 2.09 ms each | 2.35 ms per event (178 events) | 3.1 s |
| Projected to 10,400 | 10,400 | 7.2 s | 21.7 s | 4.4 s | 3.1 s |
| Memory | 10,400 | 11.9 s | 0.2 s | 0.3 s (1,654 events) | — |

A PostgreSQL seed of today's size costs about 36 seconds, once. A seed into memory costs about 12 seconds, almost all of it engine execution, every time a process that holds its ledger in memory starts.

**The e2e harness has no database.** `playwright.config.ts` starts `next dev` with `METIS_DATA_CLASS: 'synthetic'` and no `METIS_DATABASE_URL`, and CI's `e2e` job has no PostgreSQL service. Every e2e server holds its ledger in memory and starts it empty.

**The conformance corpora are separable from the index.**
- `docs/conformance/canonical-corpus.json` and `decision-corpus.json` are hand-built cases (`scripts/build-conformance-corpus.mjs`, `scripts/build-decision-corpus.mjs`).
- `service-cases.json` samples decisions through `executeAt` from the fixture catalogue and artifacts (`scripts/build-service-bundle.mjs`). It depends on the generator, not on the committed index.

## Decision

### 1. The ledger is the only decision history a screen reads

Decision search, a trace, outcomes, deliveries, performance, the policy funnel and flow volume read the ledger and nothing else. When the move is complete (clause 6), these are deleted:
- the committed index and its builder;
- the index branches in those handlers, including `findTrace`'s re-execution for a seeded id;
- the read-time outcome projection;
- provenance by id membership;
- the materialise-on-first-outcome branch in `POST /outcomes`.

**The mistake this prevents** is a second source that "only fills in" history. Two sources that agree today disagree the first time one is edited, and a report that joins both has no single place where a number can be traced to.

### 2. A seed job writes the corpus through the ledger's own operations

`seedLedger`, beside the generator in `apps/console/mocks/`, takes a ledger and a count. For each generator slot, in order, it:
1. executes the slot with `executeAt`: the same request, the same flow, the same catalogue snapshot as today;
2. writes the result with `DecisionLedger.record(ledger.entryFor(trace, tenantId))`;
3. writes the delivery for the request's placement through `recordDelivery`, with the state `recordDeliveryFor` would choose, and `at` set to the decision's `occurredAt` rather than the wall clock;
4. writes that decision's outcomes through `recordOutcome` (clause 5).

**N is 10,400.**
- **It is cheap enough.** The measured PostgreSQL cost is about 36 seconds, once. Recording in memory costs under a second; the 12 seconds there are execution, which any N pays in proportion.
- **It keeps the transition diffable.** Every id, count and rate is identical before and after, so clause 6 can assert "unchanged" rather than argue "plausibly similar".
- **The screens need thousands.** The virtualised grid, search facets, latency percentiles and a funnel whose later stages are not single digits all need that volume, and that is why the generator was sized at 10,400 (`engine.ts`, the comment above `DECISION_COUNT`).

**It does not decide through `decideAndRecord` or the decision service.** Both resolve integrations before executing (`resolveAndExecute`). The generator's requests already carry the recorded connector values, so re-resolving them would change the inputs, the ids and every chain hash, and `service-cases.json` would stop agreeing with the ledger. Clause 4 depends on not doing this. When the decision service owns decisions (ADR-016 §1), the job may send its recorded inputs through it; that is a later change, and it must predict and diff any hash that moves.

### 3. Where it runs, and when it refuses

- **Over PostgreSQL**, the job is a one-shot command, `npm run seed:ledger`. It applies the rule the catalogue and registry sources already apply (`catalogue-source.ts`, `registry-source.ts`):
  - a tenant whose ledger holds no decisions is seeded;
  - a ledger that holds any is left as found, and never topped up or partly reseeded.
- **It refuses** in each of these cases, saying why:
  - a ledger whose data class is `real`;
  - a stored catalogue whose snapshot hash differs from the generator's `catalogueSnapshot`;
  - an active flow version that differs from the one the generator executes.

  A seed judged against a catalogue somebody edited would record decisions that catalogue could not have made.
- **In memory** (a console with no database, and every e2e server), the store runs the job at start when `METIS_SEED_LEDGER` is set, and `ledgerReady` resolves only after it has finished.
  - **Who sets it:** the development script and the e2e harness.
  - **Who does not:** unit test files that import the store. Twelve seconds per file is the cost G-133 showed a suite cannot absorb.
  - **A unit test that needs seeded decisions** seeds a small, declared count itself.

### 4. What stays reproducible, and what does not

**Reproducible**, given the same generator, fixture catalogue and flows:
- which decisions exist, with their ids, chain hashes, input and catalogue snapshot hashes, and `occurredAt`;
- each decision's delivery state and time;
- every outcome event, with its type, time and value.

The chain hash already covers only the reproducible part of a record, so writing it to a store moves no hash.

**Not reproducible:**
- row insertion order and insertion time;
- the per-node timings a trace records, which are measured when the job runs and are already outside the hash;
- anything about a tenant whose catalogue or flows were edited before seeding. Clause 3 refuses that case rather than recording it.

**The conformance corpora do not change.**
- **The canonical and decision corpora** are hand-built and never read the generator.
- **The service cases** keep being built from the generator, which stays. It is now the seed job's input as well, so the service bundle and the seeded ledger draw from one source and cannot disagree.

**This ADR predicts no chain hash moves, and slice 2 proves it.** Before the index is deleted, a test compares the seeded ledger with the committed index: the same 10,400 ids, the same chain hashes, the same winner, channel, placement and time per row. It replaces `decision-index.test.ts`, which today holds the index equal to the generator.

### 5. Outcomes: still invented, and said so; what changes is the path

**The seeded outcomes stay synthetic.** No customer produced them, and moving them into the ledger does not make them evidence. This ADR does not claim otherwise. What it changes is where the invention is allowed to live:

1. **One declared model, applied once, and read by no report.** The rules and parameters now in `outcomes.ts` move unchanged into one module, `apps/console/mocks/synthetic-customers.ts`: channel coverage, the conditional rates, the churn penalty, the poor performer, and the value on conversion. The seed job applies it. No report, handler or screen imports it; they compute from ledger rows only. Today the report calls the generator. Afterwards the report cannot tell a generated click from a real one, which is why rule 4 is needed.
2. **Written through `recordOutcome`**, the operation a real producer uses, so the ledger's invariant holds for every event.
3. **Gated by the ledger's own delivery record, not by a copy of the channel rules.** An outcome is generated only for a decision whose delivery attempt is `dispatched`. In this tenant that is the web slot only, because email and sms have no deliverer. The projection re-derives "only where something delivers" (`outcomes.ts`); this reads the record ADR-013 already requires.
4. **Labelled by data class, not by id membership.** Provenance comes from the ledger's data class: a `synthetic` ledger marks every figure it produces synthetic.
   - **What that includes:** a decision a person makes in the seeded tenant afterwards is labelled synthetic too. That is correct, because the tenant is synthetic.
   - **What cannot happen:** a `real` ledger refuses the job (clause 3), so a real tenant can never hold seeded rows.

**The honest reading:** the numbers on screen are the same before and after this ADR. What becomes real is the path. Reports join decisions, deliveries and outcomes the way they will for a real tenant, and the invented behaviour is confined to one model that runs once.

### 6. The transition: no screen empties

**Slice 2** builds the seed job and moves decision search onto the ledger.
- **Memory seeding:** the development script and the e2e harness seed the in-memory ledger in the same slice. Search therefore has the same 10,400 rows the index had, and `/decisions` totals stay the same, including the e2e assertion "of 4,688".
- **Performance, the policy funnel and flow volume** still merge the index with the ledger in slice 2. Both now hold the same ids, so the existing id deduplication keeps their counts unchanged. Slice 2 carries a test that fails if they move.

**Slice 3** points performance, the policy funnel, flow volume and outcomes at the ledger alone.
- **Before deleting anything**, a test computes each report both ways and requires equality.
- **Then it deletes** the index, its builder, the projection's read path, provenance by membership and the materialise-on-outcome branch.

**Between slice 2 and slice 3 both sources exist and hold the same decisions.** The comparison test in clause 4 is what stops them drifting.

### 7. What cannot be real yet

Each of these stays authored in a fixture, keeps its synthetic label, and is not made to look computed:

- **The bias ratio**, and the population and pass or fail beside it on `/simulations` and the Architect home.
  - **Where it is today:** written into the change-set fixtures (`apps/console/mocks/fixtures/governance.ts`).
  - **Why it cannot be computed:** a bias ratio compares outcomes across protected groups, and no protected attribute exists anywhere. The profile store is unbuilt (ADR-014 §3), and neither the generator nor the seeded tenant holds one.
  - **What it needs:** a profile store holding those attributes under ADR-004's protection, plus an ADR defining the metric. Both simulation operations stay proposed.
- **Agent activity.** `store.activity` is a seeded list, and no agent runtime exists to produce one. It stays a fixture until something acts.
- **Connector traffic.** `RecordedIntegrationGateway` invents connector values from a seed (`apps/console/mocks/gateway.ts`), and the call log `/integrations/traffic` reads lives in process memory.
  - **What it needs:** real calls, which need connector secrets (ADR-007, W-051) and endpoints to call. The seed job does not record calls, because none were made.
- **The history itself.** The customers are generated, the dates are two years before 2026-09-04, and the outcomes are clause 5's model. After this ADR they are ledger rows. They are still not evidence of anything, and every screen and export keeps saying so.

## Consequences

- **The e2e server and the database-less console start about 12 seconds slower**, spent executing 10,400 decisions. The e2e harness already allows its server 120 seconds and runs a warm-up project first. A developer notices on `npm run dev`, and the knob is `METIS_SEED_LEDGER`.
- **A seeded PostgreSQL tenant gains 10,400 decision records, 10,400 delivery attempts and about 1,654 outcome events**, written once in about 36 seconds.
- **The meaning of "recorded" changes.**
  - **Before:** it meant "not in the committed index".
  - **After:** it means "written to a `real` ledger", and no ledger can be `real` today (G-068).
  - **So in development every figure reads synthetic.** A reviewer who clicks a decision in the seeded tenant no longer sees a "mixed" report. That is correct, and it will surprise whoever wrote the `mixed` tests in `provenance.test.ts`, which clause 6 rewrites.
- **Tests that pin today's counts are rewritten in the slices that move them.** They include `decision-index.test.ts`, `seeded-outcomes.test.ts`, `provenance.test.ts`, the e2e specs that read `/decisions` totals, and the stale comments quoting 416 outcomes.
- **The first thing that will be wrong:** a unit test that imports the store with `METIS_SEED_LEDGER` inherited from a developer's shell, paying 12 seconds and timing out like G-133. The store's own log line naming the seed is what makes it findable; the suite notices first.
- **Nothing here makes a figure evidence.** It makes the path real so that the first real tenant's figures arrive through code that has already been exercised.

## Alternatives considered

**Keep the index as the read path and let real decisions join it.** This is today's arrangement, extended. It needs no job and no boot cost. It loses because it keeps two histories. Search already shows the cost: a real decision exists, can be opened, and is absent from the list. Every report that joins both sources has to say which one each number came from, and provenance by membership is the workaround that proves it.

**Materialise seeded decisions lazily, as `POST /outcomes` does today.** It costs nothing until something is measured. It loses because the history screens read would still not be in the ledger. Search, performance and the funnel would still need the index, which is the thing this ADR removes.

**A smaller N, such as 2,600.** A quarter of the corpus would seed in memory in about 3 seconds. It loses on two counts:
- Every count, rate and percentile on screen moves, so the transition can no longer be asserted "unchanged" and has to be argued.
- The funnel's later stages and per-offer figures become single digits, which is exactly the thinness the 10,400 was chosen to avoid.

The boot cost it saves is a development inconvenience, not a correctness problem.

**Give the e2e job a PostgreSQL service and seed once in global setup.** This is the most realistic option: e2e would run against the store a deployment uses, and the 12-second in-memory seed would disappear from the e2e server. It is deferred, not rejected. It changes the harness, which has cost re-runs before, and all four e2e shards need a database service. Revisit it if the boot cost shows up in e2e timings, or when the console stops holding a ledger in memory at all.

**Commit a pre-executed ledger instead of executing at seed time.** No execution cost. It loses on size: the full traces serialise to about 80 MB (`engine.ts`, the comment on `executeAt`). It would also be a second copy of the generator's output that can go stale, the problem the index already has.

**Seed through the decision path (`decideAndRecord`, or the decision service).** The most real path, because every decision would pass through integration resolution. It loses for now because resolution re-reads connectors and changes the inputs. Every id and chain hash would move, and `service-cases.json` would stop agreeing with the ledger. It becomes the right choice once the decision service owns decisions and can accept the job's recorded inputs unchanged. At that point the hash impact is predicted and diffed, as every hash move is.
