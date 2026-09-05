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
| Built, served, and contract-tested | 26 |
| Declared and marked `proposed` | 8 |
| Wanted but not yet in the spec | see persona sections below |

---

## Build-system gaps

Not platform APIs, but the same kind of problem: a check that appears to run
and does not.

| Gap | Registered | Notes |
|---|---|---|
| **Project references do not build** | 2026-09-04, re-diagnosed 2026-09-05 | The original cause is gone: `packages/compiler/src/compile.ts` was deleted with the rest of the Phase 0 tree. `tsc --build` still fails, on two causes that were hidden underneath it — the per-package tsconfigs have no `@metis/core/domain` path mapping (only `packages/registry`'s does), and `bench/harness` declares a `rootDir` of `bench/harness/src` that its own `@metis/runtime` imports fall outside. Until this is fixed the per-package tsconfigs cannot be used for typechecking, and `bench/*` is checked by nothing. |
| **The Kotlin conformance gate could pass without reading the corpus** | 2026-09-05, fixed same day | The tests read `docs/conformance/*.json` by path at runtime, so Gradle had no input dependency on them: after regenerating a corpus, `./gradlew test` reported `UP-TO-DATE` and passed. Fixed by declaring the corpora as `tasks.test` inputs in both modules. Kept here as a record, because the same shape recurs — a check whose real input is invisible to the thing that decides whether to run it. |
| **Four components agree on API paths, and one typecheck covers one of them** | 2026-09-05 | The spec, the generated client, `apps/console/lib/api-client.ts` (hand-written template URLs), the dev API route handler (a string switch) and the Kotlin service router (another string switch) must all agree. Only the generated client is type-checked. `contract.spec.ts` covers the spec-versus-dev-API pair at E2E time and does bite — verified by pointing a spec path at an unserved route — but the console's own client URLs and the Kotlin router are checked by nothing. |
| **The root typecheck checks zero files** | 2026-09-04 | The root tsconfig has `"include": []` and only references, and `tsc --noEmit -p` does not build references. CI now also runs the console's typecheck, which resolves `@metis/core`, `@metis/runtime` and `@metis/compiler` through path aliases and is what actually covers them. `bench/*` is still outside every working typecheck — the missing `connectors` field on its catalogue was caught by a failing benchmark, not by the compiler. |

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
| `getShadowModeAgreement` | Shadow mode scoreboard | MISSING | Week 4 | Agreement with incumbent, disagreement analysis, estimated lift. |

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

