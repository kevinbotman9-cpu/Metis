# Truth audit — what is actually in this codebase

**Phase E1 of `docs/EVALUATION_BRIEF.md`. Surveyed 2026-09-09 on `feat/shadow-mode` at `7af77ff`.**

A direct survey of the repository, organised by the seventeen domains of
`docs/evaluation/CAPABILITY_TAXONOMY.md`. The taxonomy supplies the *order* of
the survey and nothing else: every row below names something this codebase
actually does, in the repo's own words, and no row is scored against a taxonomy
item. That join is E3.

E1 was previously anchored to `PHASES_SUMMARY.md`, a document that claimed every
phase complete and that no longer exists. The brief was repaired in this session
before the survey ran, for the reason recorded there: reconstructing a deleted
document's claim list from git history would reintroduce the drift its deletion
removed.

## Verdicts

- `BUILT` — implementation exists, a named test exercises it, and a console route
  operates it.
- `ENGINE-ONLY` — implementation and tests exist, no operable screen.
- `SCREEN-ONLY` — a screen renders but reads mock or static data.
- `SCAFFOLD` — files exist, no working behaviour.
- `ABSENT` — nothing found.

## Evidence rules applied

Every row cites a file path with line numbers, a test name, and where relevant a
route path. A type definition was not accepted as an implementation. Where five
minutes of searching found nothing, the verdict is `ABSENT` and the searches are
named, so that the next reader can tell "looked and found nothing" from "did not
look."

## One limit that applies to every row, stated once

The API the console consumes is `apps/console/app/api/[...path]/route.ts` — a
Next.js route handler that reads and writes an in-process store
(`apps/console/mocks/store.ts`) seeded from fixtures, and calls the real
`@metis/runtime`, `@metis/ledger`, `@metis/core` and `@metis/compiler` packages
to do the actual work. So a `BUILT` row below means the logic is genuine, a
named test exercises it, and a person can drive it from a route — **and** that
its state lives for the life of the server process. That is a real limit and it
is not repeated on sixty rows; it is stated here and named again only where it
changes the verdict.

`planes/execution` contains **zero tracked files**. There is no separately
deployable API plane. Slice artefact 3 in `CLAUDE.md` names `planes/authoring`
or `planes/execution` as where a public endpoint lives; nothing has ever been
put there.

---

## Repository-wide records

### Source size

38,971 lines across 182 tracked source files, excluding tests, the generated
client, Storybook stories and `node_modules`.

| Area | Lines | Note |
|---|---|---|
| `apps/console` | 22,381 | 57% of all source |
| `packages/*` (ten packages) | 11,602 | the platform proper |
| `engines/kotlin` | 2,075 | second implementation, conformance-tested against the first |
| `scripts` | 1,942 | gate, generators, corpus builders |
| `planes/execution` | 0 | directory exists on disk, nothing tracked in it |
| root configuration | ~971 | the remainder |

Separately: 84 test files, `packages/client/src/generated.ts` at 1,915 generated
lines, and `docs/metis-api.openapi.yaml` at 4,129 lines.

The console is larger than the platform it operates by roughly two to one.

### Persistence stores

| Store | State | Evidence |
|---|---|---|
| PostgreSQL | Implemented for three stores, wired to one CLI, used by no service | `packages/{registry,ledger,catalogue}/src/postgres-store.ts`, migrations at `packages/*/migrations/001_*.sql`, suites `packages/*/tests/postgres.test.ts` |
| EventStoreDB | Declared in `docker-compose.yml`, no code opens a connection | search for `eventstore` outside compose and prose returns nothing |
| Redis | Declared in `docker-compose.yml`, no code opens a connection | same |
| ClickHouse | Declared in `docker-compose.yml`, no code opens a connection | same |

`docker-compose.yml` says this itself, in a header comment, before the services
it declares. That comment is accurate.

The only non-test caller of `createRegistryStore`, `createLedgerStore` or
`createCatalogueStore` is `packages/portability/src/cli.ts:17-19` — an export and
import command. **The console never touches PostgreSQL.** Three stores with
migrations, dual implementations and passing behaviour suites are reachable
today only by a CLI nobody's screen invokes.

### Console routes and where their data comes from

24 routes. `store` means the mutable in-process store; `engine` means
`@metis/runtime` executes at request time; `fixture` means static seeded data
with no write path; `none` means the route makes no API call.

| Route | Data | Principal client calls |
|---|---|---|
| `/` | store | `listArtifacts`, `listChangeSets`, `listAgentActivity` |
| `/login` | none | local auth only |
| `/offers` | store | `getTaxonomy` |
| `/offers/[id]` | store | `getOffer`, `updateOffer`, `createChangeSet` |
| `/creatives` | store | `listAllCreatives`, `listOffers` |
| `/targeting-policies` | store | `listTargetingPolicies` |
| `/frequency-policy` | store | `listFrequencyPolicies` — read only, no write endpoint served |
| `/arbitration` | store | `getArbitration`, `updateArbitration` |
| `/decision-flows` | store | `listArtifacts` |
| `/decision-flows/[id]` | store + engine | `getArtifact`, compile and shadow paths |
| `/decisions` | fixture + engine | `searchDecisions` over the committed decision index |
| `/decisions/[id]` | engine | `getDecisionRecord`, `replayDecision` — the trace re-executes |
| `/experiments` | store | `listExperiments`, `createExperiment`, `updateExperiment`, `getPerformance` |
| `/performance` | engine | `getPerformance`, `listArtifacts` |
| `/simulations` | store | `getCounterfactual`, `listChangeSets` |
| `/data-model` | store | `getProfileSchema` |
| `/data-model/intake` | store | `listDataSources`, `createDataSource`, `updateDataSource`, `activateDataSource` |
| `/integrations` | store | `listConnectors`, `updateConnector` |
| `/integrations/traffic` | store | `listInboundCalls`, `clearInboundCalls` |
| `/approvals` | store | `listChangeSets` |
| `/approvals/[id]` | store | `getChangeSet` |
| `/audit` | store | `getAuditLog` |
| `/agentic` | store | `listAutonomySettings`, `updateAutonomySetting`, `listAgentActivity` |
| `/settings` | none | theme and session only, nothing persisted server-side |

No route reads static data it cannot write back to, except `/decisions`, whose
corpus is a committed index of engine executions by design.

### Hand-rolled `fetch` outside the generated client

One, and it is the sanctioned one: `apps/console/lib/api-client.ts:171`. Its
paths and methods are not written there — they come from `OPERATIONS`, generated
from the OpenAPI spec (`apps/console/lib/api-client.ts:18`), and
`tests/api-paths.test.ts` checks every operation id exists. No component calls
`fetch`.

`packages/runtime/src/integration/http-gateway.ts:113` defines a method *named*
`fetch` on the integration gateway. That is the platform's own outbound
connector path, not a console data call, and
`packages/runtime/tests/no-egress.test.ts:213` asserts the engine cannot reach
the network at all outside it.

### Hardcoded colour, spacing and font values

None found in app code. Every `rgb(...)` in `apps/console/app` and
`apps/console/components` — twelve occurrences — takes the form
`rgb(var(--token))`: `apps/console/app/login/page.tsx:108,233`,
`apps/console/components/canvas/flow-canvas.tsx:90-170`,
`apps/console/components/ui/health-summary.tsx:21-64`. These are SVG and React
Flow attributes that cannot take a CSS class, so a token reference is the
correct form rather than a violation of it.
`apps/console/tests/unit/coverage.test.ts` ("the token layer clears WCAG AA")
checks the token values themselves.

---

## 1. Data, profile and identity

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| A profile schema as a first-class object: entities, relationships, typed fields with sensitivity, and declared aggregations | `BUILT` | `packages/core/src/profile-schema.ts:62-160`; test `the schema itself`; route `/data-model` | Sensitivity is `none \| personal \| special_category`, so the vocabulary for privacy exists at field level |
| Rules validated against that schema at authoring time, with operators constrained by field type and a spelling suggestion on a bad path | `BUILT` | `packages/core/src/profile-schema.ts:262-386, 443-477`; test `policy conditions against the data model`; route `/targeting-policies` | This is taxonomy 1.11's shape: a bad path is refused when authored, not at runtime |
| Data source intake: define a source, map fields, apply transforms, validate rows, report per-row problems, activate | `BUILT` | `packages/core/src/intake.ts:37-426`; tests `mapping a row`, `transforms`, `the validation report`, `activation`; route `/data-model/intake` | Per-row problems are reported, not a single rejection |
| Aggregations over history resolved at decision time and merged into the decision input | `BUILT` | `packages/runtime/src/integration/aggregate.ts`, `resolve.ts:180-310`; tests `usage becomes decision input`, `merging into the input`; route `/data-model` | The aggregation is declared on the schema and computed by the engine, not precomputed into a store |
| External attribute resolution with a per-connector timeout, a cache, and defined failure behaviour | `BUILT` | `packages/runtime/src/integration/resolve.ts:180-310`, `http-gateway.ts:113`; tests `HttpIntegrationGateway`, `integration resolution`, `latency budget`; route `/integrations` | Connectors cannot authenticate — registered in `docs/gaps.md`, 2026-09-07 |
| Replay of a decision against its recorded inputs, producing a diff | `BUILT` | `packages/runtime/src/deterministic/engine.ts:710-788`; test `author -> compile -> execute -> replay`; route `/decisions/[id]` | Replay of a *live* decision needs an input snapshot that does not exist — registered in `docs/gaps.md`, 2026-09-07, pending ADR-004 |
| Identity resolution, stitching, survivorship, merge and unmerge | `ABSENT` | Searched `identity graph`, `stitch`, `survivorship`, `golden record`, `merge`, `mPID`, `IDSync` across `packages`, `apps/console`, `engines` and the OpenAPI spec | Nothing. There is one customer reference per request and no notion that two might be the same person |
| A customer's own interaction log as a chronological view | `ABSENT` | `packages/ledger/src/ledger.ts:27-59` queries decision records, and `/decisions` searches them; no impression, click or delivery event type exists | The interaction log holds decisions the platform made, not interactions the customer had |

## 2. Consent, preference and privacy

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| Consent as a typed decision input — marketing, profiling, third-party — enforced at a constraint node, with a service exemption so duty-of-care offers survive withheld marketing consent | `BUILT` | `packages/runtime/src/deterministic/engine.ts:287, 425-460`, `types.ts:151`; test `suppresses everything when marketing consent is withheld`; visible on route `/decisions/[id]` | The exemption is the part most products get wrong, and it is here |
| `CONSENT_WITHHELD` as a first-class denial reason in the trace | `BUILT` | `packages/runtime/src/deterministic/types.ts:198-215`; test `suppresses everything when marketing consent is withheld`; route `/decisions/[id]` | One of eight reason codes, all of which reach the trace |
| A flow that omits the consent constraint decides without consent, and nothing warns | `SCAFFOLD` | Registered in `docs/gaps.md` — *"a flow can ignore consent and nothing says so"*, 2026-09-07 | Enforcement is per-flow authoring discipline, not a platform guarantee. The gap is registered, not closed |
| Consent store, preference centre, purpose-based governance, erasure, access request, retention, residency | `ABSENT` | Searched `erasure`, `right to be forgotten`, `retention`, `residency`, `purpose`, `preference centre`, `GDPR`, `DSAR` across `packages`, `apps/console` and the spec | Consent arrives on the request. Nothing stores it, ages it, or proves what it said |

## 3. Audience and segmentation

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| Audience as a named user-editable entity | `ABSENT` | `packages/ui-metadata/src/registry/index.ts:59` lists `Audience` in `PENDING` with the reason *"No schema in the spec and no screen. Declared in the console spec only."* | The repo records its own absence here, which is why this row can be certain rather than inferred |
| Experiment arms as a population split, addressable from a targeting policy at `experiments.<key>` | `BUILT` | `packages/core/src/experiment.ts:78-148`; tests `assignment is a function, not a record`, `arms as decision input`; route `/experiments` | This is the only mechanism in the repo that divides a population, and it is an experiment mechanism rather than a segmentation one |
| Candidate selection by objective, category and status inside a flow | `BUILT` | `packages/compiler/src/decision-flow/compile.ts`, `packages/runtime/src/deterministic/engine.ts:267-470`; test `what a flow will consider`; route `/decision-flows/[id]` | Selection happens per decision, not as a stored audience |
| Audience builder, counts before save, overlap, lookalikes, streaming qualification, scheduled refresh | `ABSENT` | Searched `audience`, `segment`, `lookalike`, `overlap`, `qualif` across `packages` and `apps/console/app`; `segment` matches only string-splitting in the compiler | — |

## 4. Offer and action management

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| Offer with objective, category, status, financials and a validity window, created and edited from the screen | `BUILT` | `packages/core/src/domain.ts:17-100`; tests `creating an offer`, `authoring an offer`; routes `/offers`, `/offers/[id]` | Four statuses: draft, active, paused, retired |
| A validity window enforced by the engine, producing `OUT_OF_VALIDITY_WINDOW` | `BUILT` | `packages/runtime/src/deterministic/engine.ts:267-470`, `types.ts:202`; test `the window comes from the decision, not the clock`; route `/decisions/[id]` | Evaluated against the decision's own timestamp, not the wall clock, which is what makes replay work |
| Activation refused when an offer has nothing to deliver, naming the reason | `BUILT` | `packages/core/src/creative.ts:238`; test `refuses to activate an offer with nothing to deliver, and says why`; route `/offers/[id]` | — |
| Business boosts as a multiplicative weight with an effective window | `BUILT` | `packages/core/src/domain.ts`, `packages/runtime/src/deterministic/engine.ts:500-506`; test `the ranking function`; route `/arbitration` | Boost expiry is evaluated at decision time |
| Volume constraints — a finite inventory with per-period usage | `ENGINE-ONLY` | `packages/core/src/volume.ts:31-181`; tests `what a cap must be`, `resolveVolume` | No screen. `volumePaths` and `resolveVolume` exist and are tested; no route reads or writes a constraint |
| Objective and category as user-editable entities | `SCAFFOLD` | `packages/ui-metadata/src/registry/index.ts:60-61` lists both in `PENDING`: *"No authoring surface at all; the taxonomy is fixture-authored"* | The taxonomy renders and decides; it cannot be edited by anyone |
| Bulk import of a catalogue from a file | `ENGINE-ONLY` | `packages/portability/src/import.ts`, `cli.ts`; test `a tenant survives being exported and imported` | A CLI, not a screen |

## 5. Content, creative and asset governance

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| Creative typed per channel — email, SMS, web, push, outbound call — each with its own content shape | `BUILT` | `packages/core/src/domain.ts:101-224`; test `validateCreativeContent`; route `/creatives` | Five channels, five content types, one union |
| Channel limits enforced at authoring with the refusal placed on the offending field | `BUILT` | `packages/core/src/creative.ts:23-237` (`SMS_MAX_CHARS` 160, `SMS_SENDER_MAX_CHARS` 11); test `adds a creative, puts each refusal on its own field, then activates`; route `/offers/[id]` | A live character counter is asserted by the same test |
| The creative form declared in metadata rather than hand-built | `BUILT` | `packages/ui-metadata/src/registry/creative.ts`; tests `every descriptor matches its OpenAPI schema`, `the declared creative form @screen-only`; route `/offers/[id]` | One of two entities with a descriptor |
| Content library listing every creative with its owning offer and delivery status | `BUILT` | route `/creatives`; test `the content library` | — |
| Asset storage or upload | `ABSENT` | Registered in `docs/gaps.md` — *"creatives can be authored, and not uploaded"*, 2026-09-07 | Web and push content name an image; nothing stores one |
| Rights, expiry, territorial licensing, brand rules, mandatory disclosure, approval of a creative as its own object | `ABSENT` | Searched `expiry`, `licence`/`license`, `territory`, `rights`, `brand`, `disclosure`, `watermark` across `packages` and `apps/console` | Change sets approve catalogue edits generally; nothing approves a creative as content |
| Localisation, translation, locale-aware content | `ABSENT` | Searched `locale`, `i18n`, `translat`, `language`. `locale` matches only `toLocaleString` number formatting; `i18n` matches one comment in `apps/console/app/creatives/page.tsx` | `CLAUDE.md` records the message catalogue as removed on 2026-09-05 and the gap as open. Every string is inline |
| Rendered content preview against a real profile, proof sending, personalisation fields with fallbacks | `ABSENT` | Searched `preview`, `proof`, `fallback`, `personalis`/`personaliz`, `merge field`, `liquid` | Creative content is authored and validated; nothing renders it against a customer |
| Creative versioning, diff and rollback | `ABSENT` | Versioning exists for artifacts (`packages/registry`), not for creatives | — |

## 6. Eligibility, relevance and suitability

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| The three tiers as first-class, separately named policy kinds | `BUILT` | `packages/core/src/domain.ts:225` (`PolicyKind = 'eligibility' \| 'relevance' \| 'suitability'`); test `creating a policy`; route `/targeting-policies` | The distinction the taxonomy's 6.1-6.3 asks for is modelled, not collapsed |
| A distinct denial reason per tier reaching the trace | `BUILT` | `packages/runtime/src/deterministic/types.ts:198-215`; test `precedence and determinism`; route `/decisions/[id]` | `ELIGIBILITY_FAILED`, `RELEVANCE_FAILED`, `SUITABILITY_FAILED` |
| Targeting policies authored from the screen, scoped, and reaching decisions | `BUILT` | `packages/core/src/domain.ts:225-300`; tests `authoring a policy`, `creating a policy`, `editing a policy`; route `/targeting-policies` | `docs/gaps.md` records this closing on 2026-09-07: *"a created offer is decidable, and a created policy runs"* |
| A policy attached to nothing, and a scope pointing at a deleted object, both detected | `BUILT` | tests `a policy nobody attached`, `dangling policy scopes`; route `/targeting-policies` | — |
| The policy form is hand-built rather than declared | `SCREEN-ONLY` | `packages/ui-metadata/src/registry/index.ts:63`: *"Hand-built in components/policy-form-dialog.tsx"* | Adding a field to a targeting policy requires a change under `apps/console/` — the condition Rule 8 exists to prevent |
| Decision tables with a stated hit policy | `ABSENT` | Searched `decision table`, `hit policy`, `DMN`, `FEEL` | Conditions are authored as clause lists |
| A second approver required for a rule marked regulatory | `ABSENT` | Searched `regulat`, `second approver`, `dual control`, `four eyes` | Change sets have one approval path for everything |

## 7. Arbitration and ranking

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| A ranking function with named terms — propensity, value, boost, context, cost — and two built-in functions | `BUILT` | `packages/core/src/utility.ts:27-175`; tests `the ranking function`, `multiplicative@1.0.0 reproduces the formula it replaced`, `expected-value@1.0.0`; route `/arbitration` | Terms are named and versioned; a missing term raises `UtilityTermMissing` rather than defaulting silently |
| Term weights edited from the screen and reaching the engine | `BUILT` | test `configuration reaches the engine`; route `/arbitration` | — |
| Ranking without a model score, using the flow's declared default rather than an unnamed 1.0 | `BUILT` | `packages/runtime/src/deterministic/engine.ts:533-560`; tests `model-free arbitration`, `a candidate nothing scored` | The code argues this case explicitly in a comment, and the trace names when the default was applied |
| The full ranked candidate list with per-candidate term values and denials, as an immutable record | `BUILT` | `packages/runtime/src/deterministic/engine.ts:267-709`; test `decision conformance (ADR-003)`; route `/decisions/[id]` | Chain-hashed; a second implementation in Kotlin agrees byte for byte |
| Cross-engine agreement on the same decision | `BUILT` | `engines/kotlin/.../DecisionConformanceTest.kt`, `packages/runtime/tests/determinism.test.ts`; tests `decision conformance (ADR-003)`, `executeDecision agrees across engines` | Two independent implementations, one corpus |
| Multi-slot placements with a reproducible slate | `BUILT` | `packages/runtime/src/slate.ts`; test `selectSlate`; route `/decisions/[id]` | `docs/gaps.md` records the constraint: a slate is reproducible only alongside its placement |
| Minimum share guarantees, diversity rules across a slate, per-losing-candidate attribution of the deciding term | `ABSENT` | Searched `diversity`, `minimum share`, `quota`, `guarantee` | The trace shows every candidate's score; it does not say which term decided the ordering |

## 8. Predictive and adaptive models

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| `score-model` and `score-adaptive` node types that pin a model id and version and produce a propensity | `SCAFFOLD` | `packages/runtime/src/deterministic/engine.ts:490-527` | The propensity is `0.05 + seededUnitInterval(customerId, offerKey, modelKey) * 0.9`. It is arithmetic over a hash. There is no model |
| The trace saying so, in the sentence a reader sees | `BUILT` | `packages/runtime/src/deterministic/engine.ts:519-524` — the trace reads *"a pinned deterministic function, not a trained model (W-029)"*; route `/decisions/[id]` | This is the single most honest thing in the repository. The comment above it records that the sentence used to read like a real model had scored, and that nobody had written a false claim — the pinned id made one anyway |
| `score-adaptive` as a node type with no behaviour distinct from `score-model` | `SCAFFOLD` | Registered in `docs/gaps.md` — *"`score-adaptive` is a node type with no behaviour of its own"*, 2026-09-07 | — |
| Model as a user-editable entity | `ABSENT` | `packages/ui-metadata/src/registry/index.ts:65`: `Model` in `PENDING`, *"Gate 2. No schema, no screen."* | Registered as W-029 in `docs/BACKLOG.md:832` — *not* in `docs/gaps.md`, which is where the engine comment points a reader |
| Model registry, monitoring, drift detection, predictor performance, bias testing, per-decision contribution | `ABSENT` | Searched `drift`, `predictor`, `bias`, `shap`, `feature importance`, `retrain`, `model registry` across `packages`, `apps/console` and the spec | Nothing. The whole domain is one hash function and a truthful sentence about it |

## 9. Experimentation and measurement

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| Experiments with arms, shares and a holdout, created and started from the screen | `BUILT` | `packages/core/src/experiment.ts:38-211`; tests `what an experiment must be`, `creates a holdout as a draft, assigning nobody yet`; route `/experiments` | — |
| Assignment as a pure function of experiment key and customer reference, recorded nowhere | `BUILT` | `packages/core/src/experiment.ts:88-148`; test `assignment is a function, not a record`; route `/experiments` | Deterministic bucketing. No assignment table to drift |
| A started experiment's split frozen against edits, with the refusal explained | `BUILT` | `packages/core/src/experiment.ts:187-205`; tests `a running experiment is frozen`, `explains why a started split cannot be changed`; route `/experiments` | — |
| An arm reachable from a targeting policy at a declared field path, with key collisions refused | `BUILT` | `packages/core/src/experiment.ts:78`; tests `arms as decision input`, `refuses a key that would collide at the same field path`; routes `/experiments`, `/targeting-policies` | This is the join that makes an experiment change a decision rather than only a message |
| The arm recorded as part of what was decided | `BUILT` | test `an arm is part of what was decided`; route `/decisions/[id]` | — |
| Performance broken down by arm | `BUILT` | `packages/ledger/src/performance.ts:109-215`; test `performance by arm`; route `/experiments` | Counting only — see domain 14 |
| Shadow: a version running beside the active one, deciding nothing, with divergences classified as winner, ranking or reasons | `BUILT` | `packages/runtime/src/shadow/index.ts:24-180`; tests `comparing a shadow against what was returned`, `the shadow report`, `shadow mode`; route `/decision-flows/[id]` | Nine e2e tests. The shadow cost is published rather than hidden |
| Statistical inference of any kind — significance, confidence intervals, sequential correction, multiple-comparison correction, variance reduction, power analysis, sample ratio checking | `ABSENT` | Searched `significan`, `p-value`, `confidence`, `bayes`, `sequential`, `CUPED`, `power`, `sample ratio`, `srm` across `packages` and `apps/console` | The platform can split traffic, assign arms deterministically, and count outcomes per arm. It cannot tell you whether a difference is real |
| Guardrail metrics, automatic stopping, experiment interaction control, raw assignment export | `ABSENT` | Searched `guardrail`, `stop`, `interaction`, `mutually exclusive` | — |

## 10. Journeys and orchestration

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| Anything resembling a journey, a multi-step flow over time, a wait, a delay, or re-entry | `ABSENT` | `journey` appears twice in the repository: a doc comment at `packages/core/src/domain.ts:584` describing a placement as *"a content slot in a customer journey"*, and an SVG path named `journeys` at `apps/console/components/nav-rail.tsx:263`. Searched `delay`, `wait`, `step`, `entry criteria`, `re-entry`, `canvas` (which matches the flow editor, a DAG evaluated in one pass) | The decision flow canvas is a directed graph executed to completion within a single decision. Nothing in this repository persists a customer's position in a process across time |

## 11. Channels and delivery

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| A decision API answering for a customer in a named placement | `BUILT` | `apps/console/app/api/[...path]/route.ts`; tests `POST /api/placements/{tenantId}/{key}/decisions`, `GET /api/placements/{tenantId}` | Served by the console's own route handler; there is no execution plane |
| Placement as a configured object with typed placement kinds | `BUILT` | `packages/core/src/domain.ts:131-153`; test `the picker list`; route `/decision-flows/[id]` | — |
| Five channels modelled end to end in the catalogue and the trace | `BUILT` | `packages/core/src/domain.ts:101`; test `validateCreativeContent`; route `/creatives` | Modelled, not delivered |
| Inbound traffic recorded with both payloads, caller attribution, and refusals with reasons | `BUILT` | `apps/console/mocks/call-log.ts`, `gateway.ts`; tests `the traffic recorder`, `caller attribution`, `body capture`, `inbound traffic`; route `/integrations/traffic` | Registered limit in `docs/gaps.md`: recorded at the edge, not by the platform |
| Outbound delivery of any kind — a message sent to a person | `ABSENT` | Searched `send`, `deliver`, `SMTP`, `provider`, `dispatch`, `queue`, `throttle`, `bounce` across `packages` and `apps/console` | The platform decides what should be delivered and records that it decided. Nothing delivers |
| Batch decisioning, paid media activation, agent desktop, send-time optimisation, quiet hours | `ABSENT` | Searched `batch`, `destination`, `agent desk`, `contact cent`, `quiet hour`, `send time` | — |

## 12. Frequency, suppression and fatigue

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| A frequency & suppression policy with a cap, a period and a scope, enforced at a constraint node | `BUILT` | `packages/core/src/domain.ts:274-300`, `packages/runtime/src/deterministic/engine.ts:425-470`; tests `what a cap must be`, `precedence and determinism`; route `/frequency-policy` | Day, week and month periods |
| Scope-specific caps that can raise the global one, with the first breached cap named in the trace | `BUILT` | `packages/runtime/src/deterministic/engine.ts:440-470`; test `precedence and determinism`; route `/decisions/[id]` | `FREQUENCY_CAP_BREACHED` names which cap, in catalogue order |
| The policy is read-only from the screen | `SCREEN-ONLY` | `packages/ui-metadata/src/registry/index.ts:64`: *"Read-only screen today; no write endpoint is served"* | The engine enforces a policy nobody can change without editing a fixture |
| Per-individual volume optimisation, fatigue analysis, the cost of a cap | `ABSENT` | Searched `fatigue`, `optimis`/`optimiz`, `foregone`, `counterfactual` — the last matches `/simulations`, which compares change sets rather than caps | — |

## 13. Simulation, testing and pre-production QA

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| Flow test cases with expectations, run against a catalogue snapshot | `ENGINE-ONLY` | `packages/runtime/src/flow-tests/index.ts:30-147`; test `running a flow author` | No route runs these. A tester cannot reach them from a screen |
| A counterfactual comparison of a pending change set | `BUILT` | route `/simulations`; client call `getCounterfactual`; test `the two gaps close` | Compares change sets, which is narrower than simulating a configuration against a population |
| Shadow evaluation against live traffic | `BUILT` | `packages/runtime/src/shadow/index.ts:24-180`; test `shadow mode`; route `/decision-flows/[id]` | Also counted in domain 9; it is one mechanism serving both |
| Audience simulation, distribution testing, underserved-customer discovery, value projection against a target | `ABSENT` | Searched `simulat` (matches only the `/simulations` route above), `distribution test`, `underserved`, `projection`, `scenario` | — |

## 14. Analytics, attribution and reporting

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| A performance report over real decision records, by offer, channel, flow and arm | `BUILT` | `packages/ledger/src/performance.ts:37-215`; tests `report`, `the report reaches real outcomes`, `performance by arm`; route `/performance` | Built from the decision corpus at request time, not a precomputed table |
| Outcomes recorded and read back against decisions | `BUILT` | `packages/ledger/src/ledger.ts:27-183`; tests `outcomes`, `the report reaches real outcomes` | `docs/gaps.md` records this closing on 2026-09-07 |
| The report refusing to state what it cannot know | `BUILT` | `packages/ledger/src/performance.ts:11` and `apps/console/app/performance/page.tsx:307` both say it in the product's own words: *"Counting only: attribution and uplift are statistical..."*; tests `what the numbers refuse to say`, `absent is not zero`; route `/performance` | A named test enforces the refusal, so the honesty cannot quietly lapse |
| A searchable, virtualised decision grid over the whole corpus, with a summary reporting the real total | `BUILT` | `apps/console/app/decisions/page.tsx`; tests `virtualised decision grid`, `summary strip`, `reports the real decision total, not the page size`; route `/decisions` | 10,400 records |
| Every displayed decision reaching its own trace, and the trace re-executing | `BUILT` | `packages/runtime/src/deterministic/engine.ts:267-709`; tests `decision search and trace`, `the decision ledger`; route `/decisions/[id]` | This is the one place the taxonomy's hardest item — click a number, reach the records — is genuinely answered |
| Attribution of any kind: models, windows, comparison between models | `ABSENT` | Searched `attribution` — two matches, both disclaimers saying it is not done. Searched `first touch`, `last touch`, `time decay`, `shapley`, `incremental`, `uplift` | The absence is documented in the product, which is better than a false number and is still an absence |
| Incrementality against a holdout | `ABSENT` | Holdouts exist as experiment arms (`packages/core/src/experiment.ts`); nothing computes lift against one | The mechanism to hold a group out exists. The arithmetic to use it does not |
| Export to a warehouse, scheduled reports, user-defined reports, cohort analysis, anomaly detection, cost per decision | `ABSENT` | Searched `export` (matches `packages/portability`, a tenant configuration export, not an event stream), `schedule`, `cohort` (matches only the churn cohort in the demo seed), `anomaly`, `cost per` | — |

## 15. Governance, approval, environments and audit

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| Change sets grouping edits, sent for approval and reviewed as a unit | `BUILT` | `packages/registry/src/registry.ts:33-476`; tests `an edit reaches decisions only through publish and promote`, `writes persist`; routes `/approvals`, `/approvals/[id]` | — |
| An artifact registry with immutable versions, a compilation gate, and promotion between environments | `BUILT` | `packages/registry/src/registry.ts:56-476`, `packages/compiler/src/decision-flow/compile.ts`; tests `the compilation gate`, `promotion and rollback`, `version resolution`; routes `/decision-flows`, `/decision-flows/[id]` | A flow that does not compile never enters the registry |
| Rollback to a previous version | `BUILT` | test `promotion and rollback`; route `/decision-flows/[id]` | — |
| An audit log recording every mutation, that does not observe itself | `BUILT` | `apps/console/app/api/[...path]/route.ts` (`recordAudit`); tests `the log does not observe itself`, `does not record reads of itself`; route `/audit` | Every write path records; reads do not, which is why the log stays legible |
| Role-based permissions separating authoring, approval and promotion | `BUILT` | tests `role-based access`, `registry permissions`, `setting a shadow needs promote:flows`, `offers no controls to an account that cannot author`; routes `/approvals`, `/offers/[id]` | Enforced by hiding the control, not disabling it — `docs/adr/` records the rule |
| Autonomy reduction as an operator action, recorded and attributed | `BUILT` | `apps/console/tests/unit/autonomy.test.ts`; tests `AUTONOMY_LEVELS`, `resolveAutonomy`; route `/agentic` | — |
| Tenant configuration exported as a package and verified on import | `ENGINE-ONLY` | `packages/portability/src/{export,import,verify}.ts`; tests `a tenant survives being exported and imported`, `a bundle that cannot be trusted is refused` | CLI only. No screen exports or installs anything |
| Append-only proof, dual approval, incident-scoped decision listing | `ABSENT` | Searched `append-only` (a doc phrase, not a mechanism), `tamper`, `hash chain` on the audit log — the chain hash covers decisions, not audit events | Decisions are chain-hashed. Audit events are rows |

## 16. Administration, extensibility and screen configurability

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| A form descriptor registry with a generic renderer, diffed against the OpenAPI schema | `BUILT` | `packages/ui-metadata/src/registry/index.ts:16-80`; tests `every descriptor matches its OpenAPI schema`, `every user-editable entity is accounted for`, `declared forms @screen-only`; routes `/offers/[id]`, `/creatives` | Adding a field to Offer or Creative requires no change under `apps/console/app/` |
| Two of fourteen user-editable entities actually declared | `SCAFFOLD` | `packages/ui-metadata/src/registry/index.ts:16-19` holds `Offer` and `Creative`; `:35-49` lists fourteen entities; `:59-72` records why each of the other twelve is absent | Rule 8 is enforced for 14% of the entities it names. The registry states this itself, per entity, with a reason |
| Navigation generated from a persona manifest joined with the routes that exist | `BUILT` | `apps/console/lib/nav/{build-nav,persona-manifest,routes.generated}.ts`; tests `buildNav`, `the real manifest against the real routes`, `routes.generated.ts`, `navigation rail @screen-only`; every route | Screens that do not exist cannot appear; groups a persona lacks are hidden |
| Theme axes and a token layer meeting contrast requirements | `BUILT` | `apps/console/app/globals.css`; tests `the token layer clears WCAG AA`, `appearance`; route `/settings` | Light/dark × compact/comfortable |
| Layout manifests — screens declared rather than coded | `ABSENT` | `packages/ui-metadata/src/registry/index.ts:70`: *"Layout manifests do not exist yet"*. This is the largest block of the conformance gate: routes `/`, `/performance`, `/settings`, `/simulations`, `/targeting-policies` and others each fail `[layout-manifests]` | Part of the standing 24 failures |
| A node type package that nothing imports | `SCAFFOLD` | Registered in `docs/gaps.md` — *"`packages/nodes-core` is imported by nothing"*, 2026-09-07 | 445 lines describing operator metadata, wired to nothing |
| Multi-tenancy | `BUILT` | `tenantId` throughout `packages/registry`, `packages/ledger`, `packages/catalogue`; tests `GET /api/placements/{tenantId}`, `a tenant survives being exported and imported` | Present at the data layer; one tenant is served |
| Single sign-on, custom roles, partner packages, label overrides, console theming by an administrator | `ABSENT` | Searched `SSO`, `SAML`, `OIDC`, `pack`, `plugin`, `label override` | `pack` appears in the vocabulary and in `packages/portability` as a bundle format, not as an installable extension |

## 17. Operations, reliability and cost

| Capability found | Verdict | Evidence | Notes |
|---|---|---|---|
| Idempotent decisions: the same request twice produces one decision, and a conflicting reuse of a key is refused | `BUILT` | `packages/runtime/src/idempotency/index.ts:39-147`; tests `the request hash`, `classify`, `idempotent decisions`; route via the decision API | Three outcomes, not two: fresh, replayed, conflict |
| A per-connector latency budget with defined behaviour on timeout | `BUILT` | `packages/runtime/src/integration/{resolve,http-gateway}.ts`; tests `latency budget`, `HttpIntegrationGateway`; route `/integrations` | — |
| Timing captured per decision and per node | `BUILT` | `packages/runtime/src/deterministic/engine.ts:267-709`; test `hot path cost`; route `/decisions/[id]` | The trace carries `totalMs`; the decision index carries it per record |
| Proof that the engine makes no unconfigured outbound call | `BUILT` | `packages/runtime/tests/no-egress.test.ts:213`; test `no-egress` asserts `fetch` throws `Network blocked` inside the engine | The taxonomy calls this `FRONTIER`. It is here, tested, today |
| Route bundle budgets enforced in CI | `BUILT` | `apps/console/tests/bundle`; nine budgets, all passing | — |
| Throughput reporting, cost attribution, drain-and-restart, log lag, reprocessing, anomaly alerting | `ABSENT` | Searched `throughput`, `cost`, `drain`, `lag`, `reprocess`, `alert` | Nothing observes the running system. There is no metrics endpoint, no health check beyond the compose file's, and no operator screen for any of it |

---

## What the five-minute rule ruled out

These were searched for and not found, and the verdict is `ABSENT` rather than a
guess about what the code might do: identity stitching, consent storage,
audiences, journeys, message delivery, statistical inference, attribution,
model registry and monitoring, asset storage, localisation, layout manifests,
single sign-on, and operational telemetry.

Two of those searches returned a match that was not the capability, and both are
worth naming because a faster survey would have counted them: `journey` matches
an SVG path name and a doc comment; `attribution` matches two sentences whose
subject is that attribution is not done.

## Two things the survey found that the code says about itself

The repository documents its own absences unusually well, and three of the rows
above rest entirely on that: `docker-compose.yml`'s header comment about the
three unused stores, `packages/ui-metadata/src/registry/index.ts`'s `PENDING`
map with a reason per entity, and the engine's own trace sentence declaring the
propensity is not a model. Each is enforced by a test or a gate. That is a
higher standard of self-report than the deleted `PHASES_SUMMARY.md` met, and it
is the reason this survey could be evidence-led rather than exploratory.

One reference is misfiled rather than wrong: `packages/runtime/src/deterministic/engine.ts:522`
and `apps/console/mocks/fixtures/artifacts.ts:147` both point a reader to W-029
for the model gateway. W-029 is registered in `docs/BACKLOG.md:832`, not in
`docs/gaps.md`, which is where `CLAUDE.md` tells a blocked agent to look.

---

**Next:** E3 joins this audit and `docs/evaluation/CAPABILITY_TAXONOMY.md` into
`docs/CAPABILITIES.md`. It is a separate session and it changes exactly one
existing file.
