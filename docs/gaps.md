# Console Implementation Gaps

**Purpose:** Track what the console needs that the platform has not yet built.

When the console reaches a feature that requires a platform API that doesn't exist:

1. Add the operation to `docs/metis-api.openapi.yaml` marked `x-metis-status: proposed`
2. Add an entry to this file with the operation ID and rationale
3. Mock it in the development store; **do not stub inside a component**
4. Mark it resolved here when the platform ships it

Since 2026-09-04 the spec is enforced rather than aspirational:
`packages/client` is generated from it, the console compiles against those
types, and `apps/console/tests/e2e/contract.spec.ts` asserts that every
operation *not* marked `proposed` is actually served and returns what the spec
says it returns. So this file can no longer quietly disagree with the spec —
but it can still disagree with reality about things the spec does not cover,
which is what the notes below are for.

Run `node scripts/validate-spec.mjs` for the current count.

---

## Status at a glance

| | Operations |
|---|---|
| Built, served, and contract-tested | 39 |
| Declared and marked `proposed` | 2 |
| Wanted but not yet in the spec | see persona sections below |

Counts from `node scripts/validate-spec.mjs` on 2026-09-06, which reports 34
paths, 41 operations and 46 schemas. They previously read 26 and 8 and had not
been touched for several stages.

This file is the **gap register** — what is missing, why, and since when. For
what *is* built, see [`CAPABILITIES.md`](CAPABILITIES.md), which is the single
capability map.

---

## Registered 2026-09-06 — the console edits a catalogue the engine does not read

`apps/console/mocks/store.ts` deep-clones the fixture modules on seed, with the
comment "so mutations never write back through to the fixture modules".
`apps/console/mocks/fixtures/engine.ts` builds `catalogueSnapshot` from those
same fixture modules. `executeDecision` is passed `catalogueSnapshot`.

So the offers, boosts and ranking weights the console edits are a different
object from the ones the engine ranks with. Changing the arbitration weights in
`/arbitration` persists to the store and is audited — both true, and both what
`EXPERIENCE_LAYER_STATUS.md` claims — but it does not change any decision.

Established by reading both sides, not by running: the clone is explicit, and
the snapshot's imports are the fixture exports.

This is why W-005's second half is more than swapping a store. Repointing the
console at `packages/catalogue` means deciding what the engine reads, which is
a real design question — a decision records the hash of the catalogue it saw,
so the engine cannot simply read whatever the console last wrote without that
hash becoming a moving target mid-flight. The likely shape is a snapshot taken
per decision and cached by hash, but it is a decision to make rather than a
refactor to perform.

---

## Registered 2026-09-07 — integrations resolve, and cannot authenticate

`resolveInputs` has been able to fetch since it was written and had nothing to
fetch with: `IntegrationGateway` was an interface whose only implementations
were test doubles, and nothing on any decision path called it. A comment in
`apps/console/mocks/fixtures/engine.ts` asserted the opposite — "`POST
/api/decisions` runs resolveInputs through a gateway before executing" — which
was not true when it was written. Both are fixed: `HttpIntegrationGateway` does
the I/O, `RecordedIntegrationGateway` serves development, and the console's
endpoint resolves before it executes.

Four gaps remain, and none is worked around in code.

| Gap | Notes |
|---|---|
| **No connector can authenticate** | `Connector` has no credential field and the gateway sends no headers. That is [ADR-007](adr/ADR-007-secrets-and-connector-authentication.md), which is **Proposed**: a secret in connector configuration is a secret in an append-only audit log and in every export made from it, so the shape has to be decided before the field exists. Until then, integrations work against internal and unauthenticated endpoints and fail against a real bureau. |
| **`feature-store` connectors cannot be read** | There is no feature service (W-009). Two of the five fixture connectors declare that kind, and in live mode the gateway names W-009 rather than attempting a `featurestore://` URL that was never going to resolve. |
| **The JVM service does not resolve** | The console does; `engines/kotlin` takes `input` as given. `service-cases.json` carries every field in its requests, so the 60 conformance cases still agree exactly — but the two are not interchangeable for a request that *omits* a connector-supplied field, and the corpus cannot see the difference. Resolution is outside the deterministic core, so this is a plane-level asymmetry rather than an engine divergence; it is recorded here because "either service, same answer" is a claim the project makes. |
| **The console's connector toggle still reaches neither** | Resolution reads `catalogueSnapshot.connectors`, deliberately, so provenance and resolution cannot disagree about whether a connector was active. `/integrations` writes to `store.connectors`, which neither reads. Same root cause as the entry above, and it resolves with W-005's second half rather than separately. |

---

## Registered 2026-09-07 — replay of a live decision needs an input snapshot, and that is ADR-004's question

**Corrected the same day, after attempting it.** The first diagnosis here said
the replay route only looked in the fixture corpus and needed "slightly more
than the same fallback". The fallback is now built — the route reads the ledger
and fetches the artifact from the registry — and it was the smaller half.

A decision record holds `inputSnapshotHash` and **never the values behind it**,
deliberately: a trace can then be kept for as long as an audit needs without
keeping the customer data it was made from. So the platform cannot replay a
decision on its own. `replayDecision` now takes the input from the caller and
answers 422 `input_required` when it is not given, which is an honest refusal
where it used to be a 404.

**The bound that remains.** Integration resolution runs before the engine, so
the hashed snapshot includes the fields the connectors supplied — and those
values are in no store either. A caller who sent every field can replay; a
caller who let the platform resolve any field cannot reconstruct what was
hashed, and gets a `$.inputSnapshotHash` difference. All three cases are
asserted in `ledger.spec.ts`.

So "byte-identical replay" is exactly true of the engine, and true of the
platform only for a decision whose every input the caller still holds.
`CAPABILITIES.md` now says so.

**This is ADR-004's question, not a routing one.** Making replay work in general
means retaining the input snapshot, which means retaining customer data in the
one place the design currently refuses to — and ADR-004 already has the answer:
encrypt it per subject, destroy the key on erasure, and let a replay of an
erased subject fail explicitly rather than return a decision computed from
nulls. Another reason that decision is the highest-leverage one open.

---

## Registered 2026-09-07 — a slate is reproducible, and only alongside its placement

`POST /placements/{tenantId}/{key}/decisions` composes a slate from a decision
by ordering what reached arbitration and taking the placement's `slotCount`.
Every part of that is in the decision record except the slot count, because a
`Placement` is deliberately not in the `CatalogueSnapshot` the engine hashes —
it governs delivery, not the decision, and putting it in the hash would mean
changing a slot count moved every chain hash.

The consequence: "why did I see two offers rather than three" is answerable from
the record **plus** the placement as it was configured at the time, and nothing
version-pins the second half. A slot count edited afterwards leaves the decision
reproducing exactly and the page not.

Bounded today, because ordering by priority is the whole composition rule and it
is fully explained by the record. It stops being bounded at W-028: mutual
exclusion, diversity and inventory are rules that *choose* differently, and a
slate composed by a rule nobody recorded is not explainable. Those have to land
in the hashed decision, which is why W-052 shipped the contract and left the
composition alone.

---

## Registered 2026-09-07 — a created offer cannot be decided, for two reasons

Attempted end to end: created `upsell_speed_boost` through `createOffer`, saw it
in `/offers` and on its detail page with the right empty states, then asked for a
decision. It appears nowhere in the trace, and the catalogue snapshot hash is
unchanged from before it existed.

Two independent causes, and fixing either alone changes nothing.

1. **The engine reads a different catalogue.** `catalogueSnapshot` is built from
   the fixture modules; `createOffer` writes to `store.offers`. This is the entry
   above about arbitration weights, reached from the other end — W-005's second
   half.
2. **A flow's candidate set is a fixed list.** `candidateKeys` on the artifact
   names four keys, and a new offer is in none of them. Even with one catalogue,
   an offer is only decidable once a flow names it, and the canvas is read-only
   (W-024) with no other way to edit the set.

So the console can author an offer and cannot make it live, and the second half
of that is not visible anywhere in the UI — `/offers` shows the offer as `active`
and flags only that it has no creative. "Active" here means the catalogue row
says active, not that any flow can select it.

Worth stating plainly because it is the first thing a buyer tries. The demo
answer today is that authoring is real, storage is real, audit is real, and the
path from a new offer to a decision runs through a fixture edit and a redeploy.

---

## Registered 2026-09-07 — creatives can be authored, and not uploaded

`createCreative` and `updateCreative` exist as of today, with per-channel
validation and the activation invariant. What is still missing, and is what
W-015 is actually about:

| Gap | Notes |
|---|---|
| **No asset upload, and no asset store** | There is no `multipart`, `binary` or `octet-stream` anywhere in the spec, no upload endpoint and nothing that serves a file. `imageUrl` is a string the caller supplies; `apps/console/public/assets` does not exist, so every fixture image path 404s — which is why the storefront draws a placeholder. A creative can name an asset the platform has never seen and does not check. |
| **No content lifecycle** | No approval, no effective dating, no expiry, no versioning. A creative has `status`, `active` and `locale`. Editing one changes what is delivered immediately, with an audit entry and no review — while a *flow* change goes through change sets and approvals. Two governance regimes again, and content is the unguarded one. |
| ~~The console still cannot author one~~ | **Closed 2026-09-07.** The offer and creative dialogs are wired; see `CAPABILITIES.md`. Three affordances remain unbuilt and are now disabled with the reason rather than enabled and dead: `New boost` and `New scope rule` have no write operation in the spec, and `Request change` needs a diff builder before it can propose anything. |
| **`Offer.creativeIds` is a denormalisation** | `Creative.offerId` is the foreign key — `packages/catalogue` enforces it and refuses a creative whose offer does not exist. `creativeIds` exists because the offers list reads it for the channel-coverage column, and the write path maintains it. Two places holding one fact; it resolves when the console reads from the catalogue rather than the store (W-005). |

---

## Registered 2026-09-07 — `score-adaptive` is a node type with no behaviour of its own

The compiler accepts it and the engine computes it exactly as `score-model`: a
seeded deterministic function of customer, offer key and pinned model version.
Nothing adaptive exists — W-032 — and the fixture flow that used it has been
moved to `score-model`, which is what it always was.

Kept rather than removed, because it is the seam W-032 fills and deleting it
would move the question rather than answer it. Registered because a node type
that claims a capability the engine does not have is the same species of problem
as the trace that named an adaptive model: nobody writes a false claim, and the
naming makes one.

When W-032 lands, either the type gets behaviour or it goes. Until then a flow
author choosing it gets ordinary scoring, and the trace says so.

---

## Registered 2026-09-07 — `packages/nodes-core` is imported by nothing

Fourteen node classes with `execute` methods, and no code path reaches them: the
engine implements node behaviour in `packages/runtime`, the compiler holds its
own `FlowNodeType` union, and nothing in the repository imports the package. It
also declares a dependency on `@metis/types`, which does not exist.

Found while clearing the twelve lint warnings, all of which were in this file —
so the only thing the package contributed to the build was noise in front of the
next real warning.

**Kept rather than deleted**, because the name is load-bearing where the code is
not: `@metis/nodes-core` is the package id every flow pins a version of, and
every decision records that pin — `packageVersions` is in the hashed decision.
Deleting the directory would leave a version identifier referring to nothing,
which is worse than dead code that says at the top of the file that it is dead.
Which it now does.

W-038's package system is where this either becomes real or goes. Until then it
is a stub with a name that matters.

---

## Build-system gaps

Not platform APIs, but the same kind of problem: a check that appears to run
and does not.

| Gap | Registered | Notes |
|---|---|---|
| **Project references do not build** | 2026-09-04, re-diagnosed 2026-09-05 | The original cause is gone: `packages/compiler/src/compile.ts` was deleted with the rest of the Phase 0 tree. `tsc --build` still fails, on two causes that were hidden underneath it — the per-package tsconfigs have no `@metis/core/domain` path mapping (only `packages/registry`'s does), and `bench/harness` declares a `rootDir` of `bench/harness/src` that its own `@metis/runtime` imports fall outside. Until this is fixed the per-package tsconfigs cannot be used for typechecking, and `bench/*` is checked by nothing. |
| **The Kotlin conformance gate could pass without reading the corpus** | 2026-09-05, fixed same day | The tests read `docs/conformance/*.json` by path at runtime, so Gradle had no input dependency on them: after regenerating a corpus, `./gradlew test` reported `UP-TO-DATE` and passed. Fixed by declaring the corpora as `tasks.test` inputs in both modules. Kept here as a record, because the same shape recurs — a check whose real input is invisible to the thing that decides whether to run it. |
| **Four components agree on API paths, and one typecheck covers one of them** | 2026-09-05 | The spec, the generated client, `apps/console/lib/api-client.ts` (hand-written template URLs), the dev API route handler (a string switch) and the Kotlin service router (another string switch) must all agree. Only the generated client is type-checked. `contract.spec.ts` covers the spec-versus-dev-API pair at E2E time and does bite — verified by pointing a spec path at an unserved route — but the console's own client URLs and the Kotlin router are checked by nothing. |
| **A reused dev server serves pre-edit fixture data** | 2026-09-05 | Playwright's `webServer` has `reuseExistingServer: true`, and `apps/console/mocks/store.ts` seeds itself from the fixtures **at module load**. A dev server already running when a fixture changes therefore keeps the old seed, and `POST /api/_test/reset` does not help — it re-clones the same captured seed. Observed as a `getArbitrationConfig` contract failure that passed immediately against a fresh server. Turning reuse off would add a cold start to every local run, so the workaround is to restart the server after editing a fixture; CI is unaffected because it always starts one. |
| **The root typecheck checks zero files** | 2026-09-04 | The root tsconfig has `"include": []` and only references, and `tsc --noEmit -p` does not build references. CI now also runs the console's typecheck, which resolves `@metis/core`, `@metis/runtime` and `@metis/compiler` through path aliases and is what actually covers them. `bench/*` is still outside every working typecheck — the missing `connectors` field on its catalogue was caught by a failing benchmark, not by the compiler. |
| **CI has never run** | 2026-09-08 | `.github/workflows/console.yml` is the definition of done, enforced — and nothing enforces it, because the repository has **no git remote** and no `main` or `master` branch. Its triggers are `push` to those two branches and `pull_request`; neither can fire. Found while asking whether the `Lint (console)` step was blocking or advisory: it is blocking by construction — no `continue-on-error`, a non-zero exit fails the job — and it had simply never executed. That is why seven lint errors sat on the working branch from 2026-09-07 to 2026-09-08 with nothing stopping. Every other step in that file is in the same position: the determinism gate, the p99 budget, the axe sweep and the bundle budgets are all written, all correct, and all unrun. Until there is a remote, the only thing actually gating this repo is what somebody runs locally. |
| **The decision trace a11y test fails intermittently after a write-heavy e2e run** | 2026-09-08 | `accessibility.spec.ts › the decision trace has no violations` failed once, in a run that immediately followed `form-descriptors.spec.ts`, `offer-authoring.spec.ts` and `permissions-and-writes.spec.ts` — all of which create offers and creatives by clicking. It passed in isolation and passed again on a clean full sweep (49/49), so **it has not been reproduced on demand and the cause is not established**. The suspicion is store state: `apps/console/mocks/store.ts` is process-wide, the specs above write to it, and the trace test opens whichever decision happens to be first in the grid — so a decision rendered against a catalogue a previous spec mutated is a plausible source of a node the earlier sweep found and the later one did not. `POST /api/_test/reset` re-clones a seed captured at module load, which is the same limitation already recorded two rows above. Recorded rather than fixed because a flake diagnosed by guesswork is a flake twice: the next occurrence should be captured with the axe violation id and the decision id before anything is changed. |

---

## Proposed operations in the spec

These are declared, generate client types, and are exempt from the contract
test by their `proposed` marker. Nothing serves them.

| Operation | Console impact | Registered | Notes |
|---|---|---|---|
| `simulateDecisionFlow` | Ad-hoc simulation | Week 2 | `/simulations` says plainly that this is not built and shows only simulations attached to change sets. |
| `getCounterfactual` | "What would have changed the outcome" | Week 2 | No UI yet. |

## Resolved

| Operation | Resolved | Notes |
|---|---|---|
| `generateOpenAPISpec` | 2026-09-04 | Inverted. The spec is hand-authored and is the source of truth; `packages/client` is generated *from* it, and CI fails if the two disagree. Generating the spec from code would have made the implementation authoritative, which is backwards for a contract. |
| `searchDecisions` | 2026-09-04 | GET with query parameters, not POST — search state lives in the URL. 5,000 decisions, virtualised. |
| `getDecisionRecord` | 2026-09-04 | Real engine output. The `DecisionRecord` schema in the spec now matches what the engine emits. |
| `replayDecision` | 2026-09-04 | Re-executes and compares chain hashes. Contract-tested. |
| `createChangeSet` / `getChangeSet` | 2026-09-04 | |
| `approveChangeSet` / `rejectChangeSet` | 2026-09-04 | Approval applies the diff and writes to the audit log. Permission-gated server-side, not just in the UI. |
| `getTaxonomy`, `listOffers`, `getOffer`, `listCreatives` | 2026-09-04 | Offer catalogue, Objective › Category › Offer. |
| `listTargetingPolicies`, `listFrequencyPolicies` | 2026-09-04 | |
| `getArbitrationConfig` / `updateArbitrationConfig` | 2026-09-04 | |
| `listAutonomySettings` / `updateAutonomySetting` | 2026-09-04 | |
| `listAgentActivity` | 2026-09-04 | Fixture data — no agent is running. The *shape* is real; the activity is not. |
| `listChangeSets`, `listAuditEvents`, `listArtifacts`, `getArtifactSummary` | 2026-09-04 | These were **served but missing from the spec entirely** until the contract work. |
| `login` / `getSession` | 2026-09-04 | Development identity only. No real identity provider. |
| `publishArtifact`, `promoteVersion`, `rollbackVersion` | 2026-09-04 | The artifact registry. Publishing compiles first and refuses errors; publishing does not activate; versions are immutable. |
| `getRegistryEntry`, `listRegistryFlows`, `listRegistryEvents` | 2026-09-04 | Versions, environment state, and the append-only log including refusals. |
| `executeDecision` | 2026-09-04 | Served by two implementations — the console's development store and the JVM service — held to the same 60 chain hashes. |

**Caveat that applies to every row above.** "Resolved" means the console has a
working endpoint with an enforced contract. Everything except the registry is
served over an in-memory store that resets when the process restarts; the
registry can be backed by PostgreSQL via `METIS_DATABASE_URL`. The execution plane does not serve any of them.
When it does, the contract is already written and the tests already exist.

---

## U4 Blocking Gaps (Composable Experience)

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getNodePackage` | Canvas node renderers | MISSING | Week 3 | Fetch a node package. Must include canvas renderer + inspector schema + trace renderer fragment. Without this, canvas can only draw core 16 nodes. |
| `getPanelManifest` | Panel host security model | MISSING | Week 3 | Fetch panel manifest. Declares slots, data contract (API scopes), permissions, viewport. Used to validate panel capabilities. |
| `getLayoutManifest` | Layout editor / workspaces | MISSING | Week 3 | Fetch a screen layout artifact. Declares regions, slots, panel occupants. Versioned like flows. |
| `publishLayoutManifest` | Admin persona | MISSING | Week 3 | Save a layout. Triggers audit + optional approval. |

**Impact:** Panel extensibility cannot be demo'd without node renderers from packages.

---

## U5 Blocking Gaps (Operate & Sell — Persona Surfaces)

### Data Scientist Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `listModels` | Model registry | MISSING | Week 4 | List all models + versions + champion/challenger state + shadow scoring status. |
| `getModelDetail` | Model detail view | MISSING | Week 4 | Fetch performance over time, drift, predictor importance. For adaptive models, binning + learning curves. |
| `getFeatureCatalog` | Feature catalogue | MISSING | Week 4 | Definitions, TTL, freshness, lineage. Which flows consume each. |
| `checkFeatureParity` | Online/offline parity check | MISSING | Week 4 | Given a feature, compare online (feature store) vs offline (batch compute). Return distribution diff. |

### Marketer Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getTaxonomy` | Taxonomy browser | MISSING | Week 4 | Objective → Category → Action → Creative tree. Return inherited properties + overrides. |
| `getActionDetail` | Action editor | MISSING | Week 4 | Properties, catalogue membership, effective dating, approval state. |
| `getCreativeLibrary` | Creative library | MISSING | Week 4 | Assets, per-channel variants, channel preview, approval, expiry. |
| `listCampaigns` | Campaign builder + results | MISSING | Week 4 | Campaigns + segments + schedules. Query results by action/creative/channel/segment. |
| `getFrequencyPolicy` | Frequency policy editor | MISSING | Week 4 | Frequency cap matrix. Outcome-conditioned suppression rules. |

### Operator Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getHealth` | Health dashboard | MISSING | Week 4 | Throughput, p50/p95/p99, error budget. Per tenant + route. |
| `getDegradationEvents` | Degradation events | MISSING | Week 4 | When the degradation ladder was used, why, what was served. |
| `getFeatureStoreHealth` | Feature store health | MISSING | Week 4 | Cache hit rate, hot keys, freshness distribution. |
| `getDeploymentState` | Deployment console | BUILT (registry) | Week 4 | Blue/green + blue/green promotion already exists. Wire to OpenAPI spec. |
| `getPackageDependencies` | Package console | MISSING | Week 4 | Dependency graph for installed packages. Pre-flight change reports for upgrades. |

### Executive Surfaces

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getValueMetrics` | Value dashboard | MISSING | Week 4 | Incremental outcome per decision, adoption by team, decisions served. |
| `getCostBreakdown` | Cost transparency | MISSING | Week 4 | Per-decision cost breakdown across compute, models, data, authoring. Trended. |
| `getShadowModeAgreement` | Shadow mode scoreboard | MISSING | Week 4 | Agreement with an incumbent **model**, disagreement analysis, estimated lift. Distinct from flow-version shadow mode, which is BUILT (`setShadow`, `getShadowReport`): that compares two versions of a decision flow, this compares two scoring models. Model shadow scoring belongs to §7 and is out of the Foundation MVP gate. |

**Impact:** Marketer and Operator personas cannot complete primary workflows without these. Executive cannot build the cost transparency story (a key differentiator vs Pega).

---

## U6 Blocking Gaps (Edges)

| Operation | Console Impact | Platform Status | Registered | Notes |
|-----------|--------|--------|------------|-------|
| `getNextBestAction` | CSR widget | MISSING | Week 5 | Given customer context, return top N actions + plain-language reasons. Embeddable contract. |
| `getRTCPlacements` | RTC SDK | MISSING | Week 5 | Real-time container rendering + placement debugger. Requires separate SDK. |

**Impact:** Not in v1 scope. Deferred to Phase U6.

---

## Notes for Platform Team

1. **The rest of the control plane is still in memory.** The registry is durable; offers,
   policies, arbitration weights, autonomy settings, change sets and the audit log are not.
   The pattern is proven — one behaviour suite, two stores — and applying it is mostly work
   rather than design.
2. **An authoring surface.** Versions are published through the API; the console can promote and
   roll back but cannot draft a new version. The registry is ahead of the editor.
3. **Simulation + counterfactual** (Week 2–3) unblocks ad-hoc simulation and the architect personas.
4. **Persona surfaces** (Week 4+) can run in parallel once U1–U3 are stable.
5. **Every gap entry should have an operationId in the spec** so the console can reference it by name, not by description.

---

## How to Use This File

**For Console Team:**
- When you hit a missing API, add an entry above
- Generate a mock, build against it, don't stub in components
- Mark the week you registered the gap

**For Platform Team:**
- This is your backlog in order of console criticality
- When you ship a gap, update this file and notify the console team

---

**Last reviewed:** 2026-09-05

---

## Registered 2026-09-04 — CDH domain model and agentic autonomy

Added to the OpenAPI spec as proposed operations. The execution plane has built none of them;
the console runs against the development fixture store.

| Operation | Needed for | Platform status |
|---|---|---|
| `getTaxonomy` | Objective › Category › Offer tree | Not built |
| `listOffers` / `getOffer` | Offer catalogue and detail | Not built |
| `createOffer` / `updateOffer` | Authoring offers | Not built — writes are echoed, not persisted |
| `listCreatives` | Per-channel content | Not built |
| `listTargetingPolicies` | Eligibility / relevance / suitability | Not built |
| `listFrequencyPolicies` | Suppression and frequency caps | Not built |
| `getArbitrationConfig` / `updateArbitrationConfig` | P × V × B × C weights | Not built |
| `listAutonomySettings` / `updateAutonomySetting` | Agentic autonomy per scope | Not built |
| `listAgentActivity` | Agent activity feed | Not built |
| `login` / `getSession` | Authentication | Not built — no real identity provider yet |

### Still outstanding from earlier

- `simulateDecisionFlow` — ad-hoc simulation. `/simulations` states plainly that this is not built
  and shows only simulations attached to change sets.
- `getCounterfactual` — minimal-input-change explanations. No UI yet.

### Notes for the platform team

- **Money is minor units.** `Money.amount` is an integer in pence to avoid float drift.
- **Autonomy resolution is most-specific-first**: offer › category › objective › tenant. The
  reference implementation is `resolveAutonomy()` in `packages/core/src/domain.ts`.
- **`objectiveId` on `Offer` is denormalised** from its category, for tree and breadcrumb
  rendering without a second lookup.
- **A offer with no active creative cannot be delivered.** The console flags this; the
  compiler should reject promoting a flow whose candidate set includes one.

---

## Registered 2026-09-05 — capabilities that were stubs, and are now gaps

Fourteen packages were deleted. Each was a single file with no tests, imported
by nothing except the other thirteen. They are listed here rather than
forgotten: the capabilities are still wanted, and a gap register that omits
them would be as misleading as the packages were.

The change is one of honesty, not of scope. Nothing that ran stopped running —
the full suite was green before and after, with no source change beyond
deletions.

| Capability | Was | Now |
|---|---|---|
| Package system — registry, dependency resolution, signing | `packages/packages-system` | Not built. §5's composability claim rests on this. |
| Regulatory packs — SOC 2, GDPR, EU AI Act, FCA | `packages/compliance` | Not built. §11 evidence packs depend on it. |
| Panel host and panel SDK — iframe sandbox, manifest, slots | `packages/panel-host`, `packages/panel-sdk` | Not built. Signed-partner-only was the v1 decision; neither half exists. |
| Simulation — what-if, counterfactual, bias gate | `packages/simulation` | Not built. `simulateDecisionFlow` and `getCounterfactual` remain proposed operations. |
| Adaptive models — online learning, binning | `packages/adaptive-models` | Not built. Scoring is a seeded hash with the right determinism property and no predictive content. |
| Theme token system | `packages/themes` | Superseded. The console's own token layer is built and tested across four theme axes. |
| UI primitives | `packages/ui-kit` | Superseded by `apps/console/components/ui`. It was also the only declared owner of `class-variance-authority`, `clsx` and `tailwind-merge`, which the console imports directly — deleting it surfaced three undeclared dependencies. |
| Canvas | `packages/canvas` | Superseded. The console's read-only React Flow canvas is built. |
| i18n | `packages/i18n` | Not built. `messages.json` never existed. |
| Trace format and renderers | `packages/trace`, `packages/trace-ui` | Superseded by `packages/runtime`'s `DecisionRecord` and the console's decision detail page. |
| Shared types | `packages/types` | Superseded by `packages/core/src/domain.ts`. |
| Package authoring SDK | `packages/sdk` | Not built. It re-exported the DIR validator, which is also gone. |
| Approval workflow | `planes/execution/src/approval.ts` | Superseded by `packages/registry` and the console's change-set surface. |
| Authoring plane | `planes/authoring` | Not built. The directory held a `package.json` and nothing else. |

Also deleted, for the same reason:

- The Phase 0 DIR compiler — `compileDir`, `typeCheck`, `resolveVersions`,
  `analyzeCost`, the `metis-compile` CLI, `compile.js`, `dir.schema.json` and
  `metis-package.schema.json`. `compileDecisionFlow` is the only compiler.
- Four committed compiled artifacts — `compiled.json`, `my-flow.json` and
  the two `tests/fixtures/simple-filter*.json` files. Build output does not
  belong in git, and these embedded a node-type vocabulary nothing executes.
- `verify-metis.js`, which counted directories and reported "Packages: 11/11 ✓"
  for packages with no tests, then exited 0 while printing "Some components
  missing".
- `docs/PHASES_SUMMARY.md`, which marked Phases 0–4 "✅ Complete".


---

## Registered 2026-09-07 — inbound traffic is recorded at the edge, not by the platform

`listInboundCalls` and `clearInboundCalls` are in the spec as
`x-metis-status: proposed`. The console's development API serves them from a
bounded in-memory ring; the execution plane serves neither, and should not serve
these in this shape.

**Why the shape is wrong for production, stated now rather than discovered
later.** The buffer holds full request bodies. Decision inputs are the one thing
the platform deliberately does not retain — a `DecisionRecord` carries
`inputSnapshotHash` and never the values, which is what makes the ledger safe to
keep and what ADR-004 (retention and erasure, still Proposed) is about. A
production endpoint that hands back request payloads would quietly reverse that,
and it would do it on the one surface nobody thinks of as storage.

So the production answer to the same question is an OpenTelemetry span — W-048 —
carrying the same correlation (`decisionId`, path, status, duration) and *not*
the payload. Whoever builds W-048 should treat these two operations as the
requirement, not the design.

**Why it exists anyway.** A partner site posting decisions could not demonstrate
it was reaching METIS at all. A correct decision that does not change between
reloads is indistinguishable from a hardcoded one, and the difference could only
be seen in devtools on the integrator's own machine. That is a real gap in the
development experience and it is worth a page. What it must not become is a
platform capability by accident, which is what this entry is for.

**Bounds it holds today, by construction rather than by policy:** memory only,
250 calls, 32 kB per body, lost on restart, `METIS_CALL_LOG=off` to disable.

---

## Registered 2026-09-07 — a flow can ignore consent and nothing says so

`inbound-web-offers` ran for as long as it has existed with four filter nodes
and no constraint node. Consent and frequency are enforced at constraint nodes
only, so a website could post `marketing: false` and a full week of contacts,
the engine would read both off the request, and offer anyway. Fixed in 1.9.0 by
adding `constraint_web_contact`.

The fix is not the interesting part. **Nothing detected it**, and nothing would
detect the next one.

The compiler already emits `ARBITRATION_MISSING_SCORE` when a flow arbitrates
with no scoring node in front of it — the same shape of defect, caught. The
missing sibling is a diagnostic for a flow that reaches arbitration with no
constraint node: its candidates have passed no consent check and no frequency
cap, and the trace says so only by omission, which is the hardest thing to
notice in an audit.

Worth noting why it hid for so long: the flow's own description called it
"lighter", the arbitration formula honestly said `V^1.0 × B^1.0`, and every
decision it made was correct *given its nodes*. Every artefact was truthful.
The absent gate was the only evidence, and absence is what a diagnostic is for.

One smaller finding from the same investigation:

- **`ExecNode.frequencyPolicyIds` is declared and never populated or read.**
  `toExecArtifact` does not map it, and the engine draws frequency policies
  from `catalogue.frequencyPolicies` by scope instead. So a flow author who
  set it would get no error and no effect. Either wire it or delete it.

### Not a finding: the empty account hero

This entry previously registered a second one, claiming the storefront's
signed-in preset was suppressed at suitability and left "the account page
showing nothing with the reason two screens away". That was wrong, and it is
recorded rather than deleted because the mistake is the instructive part: it
generalised from a single preset to the demo, and it was written without
opening the page it described.

There are five presets, three of them signed in. Four fill the account hero.
The fifth — `affordability`, Jo Okafor — is empty *on purpose*, and its own
note says so: every growth offer fails `pol_afford_5g`, the slot falls back to
the site's own content, and the panel names the rule. Verified end to end: the
page renders "Nothing offered here…" inline, the trace carries
`ruleId: pol_afford_5g` on each denial, and the panel prints it.

So the suppression is not a rough edge to smooth. It is the FCA-facing tier
doing the thing the tier exists for, on the surface where a buyer can see it.
Anyone tempted to make this preset "work" should change what the demo
demonstrates deliberately, not quietly.

---

## Updated 2026-09-07 — W-005 half closed: the engine reads what the console writes

The catalogue half is done. Live decisions build their `CatalogueSnapshot` from
`store.*` rather than from the fixture modules, so arbitration weights, boosts,
targeting policies, frequency caps, offers and connector activation now reach
the engine.

It was verified as broken before it was fixed, because the failure had a fully
green path: `PUT /arbitration` answered 200, persisted, audited, and updated the
formula the screen renders — and the next decision came back byte-identical.
`fixtures/engine.ts` carried a comment claiming the opposite was true.

**What came with it, necessarily.** A `DecisionRecord` keeps
`catalogueSnapshotHash` and never the catalogue. Once the catalogue is editable,
replay has to fetch the one the decision names or it answers a different
question. `mocks/catalogue-state.ts` keeps every distinct catalogue by hash and
`POST /decisions/{id}/replay` returns **409 `catalogue_unavailable`** rather
than replaying against a substitute. The fixture catalogue is registered at
startup so the 5,000 seeded decisions stay replayable.

**Still open, and this is the remaining half of W-005:**

- **Creating an offer still does not make it decidable.** A flow's candidate set
  is `candidateKeys` on the artifact — a fixed list — so a new offer is not a
  candidate until a flow names it. Editing an *existing* offer now does affect
  decisions; creating a new one does not. Closing this needs flow authoring, not
  more catalogue work.
- **Flows, policies, frequency caps, boosts and the taxonomy are still FIXTURE
  for create and edit.** The engine now reads the store; the console still has
  no screen that writes to most of it.
- **Replay of a live decision is not byte-identical**, and this is unchanged and
  unrelated: resolution adds connector fields (`marketingConsent`,
  `profilingConsent`) that a replay caller cannot reconstruct, so the only diff
  is `$.inputSnapshotHash`. Seeded decisions, whose inputs are baked in, replay
  `identical: true`.

See `docs/review/PLATFORM_DIRECTION.md` for what this unblocks and in what order.

---

## Updated 2026-09-07 — targeting policies are authored from the screen

Phase C recorded targeting policies as `FIXTURE` for create and edit. They now
have a write path: `POST /targeting-policies/{tenantId}` and
`PUT /targeting-policies/{tenantId}/{policyId}`, gated on `edit:policies` —
which the fixtures give to compliance and the administrator, and deliberately
not to the decision architect.

The editor is a picker over the data model rather than a text field, and that
is the point rather than a nicety. `PolicyCondition.field` was a free-text
dotted path, and one character wrong in a leaf did not error — it decided.

Three controls, each derived from the one before:

1. **Field** — a list built from `getProfileSchema`. There is nowhere to type a
   path, so the demonstrated defect is unrepresentable rather than merely
   rejected.
2. **Operator** — the set the server sent for that field's type. `contains`
   cannot appear on a number.
3. **Value** — typed, and an enum renders its declared members, so `passed`
   cannot be written where the model says `pass`.

The server checks the same rules again through `conditionProblems`. The editor
cannot be the only guard: the API is reachable without it.

**Still `FIXTURE` for create and edit:** decision flows and their nodes,
frequency caps, boosts, the taxonomy, and the data model itself. The model is
served and browsable at `/data-model`; editing it is the next surface owed.

**Not yet resolved by any of this:** creating an offer still does not make it
decidable, because a flow's candidate set is a fixed `candidateKeys` list. That
needs flow authoring.

---

## Registered 2026-09-07 — creating a policy does not make it apply

Found while wiring rollups into a decision, by writing a test that assumed
otherwise and watching it fail.

The engine evaluates only the policies a flow node names in `policyIds`. A
policy created through `POST /targeting-policies` is stored, is audited, and
reaches the catalogue the engine reads — and is then evaluated by nothing,
because no node references it.

This is the same shape as `candidateKeys` for offers, and it has the same fix:
flow authoring. Until then the write path is real and the effect is not, which
is precisely the class of defect this codebase keeps finding, so it is held by
an assertion rather than left to be discovered in a demonstration —
`aggregation-decision.test.ts`, "a policy nobody attached". That test creates a
policy that would refuse every candidate and asserts the candidates survive.
When flow authoring lands it should become the opposite assertion.

**What does work today:** editing an existing policy that a node already names.
That reaches the engine, and the rollup tests use it.

---

## Registered 2026-09-07 — intake holds customer records, and ADR-004 is still Proposed

`/data-model/intake` lands rows, maps them onto the model, validates and
activates. The landed rows are customer records in their original shape, which
is the one thing the platform has so far refused to retain — a `DecisionRecord`
keeps `inputSnapshotHash` and never the values, precisely so a trace can be kept
without the data it was made from.

So the shape of what is held is deliberately conservative, and none of it is a
substitute for the decision:

- **Memory only.** `store.landedRows` is a `Map`, never written to disk, and a
  restart clears it.
- **Bounded.** `MAX_LANDED_ROWS` is 5,000 per source, so a bad import is finite
  rather than somebody else's problem later.
- **Classified.** Every field the model declares carries `sensitivity`
  (`none | personal | special_category`), recorded at declaration time — which
  ADR-004 itself argues is far cheaper than classifying a populated store.

**What is still owed, and this is the whole entry:** durable storage, an
erasure path, and a retention period. ADR-004 proposes crypto-shredding —
encrypt per subject, destroy the key on erasure, let a replay of an erased
subject fail explicitly rather than return a decision computed from nulls. None
of that is built. Nothing here should be pointed at a real customer file until
it is.

The stage after this one is the profile store, and it is the stage that makes
retention unavoidable. The order is deliberate: schema, mapping and validation
all landed without retaining anything, so the decision can still be taken
before it is expensive.

---

## Resolved 2026-09-07 — a created offer is decidable, and a created policy runs

Both gaps registered earlier today are closed by flow authoring, and both for
the same reason: the missing step was never the write path, it was that nothing
could attach the new object to a flow.

- **Candidate offers** are edited on the flow page. An offer absent from the
  list is still never a candidate — that has not changed and should not — but
  the list is now something a person can change.
- **Policies bind to nodes.** A filter or constraint node names the policies it
  applies, and the engine has always evaluated only those.

`flow-authoring.test.ts` walks the whole chain for each: create the offer,
give it a creative, add it to the candidate set, publish, promote, decide — and
the same for a policy that suppresses everything. The compiler refused the
first attempt with `NO_DELIVERABLE_CREATIVE`, which is the gate working, so the
test walks the real path rather than routing around it.

**What did not change, deliberately.** Saving a graph changes no decision.
Decisions run the version promoted to an environment, so an edit reaches them
through compile, publish and promote — three separate steps with two separate
permissions. `an edit reaches decisions only through publish and promote`
pins it, and if that test ever fails the console has quietly become a deploy
button.

**Found while doing it:** `publishArtifact` compiled against the *fixture*
compile context, so an offer or policy created through the console was
invisible to the compiler at publish time — a flow naming one would have been
rejected for referencing something that, as far as the compiler could see, did
not exist. Same seam as the catalogue and the artifacts, in the place it would
have been hardest to notice. `currentCompileContext()` now builds it from the
store, and publish and the draft save share it so they cannot disagree.

**Still FIXTURE for create and edit:** the taxonomy, frequency caps, boosts,
and the data model itself. Flows, offers, creatives, policies, connectors,
arbitration weights, autonomy and data sources are all editable from the screen.

---

## Registered 2026-09-07 — the trace accessibility test asserts an arbitrary trace

`accessibility.spec.ts` opens `/decisions` and clicks the first row, so which
trace it checks depends on which decision sorts first — and that depends on
what other specs have left in the process-wide store. It failed twice and
passed twice across four runs on 2026-09-07 while flow authoring was being
built, and the violation text was not captured on any of them.

Two things are wrong with it and neither is the page:

1. **The subject is not pinned.** A test that checks "some trace" cannot tell
   you which trace is broken, and a red run cannot be reproduced from the
   failure alone. It should open a named seeded decision.
2. **The store is shared.** Specs that create decisions change what this test
   looks at, so it is coupled to test execution order.

Not fixed here because the fix is a change to a shared gate and this was found
in the middle of unrelated work; recorded so the next red run is understood
rather than re-diagnosed. Every other route in the sweep — 44 of 45, both
themes — passes consistently.

---

## Resolved 2026-09-07 — outcomes are read

`POST /outcomes` had written to a store nothing read since the ledger existed,
so the platform could say what it decided and never whether it worked.
`GET /performance/{tenantId}` joins them, and `/performance` renders it.

Counting only. Attribution modelling, uplift and incrementality are statistical
claims that would be unfalsifiable inside a platform whose selling point is
that every number is traceable to its source, so they are deliberately absent
and the page says so.

**Two defects found by looking at the rendered page rather than the tests.**

1. **Rates were over offers, not observations.** The first version divided 0
   acceptances by 146 offers and printed `0.0%`, which reads as "we measured and
   nobody took it" when the truth was that no channel had reported anything.
   The denominator is now decisions with an outcome, coverage is shown beside
   it, and a row nobody reported on shows a dash.
2. **`POST /outcomes` refused a seeded decision while `GET` accepted one.** The
   five thousand decisions the console displays could be read for outcomes and
   never given one, so the measurement loop could not be exercised against any
   of them. The route now materialises a seeded decision into the ledger on its
   first outcome, which keeps the ledger's invariant — an outcome always joins
   to a decision — without paying for five thousand inserts nobody may measure.

**Known and deliberate:** the report fetches outcomes one decision at a time.
Correct and slow, and the right shape to replace with a join when there is a
store that can do one. An approximation would have been a number nobody could
check.

**Still absent:** experiments and holdouts, volume and budget constraints, a
model registry behind the scoring seam, and channel adapters. Nothing sends an
outcome yet (W-017), which is why every rate on the page is currently a dash.

---

## Registered 2026-09-07 — experiments, and a plane asymmetry they extend

`/experiments` assigns arms and holdouts. An arm is a pure function of the
customer reference: nothing stores it, and it is recomputed from a decision
record months later. That is what lets this platform answer "which arm was this
customer in" for a decision made before the experiment ended, which most cannot
— their assignment lived in a service that has since rebalanced.

No engine change was needed. An arm reaches a policy as an ordinary field at
`experiments.<key>`, so a holdout is an eligibility rule that refuses when the
arm is the untreated one, written in the same editor as every other rule.

**A running experiment is frozen, and that is the feature.** Recoverability
depends on the assignment function being stable, so reweighting a live split
would make every recomputed arm disagree with the one that actually applied and
the trace would confidently report the wrong arm. Arms and key are editable in
`draft` only; stopping and starting another is the supported way to change a
split, which is what anybody running a real test would do anyway.

**The asymmetry this extends.** Assignment happens in the console's decision
path, beside integration resolution, and `engines/kotlin` does neither. So a
request that omits `experiments.*` gets an arm from the console and not from the
JVM service, exactly as it gets connector fields from one and not the other.
The existing entry above records the resolution half; this is the same boundary.

It was found rather than reasoned about: the fixtures originally seeded a
*running* experiment, and the cross-engine hash test went red immediately —
a running experiment adds a field to every decision's hashed input. Correct for
an experiment somebody started, and precisely the wrong thing for a fixture to
do on everybody's behalf. Both seeds are now draft or stopped, and starting one
is a deliberate act with a visible consequence.

**Not built:** significance testing. Reporting a p-value or a confidence
interval would be a statistical claim of exactly the kind this platform refuses
to make without showing the workings. Per-arm counts and rates are there; what
to conclude from them is not the platform's to assert.
